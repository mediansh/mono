import { Autumn } from "autumn-js"
import {
  AUTUMN_INTEGRATION_EVENTS_FEATURE_ID,
  BILLING_BIN_SIZE,
  BILLING_RANGE,
  BILLING_RECORD_PAGE_SIZE,
  TrackedAiModel,
  getAiUsageFeatureIds,
  getAutumnCustomerId,
} from "./config"

let cachedClient: Autumn | null = null

function getAutumnSecretKey() {
  const secretKey = process.env.AUTUMN_SECRET_KEY
  if (!secretKey) {
    throw new Error("Missing AUTUMN_SECRET_KEY")
  }
  return secretKey
}

export function getAutumnClient() {
  if (!cachedClient) {
    cachedClient = new Autumn({
      secretKey: getAutumnSecretKey(),
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

  const features = getAiUsageFeatureIds(args.model)
  const tasks: Promise<unknown>[] = []

  if ((args.inputTokens ?? 0) > 0) {
    tasks.push(
      getAutumnClient().track({
        customerId: getAutumnCustomerId(args.workspaceId),
        featureId: features.input,
        value: args.inputTokens,
        properties: {
          workspace_id: args.workspaceId,
          workspace_name: args.workspaceName ?? undefined,
          model: args.model,
          direction: "input",
          ...args.properties,
        },
      })
    )
  }

  if ((args.outputTokens ?? 0) > 0) {
    tasks.push(
      getAutumnClient().track({
        customerId: getAutumnCustomerId(args.workspaceId),
        featureId: features.output,
        value: args.outputTokens,
        properties: {
          workspace_id: args.workspaceId,
          workspace_name: args.workspaceName ?? undefined,
          model: args.model,
          direction: "output",
          ...args.properties,
        },
      })
    )
  }

  await Promise.all(tasks)
}

export async function trackIntegrationEvent(args: {
  workspaceId: string
  workspaceName?: string | null
  source: "discord" | "github" | "linear" | "x"
  properties?: Record<string, unknown>
}) {
  await ensureAutumnCustomer({
    workspaceId: args.workspaceId,
    workspaceName: args.workspaceName,
  })

  await getAutumnClient().track({
    customerId: getAutumnCustomerId(args.workspaceId),
    featureId: AUTUMN_INTEGRATION_EVENTS_FEATURE_ID,
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
  try {
    await trackAiUsage(args)
  } catch (error) {
    console.error("[billing] Failed to track AI usage", error)
  }
}

export async function safeTrackIntegrationEvent(
  args: Parameters<typeof trackIntegrationEvent>[0]
) {
  try {
    await trackIntegrationEvent(args)
  } catch (error) {
    console.error("[billing] Failed to track integration event", error)
  }
}

export async function loadWorkspaceBillingSnapshot(args: {
  workspaceId: string
  workspaceName?: string | null
  email?: string | null
}) {
  const customer = await ensureAutumnCustomer(args)
  const client = getAutumnClient()
  const customerId = getAutumnCustomerId(args.workspaceId)

  const trackedAiFeatureIds: string[] = [
    getAiUsageFeatureIds("google/gemma-3-27b-it").input,
    getAiUsageFeatureIds("google/gemma-3-27b-it").output,
    getAiUsageFeatureIds("anthropic/claude-haiku-4.5").input,
    getAiUsageFeatureIds("anthropic/claude-haiku-4.5").output,
  ]

  const [plans, aiUsage, integrationUsage, recentEvents] = await Promise.all([
    client.plans.list({ customerId }),
    client.events.aggregate({
      customerId,
      featureId: trackedAiFeatureIds,
      range: BILLING_RANGE,
      binSize: BILLING_BIN_SIZE,
    }),
    client.events.aggregate({
      customerId,
      featureId: AUTUMN_INTEGRATION_EVENTS_FEATURE_ID,
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
    integrationUsage,
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
    redirectMode: "always",
  })
}
