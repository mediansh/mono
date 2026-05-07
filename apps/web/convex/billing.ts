import { v } from "convex/values"
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server"
import { internal } from "./_generated/api"
import {
  AUTUMN_BILLING_PLANS,
  AUTUMN_CREDITS_FEATURE_ID,
  getCurrentMonthLabel,
  getPlanCopy,
  isFreePlan,
  planAllowsOverages,
} from "../lib/billing/config"
import {
  attachWorkspacePlan,
  createBillingPortalUrl,
  ensureAutumnCustomer,
  isAutumnConfigured,
  loadWorkspaceBillingSnapshot,
  loadWorkspaceQuotaBalances,
} from "../lib/billing/autumn"
import {
  requireWorkspaceAccess,
  requireWorkspaceAdminAccess,
} from "./permissions"

type AggregateRow = {
  period: number
  values: Record<string, number>
}

type WorkspaceBillingContext = {
  workspaceId: string
  workspaceName: string
  canManageBilling: boolean
  disableOveragesWhenExhausted: boolean
  currentPlanId: string | null
  user: {
    id: string
    email: string | null
  }
}

export type WorkspaceQuotaStatus = {
  overagesDisabled: boolean
  creditsExhausted: boolean
}

type WorkspaceBillingDashboard = {
  currentPlanId: string | null
  currentPlanName: string
  canManageBilling: boolean
  isLegacyBilling: boolean
  disableOveragesWhenExhausted: boolean
  overagesToggleLocked: boolean
  monthLabel: string
  cycleStart: number | null
  cycleEnd: number | null
  summary: {
    creditsBudget: number
    creditsUsed: number
    creditsRemaining: number
    creditsOverage: number
    aiSpend: number
    aiCalls: number
    eventCount: number
    eventCost: number
  }
  credits: {
    total: number
    budget: number
    days: Array<{
      timestamp: number
      day: string
      credits: number
      cumulative: number
    }>
  }
  plans: Array<{
    id: string
    name: string
    price: number
    credits: number
    trialDays: number
    features: string[]
    hasPrioritySupport: boolean
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
    currentPeriodStart?: number | null
    currentPeriodEnd?: number | null
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

function getDisplayCents(amount: number) {
  return Math.round(amount * 100)
}

function getEventCostForSummary(args: {
  eventCount: number
  eventCost: number
  totalCredits: number
  aiSpend: number
}) {
  const eventCost = Math.max(0, args.eventCost)
  if (args.eventCount <= 0) {
    return eventCost
  }

  const totalCents = getDisplayCents(args.totalCredits)
  const aiCents = getDisplayCents(args.aiSpend)
  const eventCents = getDisplayCents(eventCost)

  if (eventCost > 0 && aiCents + eventCents === totalCents) {
    return eventCost
  }

  return Math.max(0, totalCents - aiCents) / 100
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

    const currentPlanId = workspace.currentPlanId ?? null
    return {
      workspaceId: workspace._id,
      workspaceName: workspace.name,
      canManageBilling: membership.role === "owner" || membership.role === "admin",
      disableOveragesWhenExhausted:
        !planAllowsOverages(currentPlanId) ||
        (workspace.disableOveragesWhenExhausted ?? false),
      currentPlanId,
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

export const getWorkspaceOverageSettings = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    workspaceId: string
    workspaceName: string
    disableOveragesWhenExhausted: boolean
    currentPlanId: string | null
  } | null> => {
    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) {
      return null
    }

    const currentPlanId = workspace.currentPlanId ?? null
    // Free-tier workspaces always hard-cap at the included credits — they
    // never get billed overages, regardless of the user-facing toggle.
    const overagesDisabled =
      !planAllowsOverages(currentPlanId) ||
      (workspace.disableOveragesWhenExhausted ?? false)

    return {
      workspaceId: workspace._id,
      workspaceName: workspace.name,
      disableOveragesWhenExhausted: overagesDisabled,
      currentPlanId,
    }
  },
})

export const getWorkspacePlanSettings = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    workspaceId: string
    workspaceName: string
    hasActivePlan: boolean
    currentPlanId: string | null
  } | null> => {
    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) {
      return null
    }

    return {
      workspaceId: workspace._id,
      workspaceName: workspace.name,
      hasActivePlan: workspace.hasActivePlan === true,
      currentPlanId: workspace.currentPlanId ?? null,
    }
  },
})

