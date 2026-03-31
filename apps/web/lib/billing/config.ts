export const AUTUMN_AI_CREDITS_FEATURE_ID = "ai_credits"
export const AUTUMN_INTEGRATION_EVENTS_FEATURE_ID = "integration_events"

export const AUTUMN_AI_INPUT_FEATURE_BY_MODEL = {
  "google/gemma-3-27b-it": "ai_gemma_3_27b_input_tokens",
  "anthropic/claude-haiku-4.5": "ai_claude_haiku_4_5_input_tokens",
} as const

export const AUTUMN_AI_OUTPUT_FEATURE_BY_MODEL = {
  "google/gemma-3-27b-it": "ai_gemma_3_27b_output_tokens",
  "anthropic/claude-haiku-4.5": "ai_claude_haiku_4_5_output_tokens",
} as const

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

export const AUTUMN_BILLING_PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 8,
    aiBudget: 8,
    eventLimit: 1500,
  },
  {
    id: "plus",
    name: "Plus",
    price: 20,
    aiBudget: 20,
    eventLimit: 5000,
  },
  {
    id: "scale",
    name: "Scale",
    price: 40,
    aiBudget: 45,
    eventLimit: 20000,
  },
] as const

export const AUTUMN_EVENT_OVERAGE_PRICE = 0.001
export const BILLING_RECORD_PAGE_SIZE = 100
export const BILLING_RANGE = "last_cycle" as const
export const BILLING_BIN_SIZE = "day" as const

export function getAutumnCustomerId(workspaceId: string) {
  return `workspace:${workspaceId}`
}

export function isTrackedAiModel(model: string): model is TrackedAiModel {
  return AUTUMN_TRACKED_AI_MODELS.includes(model as TrackedAiModel)
}

export function getAiUsageFeatureIds(model: TrackedAiModel) {
  return {
    input: AUTUMN_AI_INPUT_FEATURE_BY_MODEL[model],
    output: AUTUMN_AI_OUTPUT_FEATURE_BY_MODEL[model],
  }
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

export function getTokenDirection(featureId: string) {
  if (featureId.includes("_input_")) return "input"
  if (featureId.includes("_output_")) return "output"
  return null
}

export function getModelFromFeatureId(featureId: string): TrackedAiModel | null {
  switch (featureId) {
    case AUTUMN_AI_INPUT_FEATURE_BY_MODEL["google/gemma-3-27b-it"]:
    case AUTUMN_AI_OUTPUT_FEATURE_BY_MODEL["google/gemma-3-27b-it"]:
      return "google/gemma-3-27b-it"
    case AUTUMN_AI_INPUT_FEATURE_BY_MODEL["anthropic/claude-haiku-4.5"]:
    case AUTUMN_AI_OUTPUT_FEATURE_BY_MODEL["anthropic/claude-haiku-4.5"]:
      return "anthropic/claude-haiku-4.5"
    default:
      return null
  }
}

export function formatTrackedModelName(model: TrackedAiModel) {
  switch (model) {
    case "google/gemma-3-27b-it":
      return "Gemma 3 27b"
    case "anthropic/claude-haiku-4.5":
      return "Claude Haiku 4.5"
  }
}

export function getPlanCopy(planId: string, price?: number | null) {
  const fallbackPlan = AUTUMN_BILLING_PLANS.find((plan) => plan.id === planId) ?? null
  if (!fallbackPlan) {
    return {
      name: planId,
      price: price ?? 0,
      aiBudget: 0,
      eventLimit: 0,
      features: [],
    }
  }

  const displayPrice = price ?? fallbackPlan.price

  return {
    name: fallbackPlan.name,
    price: displayPrice,
    aiBudget: fallbackPlan.aiBudget,
    eventLimit: fallbackPlan.eventLimit,
    features: [
      `$${fallbackPlan.aiBudget} AI budget / month`,
      `Up to ${fallbackPlan.eventLimit.toLocaleString()} events ingested`,
      "Overages auto-charged",
    ],
  }
}

export function getCurrentMonthLabel(timestamp = Date.now()) {
  return new Date(timestamp).toLocaleString("default", { month: "long" })
}
