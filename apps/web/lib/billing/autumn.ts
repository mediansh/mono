import { Autumn } from "autumn-js"
import {
  AUTUMN_AI_USAGE_FEATURE_ID,
  AUTUMN_EVENTS_FEATURE_ID,
  BILLING_BIN_SIZE,
  BILLING_RANGE,
  BILLING_RECORD_PAGE_SIZE,
  TrackedAiModel,
  getAiCostForTokens,
  getAutumnCustomerId,
} from "./config"

let cachedClient: Autumn | null = null

function getAutumnSecretKey(): string | null {
  const secretKey = process.env.AUTUMN_SECRET_KEY
  if (!secretKey) {
    return null
  }
  return secretKey
}

export function isAutumnConfigured(): boolean {
  return getAutumnSecretKey() !== null
}

export function getAutumnClient() {
  const secretKey = getAutumnSecretKey()
  if (!secretKey) {
    throw new Error(
      "[billing] AUTUMN_SECRET_KEY is not set. Billing tracking is disabled. " +
        "Add it to .env.local (Next.js) and Convex environment variables."
    )
  }

  if (!cachedClient) {
    cachedClient = new Autumn({
      secretKey,
      retryConfig: {
        strategy: "backoff",
        backoff: {
          initialInterval: 500,
          maxInterval: 5000,
          exponent: 1.5,
          maxElapsedTime: 15000,
        },
      },
    })
  }

  return cachedClient
}

export async function ensureAutumnCustomer(args: {
  workspaceId: string
  workspaceName?: string | null
  email?: string | null
  metadata?: Record<string, unknown>
}) {
  return await getAutumnClient().customers.getOrCreate({
    customerId: getAutumnCustomerId(args.workspaceId),
    name: args.workspaceName ?? undefined,
    email: args.email ?? undefined,
    metadata: {
      workspace_id: args.workspaceId,
      workspace_name: args.workspaceName ?? undefined,
      ...args.metadata,
    },
  })
}

export async function trackAiUsage(args: {
  workspaceId: string
  workspaceName?: string | null
  email?: string | null
  model: TrackedAiModel
  inputTokens?: number
  outputTokens?: number
  properties?: Record<string, unknown>
}) {
  await ensureAutumnCustomer({
    workspaceId: args.workspaceId,
    workspaceName: args.workspaceName,
    email: args.email,
  })

  const cost = getAiCostForTokens({
    model: args.model,
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
  })

  if (cost <= 0) {
    console.warn(
      "[billing] trackAiUsage: computed cost is $0 — nothing to track",
      {
        workspaceId: args.workspaceId,
        model: args.model,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
      }
    )
    return
  }

  const customerId = getAutumnCustomerId(args.workspaceId)

  await getAutumnClient().track({
    customerId,
    featureId: AUTUMN_AI_USAGE_FEATURE_ID,
    value: cost,
    properties: {
      workspace_id: args.workspaceId,
      workspace_name: args.workspaceName ?? undefined,
      model: args.model,
      input_tokens: args.inputTokens ?? 0,
      output_tokens: args.outputTokens ?? 0,
      cost,
      ...args.properties,
    },
  })
}

export async function trackIntegrationEvent(args: {
  workspaceId: string
  workspaceName?: string | null
  source: "discord" | "slack" | "github" | "linear" | "x"
  properties?: Record<string, unknown>
}) {
  await ensureAutumnCustomer({
    workspaceId: args.workspaceId,
    workspaceName: args.workspaceName,
  })

  await getAutumnClient().track({
    customerId: getAutumnCustomerId(args.workspaceId),
    featureId: AUTUMN_EVENTS_FEATURE_ID,
    value: 1,
    properties: {
      workspace_id: args.workspaceId,
      workspace_name: args.workspaceName ?? undefined,
      source: args.source,
      ...args.properties,
    },
  })
}

export async function safeTrackAiUsage(
  args: Parameters<typeof trackAiUsage>[0]
) {
  if (!isAutumnConfigured()) {
    console.error(
      "[billing] AUTUMN_SECRET_KEY is not set — AI usage tracking skipped for workspace",
      args.workspaceId,
      "model",
      args.model
    )
    return
  }

  try {
    await trackAiUsage(args)
  } catch (error) {
    console.error(
      "[billing] Failed to track AI usage",
      {
        workspaceId: args.workspaceId,
        model: args.model,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
      },
      error
    )
  }
}

