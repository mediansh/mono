export const AUTUMN_AI_USAGE_FEATURE_ID = "ai_usage"
export const AUTUMN_EVENTS_FEATURE_ID = "events"

export const AUTUMN_TRACKED_AI_MODELS = [
  "google/gemma-3-27b-it",
  "anthropic/claude-haiku-4.5",
] as const

export type TrackedAiModel = (typeof AUTUMN_TRACKED_AI_MODELS)[number]

export const AI_TOKEN_PRICING_PER_MILLION: Record<
  TrackedAiModel,
  { input: number; output: number }
> = {
  "google/gemma-3-27b-it": {
    input: 0.2,
    output: 0.5,
  },
  "anthropic/claude-haiku-4.5": {
    input: 5,
    output: 10,
  },
}

/** Plan IDs in display order — source of truth for limits is Autumn. */
export const AUTUMN_BILLING_PLAN_ORDER = ["starter", "plus", "scale"] as const

/** Fallback overage price if Autumn plan items don't specify one. */
export const AUTUMN_EVENT_OVERAGE_PRICE_FALLBACK = 0.015

// ---------------------------------------------------------------------------
// Autumn plan item types (subset of the plans.list response shape)
// ---------------------------------------------------------------------------

export type AutumnPlanItem = {
  featureId: string
  included: number
  unlimited: boolean
  price?: {
    amount?: number
    billingUnits?: number
  } | null
}

/**
 * Extract AI budget, event limit, and overage pricing from Autumn plan items.
 * Returns concrete numbers that drive both the UI and the overage calculation.
 */
export function extractPlanEntitlements(items: AutumnPlanItem[]) {
  let aiBudget = 0
  let aiBudgetUnlimited = false
  let eventLimit = 0
  let eventLimitUnlimited = false
  let eventOveragePrice = AUTUMN_EVENT_OVERAGE_PRICE_FALLBACK

  for (const item of items) {
    if (item.featureId === AUTUMN_AI_USAGE_FEATURE_ID) {
      aiBudgetUnlimited = item.unlimited
      aiBudget = item.included
    } else if (item.featureId === AUTUMN_EVENTS_FEATURE_ID) {
      eventLimitUnlimited = item.unlimited
      eventLimit = item.included
      if (item.price?.amount != null && item.price.billingUnits) {
        eventOveragePrice = item.price.amount / item.price.billingUnits
      }
    }
  }

  return { aiBudget, aiBudgetUnlimited, eventLimit, eventLimitUnlimited, eventOveragePrice }
}

/**
 * Build a human-readable feature list for a plan card from its entitlements.
 */
export function buildPlanFeatures(args: {
  planId: string
  aiBudget: number
  aiBudgetUnlimited: boolean
  eventLimit: number
  eventLimitUnlimited: boolean
  eventOveragePrice: number
}) {
  const features: string[] = []

  if (args.aiBudgetUnlimited) {
    features.push("Unlimited AI budget")
  } else if (args.aiBudget > 0) {
    features.push(`$${args.aiBudget} AI budget / month`)
  }

  if (args.eventLimitUnlimited) {
    features.push("Unlimited events included")
  } else if (args.eventLimit > 0) {
    features.push(
      `${args.eventLimit.toLocaleString()} events included, then $${args.eventOveragePrice}/event`
    )
  }

  features.push("Overages auto-charged")

  if (args.planId === "scale") {
    features.push("Priority support")
  }

  return features
}

export const BILLING_RECORD_PAGE_SIZE = 100
export const BILLING_RANGE = "last_cycle" as const
export const BILLING_BIN_SIZE = "day" as const

export function getAutumnCustomerId(workspaceId: string) {
  const normalizedWorkspaceId = workspaceId
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return `workspace-${normalizedWorkspaceId}`
}

export function isTrackedAiModel(model: string): model is TrackedAiModel {
  return AUTUMN_TRACKED_AI_MODELS.includes(model as TrackedAiModel)
}

export function getAiCostForTokens(args: {
  model: TrackedAiModel
  inputTokens?: number
  outputTokens?: number
}) {
  const pricing = AI_TOKEN_PRICING_PER_MILLION[args.model]
  const inputTokens = args.inputTokens ?? 0
  const outputTokens = args.outputTokens ?? 0

  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  )
}

export function formatTrackedModelName(model: TrackedAiModel) {
  switch (model) {
    case "google/gemma-3-27b-it":
      return "Gemma 3 27b"
    case "anthropic/claude-haiku-4.5":
      return "Claude Haiku 4.5"
  }
}

export function getCurrentMonthLabel(timestamp = Date.now()) {
  return new Date(timestamp).toLocaleString("default", { month: "long" })
}
