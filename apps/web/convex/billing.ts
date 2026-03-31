import { v } from "convex/values"
import {
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server"
import { internal } from "./_generated/api"
import {
  AUTUMN_AI_CREDITS_FEATURE_ID,
  AUTUMN_BILLING_PLANS,
  AUTUMN_EVENT_OVERAGE_PRICE,
  AUTUMN_INTEGRATION_EVENTS_FEATURE_ID,
  BILLING_RECORD_PAGE_SIZE,
  formatTrackedModelName,
  getAiCostForTokens,
  getCurrentMonthLabel,
  getModelFromFeatureId,
  getPlanCopy,
  getTokenDirection,
} from "../lib/billing/config"
import {
  attachWorkspacePlan,
  createBillingPortalUrl,
  loadWorkspaceBillingSnapshot,
} from "../lib/billing/autumn"
import {
  requireWorkspaceAccess,
  requireWorkspaceAdminAccess,
} from "./permissions"

type AggregateRow = {
  period: number
  values: Record<string, number>
}

type ListEvent = {
  id: string
  timestamp: number
  featureId: string
  value: number
  properties: Record<string, unknown>
}

type DashboardUsageRecord = WorkspaceBillingDashboard["usageRecords"][number]

type WorkspaceBillingContext = {
  workspaceId: string
  workspaceName: string
  canManageBilling: boolean
  user: {
    id: string
    email: string | null
  }
}

type WorkspaceBillingDashboard = {
  currentPlanId: string | null
  currentPlanName: string
  canManageBilling: boolean
  monthLabel: string
  summary: {
    aiBudget: number
    aiSpend: number
    aiRemaining: number
    aiOverage: number
    eventLimit: number
    eventUsage: number
    eventRemaining: number
    eventOverage: number
    overageTotal: number
  }
  tokens: {
    totalInput: number
    totalOutput: number
    days: Array<{
      timestamp: number
      day: string
      input: number
      output: number
    }>
  }
  events: {
    total: number
    days: Array<{
      timestamp: number
      day: string
      events: number
    }>
  }
  plans: Array<{
    id: string
    name: string
    price: number
    aiBudget: number
    eventLimit: number
    features: string[]
    eligibility: {
      attachAction: "activate" | "upgrade" | "downgrade" | "purchase" | "none"
      status: "active" | "scheduled" | null
      canceling: boolean
    }
  }>
  usageRecords: Array<{
    id: string
    type: "ai_generation" | "event_ingested" | "overage_charge" | "ai_tool_call"
    description: string
    tokens?: number
    cost?: number
    timestamp: number
  }>
}

function getActiveSubscription(customer: {
  subscriptions: Array<{
    status: string
    startedAt: number
    canceledAt: number | null
    planId: string
  }>
}) {
  return [...customer.subscriptions]
    .filter((subscription) => subscription.status === "active")
    .sort((left, right) => right.startedAt - left.startedAt)[0] ?? null
}

function getBalance(
  balances: Record<
    string,
    {
      granted: number
      usage: number
      remaining: number
    }
  >,
  featureId: string
) {
  return (
    balances[featureId] ?? {
      granted: 0,
      usage: 0,
      remaining: 0,
    }
  )
}

function normalizeAttachAction(
  attachAction: string | undefined
): "activate" | "upgrade" | "downgrade" | "purchase" | "none" {
  switch (attachAction) {
    case "upgrade":
    case "downgrade":
    case "purchase":
    case "none":
      return attachAction
    default:
      return "activate"
  }
}

function normalizePlanStatus(status: string | undefined): "active" | "scheduled" | null {
  if (status === "active" || status === "scheduled") {
    return status
  }
  return null
}

function buildUsageRecords(events: ListEvent[]) {
  const records: DashboardUsageRecord[] = []

  for (const event of events) {
    if (event.featureId === AUTUMN_INTEGRATION_EVENTS_FEATURE_ID) {
      const source =
        typeof event.properties.source === "string"
          ? event.properties.source
          : "integration"
      const eventType =
        typeof event.properties.event_type === "string"
          ? event.properties.event_type
          : null

      records.push({
        id: event.id,
        type: "event_ingested",
        description: eventType
          ? `${source} event ingested: ${eventType}`
          : `${source} event ingested`,
        timestamp: event.timestamp,
      })
      continue
    }

    const model = getModelFromFeatureId(event.featureId)
    if (!model) continue

    const direction = getTokenDirection(event.featureId)
    const feature =
      typeof event.properties.feature === "string"
        ? event.properties.feature
        : "AI usage"
    const cost =
      direction === "input"
        ? getAiCostForTokens({
            model,
            inputTokens: event.value,
          })
        : getAiCostForTokens({
            model,
            outputTokens: event.value,
          })

    records.push({
      id: event.id,
      type: feature === "task_generation" ? "ai_generation" : "ai_tool_call",
      description: `${formatTrackedModelName(model)} ${direction ?? "usage"} tokens for ${feature.replaceAll("_", " ")}`,
      tokens: event.value,
      cost,
      timestamp: event.timestamp,
    })
  }

  return records
}

export const assertWorkspaceAccess = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId)
  },
})