export const saveWorkspacePlanStatus = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    hasActivePlan: v.boolean(),
    currentPlanId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.workspaceId, {
      hasActivePlan: args.hasActivePlan,
      currentPlanId: args.currentPlanId,
      planStatusCheckedAt: Date.now(),
    })
  },
})

export const setWorkspaceDisableOverages = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    disableOveragesWhenExhausted: v.boolean(),
  },
  handler: async (ctx, args): Promise<{ disableOveragesWhenExhausted: boolean }> => {
    await requireWorkspaceAdminAccess(ctx, args.workspaceId)
    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    // Free-tier workspaces have overages permanently disabled and cannot
    // toggle paid overages on without upgrading.
    if (isFreePlan(workspace.currentPlanId ?? null) && !args.disableOveragesWhenExhausted) {
      throw new Error(
        "Free plan does not support paid overages. Upgrade your plan to enable overages."
      )
    }

    await ctx.db.patch(args.workspaceId, {
      disableOveragesWhenExhausted: args.disableOveragesWhenExhausted,
    })
    return {
      disableOveragesWhenExhausted: args.disableOveragesWhenExhausted,
    }
  },
})

async function computeWorkspaceQuotaStatus(settings: {
  workspaceId: string
  workspaceName: string
  disableOveragesWhenExhausted: boolean
}): Promise<WorkspaceQuotaStatus> {
  if (!settings.disableOveragesWhenExhausted) {
    return { overagesDisabled: false, creditsExhausted: false }
  }

  if (!isAutumnConfigured()) {
    // Local dev with no Autumn configured — never block ingest or generation.
    return { overagesDisabled: true, creditsExhausted: false }
  }

  try {
    const balances = await loadWorkspaceQuotaBalances({
      workspaceId: settings.workspaceId,
      workspaceName: settings.workspaceName,
    })

    const creditsBalance = balances[AUTUMN_CREDITS_FEATURE_ID] ?? null

    return {
      overagesDisabled: true,
      creditsExhausted:
        creditsBalance !== null && creditsBalance.remaining <= 0,
    }
  } catch (error) {
    console.error(
      "[billing] Failed to load quota snapshot — failing open",
      { workspaceId: settings.workspaceId },
      error
    )
    return { overagesDisabled: true, creditsExhausted: false }
  }
}

export const getWorkspaceQuotaStatus = action({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args): Promise<WorkspaceQuotaStatus> => {
    // Public action — gate via workspace membership before reading billing state.
    await ctx.runMutation(internal.billing.assertWorkspaceAccess, {
      workspaceId: args.workspaceId,
    })

    const settings = await ctx.runQuery(internal.billing.getWorkspaceOverageSettings, {
      workspaceId: args.workspaceId,
    })

    if (!settings) {
      return { overagesDisabled: false, creditsExhausted: false }
    }

    return await computeWorkspaceQuotaStatus(settings)
  },
})

export const getWorkspaceQuotaStatusInternal = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args): Promise<WorkspaceQuotaStatus> => {
    const settings = await ctx.runQuery(internal.billing.getWorkspaceOverageSettings, {
      workspaceId: args.workspaceId,
    })

    if (!settings) {
      return { overagesDisabled: false, creditsExhausted: false }
    }

    return await computeWorkspaceQuotaStatus(settings)
  },
})

export const getWorkspacePlanStatus = action({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args): Promise<{ hasActivePlan: boolean; currentPlanId: string | null }> => {
    const billingContext: WorkspaceBillingContext = await ctx.runQuery(
      internal.billing.getWorkspaceBillingContext,
      { workspaceId: args.workspaceId }
    )

    const customer = await ensureAutumnCustomer({
      workspaceId: billingContext.workspaceId,
      workspaceName: billingContext.workspaceName,
      email: billingContext.user.email,
    })

    const activeSubscription = getActiveSubscription(customer)
    const status = {
      hasActivePlan: activeSubscription !== null,
      currentPlanId: activeSubscription?.planId ?? null,
    }

    await ctx.runMutation(internal.billing.saveWorkspacePlanStatus, {
      workspaceId: args.workspaceId,
      hasActivePlan: status.hasActivePlan,
      currentPlanId: status.currentPlanId ?? undefined,
    })

    return status
  },
})