export async function safeTrackIntegrationEvent(
  args: Parameters<typeof trackIntegrationEvent>[0]
) {
  if (!isAutumnConfigured()) {
    console.error(
      "[billing] AUTUMN_SECRET_KEY is not set — integration event tracking skipped for workspace",
      args.workspaceId,
      "source",
      args.source
    )
    return
  }

  try {
    await trackIntegrationEvent(args)
  } catch (error) {
    console.error(
      "[billing] Failed to track integration event",
      {
        workspaceId: args.workspaceId,
        source: args.source,
        properties: args.properties,
      },
      error
    )
  }
}

export async function loadWorkspaceQuotaBalances(args: {
  workspaceId: string
  workspaceName?: string | null
  email?: string | null
}) {
  const customer = await ensureAutumnCustomer(args)
  return customer.balances
}

export async function loadWorkspaceBillingSnapshot(args: {
  workspaceId: string
  workspaceName?: string | null
  email?: string | null
}) {
  const customer = await ensureAutumnCustomer(args)
  const client = getAutumnClient()
  const customerId = getAutumnCustomerId(args.workspaceId)

  console.info("[billing] Loading billing snapshot", {
    customerId,
    workspaceId: args.workspaceId,
    subscriptions: customer.subscriptions?.map((s: { planId: string; status: string }) => ({
      planId: s.planId,
      status: s.status,
    })),
    balanceKeys: Object.keys(customer.balances ?? {}),
  })

  const [plans, aiUsage, eventUsage, recentEvents] = await Promise.all([
    client.plans.list({ customerId }),
    client.events.aggregate({
      customerId,
      featureId: AUTUMN_AI_USAGE_FEATURE_ID,
      range: BILLING_RANGE,
      binSize: BILLING_BIN_SIZE,
    }),
    client.events.aggregate({
      customerId,
      featureId: AUTUMN_EVENTS_FEATURE_ID,
      range: BILLING_RANGE,
      binSize: BILLING_BIN_SIZE,
    }),
    client.events.list({
      customerId,
      limit: BILLING_RECORD_PAGE_SIZE,
      offset: 0,
      customRange: {
        start:
          customer.subscriptions.find((subscription) => subscription.status === "active")
            ?.currentPeriodStart ??
          Date.now() - 30 * 24 * 60 * 60 * 1000,
        end: Date.now(),
      },
    }),
  ])

  return {
    customer,
    plans: plans.list,
    aiUsage,
    eventUsage,
    recentEvents: recentEvents.list,
  }
}

export async function createBillingPortalUrl(args: {
  workspaceId: string
  workspaceName?: string | null
  email?: string | null
  returnUrl?: string
}) {
  await ensureAutumnCustomer(args)
  return await getAutumnClient().billing.openCustomerPortal({
    customerId: getAutumnCustomerId(args.workspaceId),
    returnUrl: args.returnUrl,
  })
}

export async function attachWorkspacePlan(args: {
  workspaceId: string
  workspaceName?: string | null
  email?: string | null
  planId: string
  successUrl?: string
}) {
  await ensureAutumnCustomer(args)
  return await getAutumnClient().billing.attach({
    customerId: getAutumnCustomerId(args.workspaceId),
    planId: args.planId,
    successUrl: args.successUrl,
    redirectMode: "if_required",
  })
}

export async function attachComplimentaryWorkspacePlan(args: {
  workspaceId: string
  workspaceName?: string | null
  email?: string | null
  planId: string
  trialDays?: number
}) {
  await ensureAutumnCustomer(args)
  return await getAutumnClient().billing.attach({
    customerId: getAutumnCustomerId(args.workspaceId),
    planId: args.planId,
    redirectMode: "if_required",
    customize: {
      freeTrial: {
        durationLength: args.trialDays ?? 3650,
        durationType: "day",
        cardRequired: false,
      },
    },
  })
}

export async function cancelWorkspacePlan(args: {
  workspaceId: string
  planId: string
}) {
  return await getAutumnClient().billing.update({
    customerId: getAutumnCustomerId(args.workspaceId),
    planId: args.planId,
    cancelAction: "cancel_immediately",
  })
}