export const assertWorkspaceAdminAccess = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAdminAccess(ctx, args.workspaceId)
  },
})

export const getWorkspaceBillingContext = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args): Promise<WorkspaceBillingContext> => {
    const { identity, membership } = await requireWorkspaceAccess(ctx, args.workspaceId)
    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    return {
      workspaceId: workspace._id,
      workspaceName: workspace.name,
      canManageBilling: membership.role === "owner" || membership.role === "admin",
      user: {
        id: identity.subject,
        email:
          typeof identity.email === "string" && identity.email.trim().length > 0
            ? identity.email
            : null,
      },
    }
  },
})

export const getWorkspaceBillingDashboard = action({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args): Promise<WorkspaceBillingDashboard> => {
    const billingContext: WorkspaceBillingContext = await ctx.runQuery(
      internal.billing.getWorkspaceBillingContext,
      {
        workspaceId: args.workspaceId,
      }
    )

    const snapshot = await loadWorkspaceBillingSnapshot({
      workspaceId: billingContext.workspaceId,
      workspaceName: billingContext.workspaceName,
      email: billingContext.user.email,
    })

    const activeSubscription = getActiveSubscription(snapshot.customer)
    const aiBalance = getBalance(
      snapshot.customer.balances,
      AUTUMN_AI_CREDITS_FEATURE_ID
    )
    const integrationBalance = getBalance(
      snapshot.customer.balances,
      AUTUMN_INTEGRATION_EVENTS_FEATURE_ID
    )

    const aiUsageRows = snapshot.aiUsage.list as Array<AggregateRow>
    let cumulativeInput = 0
    let cumulativeOutput = 0
    const tokenSeries = aiUsageRows.map((row) => {
      const input = Object.entries(row.values).reduce((sum, [featureId, value]) => {
        const direction = getTokenDirection(featureId)
        return direction === "input" ? sum + value : sum
      }, 0)
      const output = Object.entries(row.values).reduce(
        (sum, [featureId, value]) =>
          getTokenDirection(featureId) === "output" ? sum + value : sum,
        0
      )

      cumulativeInput += input
      cumulativeOutput += output

      return {
        timestamp: row.period,
        day: new Date(row.period).getDate().toString(),
        input: cumulativeInput,
        output: cumulativeOutput,
      }
    })

    let cumulativeEvents = 0
    const eventSeries = (snapshot.integrationUsage.list as Array<AggregateRow>).map((row) => {
      const events = row.values[AUTUMN_INTEGRATION_EVENTS_FEATURE_ID] ?? 0
      cumulativeEvents += events

      return {
        timestamp: row.period,
        day: new Date(row.period).getDate().toString(),
        events: cumulativeEvents,
      }
    })

    const totalInput = cumulativeInput
    const totalOutput = cumulativeOutput
    const totalAiSpend =
      aiBalance.usage > 0
        ? aiBalance.usage
        : (Object.entries(snapshot.aiUsage.total) as Array<[string, { sum: number }]>).reduce(
            (sum, [featureId, total]) => {
              const model = getModelFromFeatureId(featureId)
              const direction = getTokenDirection(featureId)
              if (!model || !direction) return sum

              return (
                sum +
                getAiCostForTokens({
                  model,
                  inputTokens: direction === "input" ? total.sum : 0,
                  outputTokens: direction === "output" ? total.sum : 0,
                })
              )
            },
            0
          )

    const usageRecords = buildUsageRecords(
      (snapshot.recentEvents as Array<ListEvent>).slice(0, BILLING_RECORD_PAGE_SIZE)
    )

    const planOrder = new Map<string, number>(
      AUTUMN_BILLING_PLANS.map((plan, index) => [plan.id, index] as [string, number])
    )
    const plans = snapshot.plans
      .filter((plan) => planOrder.has(plan.id))
      .sort(
        (left, right) =>
          (planOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (planOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      )
      .map((plan) => {
        const planCopy = getPlanCopy(plan.id, plan.price?.amount ?? null)

        return {
          id: plan.id,
          name: planCopy.name,
          price: planCopy.price,
          aiBudget: planCopy.aiBudget,
          eventLimit: planCopy.eventLimit,
          features: planCopy.features,
          eligibility: {
            attachAction: normalizeAttachAction(
              plan.customerEligibility?.attachAction
            ),
            status: normalizePlanStatus(plan.customerEligibility?.status),
            canceling: plan.customerEligibility?.canceling ?? false,
          },
        }
      })

    return {
      currentPlanId: activeSubscription?.planId ?? null,
      currentPlanName:
        plans.find((plan) => plan.id === activeSubscription?.planId)?.name ?? "No plan",
      canManageBilling: billingContext.canManageBilling,
      monthLabel: getCurrentMonthLabel(),
      summary: {
        aiBudget: aiBalance.granted,
        aiSpend: totalAiSpend,
        aiRemaining: aiBalance.remaining,
        aiOverage: Math.max(0, totalAiSpend - aiBalance.granted),
        eventLimit: integrationBalance.granted,
        eventUsage: integrationBalance.usage,
        eventRemaining: integrationBalance.remaining,
        eventOverage: Math.max(0, integrationBalance.usage - integrationBalance.granted),
        overageTotal:
          Math.max(0, totalAiSpend - aiBalance.granted) +
          Math.max(0, integrationBalance.usage - integrationBalance.granted) *
            AUTUMN_EVENT_OVERAGE_PRICE,
      },
      tokens: {
        totalInput,
        totalOutput,
        days: tokenSeries,
      },
      events: {
        total: integrationBalance.usage,
        days: eventSeries,
      },
      plans,
      usageRecords,
    }
  },
})

export const openWorkspaceBillingPortal = action({
  args: {
    workspaceId: v.id("workspaces"),
    returnUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.billing.assertWorkspaceAdminAccess, {
      workspaceId: args.workspaceId,
    })

    const billingContext = await ctx.runQuery(
      internal.billing.getWorkspaceBillingContext,
      {
        workspaceId: args.workspaceId,
      }
    )

    const portal = await createBillingPortalUrl({
      workspaceId: billingContext.workspaceId,
      workspaceName: billingContext.workspaceName,
      email: billingContext.user.email,
      returnUrl: args.returnUrl,
    })

    return {
      url: portal.url,
    }
  },
})

export const attachWorkspaceBillingPlan = action({
  args: {
    workspaceId: v.id("workspaces"),
    planId: v.string(),
    successUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.billing.assertWorkspaceAdminAccess, {
      workspaceId: args.workspaceId,
    })

    const billingContext = await ctx.runQuery(
      internal.billing.getWorkspaceBillingContext,
      {
        workspaceId: args.workspaceId,
      }
    )

    const response = await attachWorkspacePlan({
      workspaceId: billingContext.workspaceId,
      workspaceName: billingContext.workspaceName,
      email: billingContext.user.email,
      planId: args.planId,
      successUrl: args.successUrl,
    })

    return {
      paymentUrl: response.paymentUrl,
    }
  },
})