export const getWorkspacePlanStatusInternal = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args): Promise<{ hasActivePlan: boolean; currentPlanId: string | null }> => {
    const settings = await ctx.runQuery(internal.billing.getWorkspacePlanSettings, {
      workspaceId: args.workspaceId,
    })

    if (!settings) {
      return { hasActivePlan: false, currentPlanId: null }
    }

    if (!isAutumnConfigured()) {
      // Local dev with no Autumn configured — never block feedback processing.
      return {
        hasActivePlan: true,
        currentPlanId: settings.currentPlanId,
      }
    }


    const customer = await ensureAutumnCustomer({
      workspaceId: settings.workspaceId,
      workspaceName: settings.workspaceName,
    })
    const activeSubscription = getActiveSubscription(customer)
    const status = {
      hasActivePlan: activeSubscription !== null,
      currentPlanId: activeSubscription?.planId ?? null,
    }

    await ctx.runMutation(internal.billing.saveWorkspacePlanStatus, {
      workspaceId: args.workspaceId,
      hasActivePlan: status.hasActivePlan,
      currentPlanId: status.currentPlanId ?? undefined,
    })

    return status
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
    const creditsBalance = getBalance(
      snapshot.customer.balances,
      AUTUMN_CREDITS_FEATURE_ID
    )

    // Daily credits consumed from Autumn aggregate.
    const creditRows = snapshot.creditsUsage.list as Array<AggregateRow>
    let cumulativeCredits = 0
    const creditSeries = creditRows.map((row) => {
      const dayCost = row.values[AUTUMN_CREDITS_FEATURE_ID] ?? 0
      cumulativeCredits += dayCost
      return {
        timestamp: row.period,
        day: new Date(row.period).getDate().toString(),
        credits: dayCost,
        cumulative: cumulativeCredits,
      }
    })

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
          credits: planCopy.credits,
          trialDays: planCopy.trialDays,
          features: planCopy.features,
          hasPrioritySupport: planCopy.features.some((feature) =>
            feature.toLowerCase().includes("priority support")
          ),
          eligibility: {
            attachAction: normalizeAttachAction(
              plan.customerEligibility?.attachAction
            ),
            status: normalizePlanStatus(plan.customerEligibility?.status),
            canceling: plan.customerEligibility?.canceling ?? false,
          },
        }
      })

    const totalCredits = creditsBalance.usage > 0 ? creditsBalance.usage : 0
    const aiSpend = snapshot.usageSummary.ai.sum
    const aiCalls = snapshot.usageSummary.ai.count
    const eventCount = snapshot.usageSummary.events.count
    const eventCost = getEventCostForSummary({
      eventCount,
      eventCost: snapshot.usageSummary.events.sum,
      totalCredits,
      aiSpend,
    })

    const resolvedPlanId = activeSubscription?.planId ?? null
    const isLegacyBilling = activeSubscription === null && billingContext.currentPlanId !== null
    return {
      currentPlanId: resolvedPlanId,
      currentPlanName:
        plans.find((plan) => plan.id === resolvedPlanId)?.name ??
        (isLegacyBilling ? "Legacy billing" : "No plan"),
      canManageBilling: billingContext.canManageBilling,
      isLegacyBilling,
      disableOveragesWhenExhausted:
        !planAllowsOverages(resolvedPlanId) ||
        billingContext.disableOveragesWhenExhausted,
      overagesToggleLocked: !planAllowsOverages(resolvedPlanId),
      monthLabel: getCurrentMonthLabel(),
      cycleStart: activeSubscription?.currentPeriodStart ?? null,
      cycleEnd: activeSubscription?.currentPeriodEnd ?? null,
      summary: {
        creditsBudget: creditsBalance.granted,
        creditsUsed: totalCredits,
        creditsRemaining: Math.max(0, creditsBalance.remaining),
        creditsOverage: Math.max(0, totalCredits - creditsBalance.granted),
        aiSpend,
        aiCalls,
        eventCount,
        eventCost,
      },
      credits: {
        total: totalCredits,
        budget: creditsBalance.granted,
        days: creditSeries,
      },
      plans,
      usageRecords: [],
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
