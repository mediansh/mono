export const AUTUMN_AI_USAGE_FEATURE_ID = "ai_usage"
export const AUTUMN_EVENTS_FEATURE_ID = "events"

export const AUTUMN_TRACKED_AI_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b",
  "z-ai/glm-4.7",
] as const

export type TrackedAiModel = (typeof AUTUMN_TRACKED_AI_MODELS)[number]

export const AI_TOKEN_PRICING_PER_MILLION: Record<
  TrackedAiModel,
  { input: number; output: number }
> = {
  "nvidia/nemotron-3-super-120b-a12b": {
    input: 0.2,
    output: 1,
  },
  "z-ai/glm-4.7": {
    input: 1.2,
    output: 8,
  },
}

export const STARTER_TRIAL_DAYS = 7

export const AUTUMN_BILLING_PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 4.99,
    aiBudget: 5,
    eventLimit: 500,
    trialDays: STARTER_TRIAL_DAYS,
  },
  {
    id: "plus",
    name: "Plus",
    price: 9.99,
    aiBudget: 10,
    eventLimit: 1000,
  },
  {
    id: "scale",
    name: "Scale",
    price: 19.99,
    aiBudget: 20,
    eventLimit: 2000,
  },
] as const

export const AUTUMN_EVENT_OVERAGE_PRICE = 0.015
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
    case "nvidia/nemotron-3-super-120b-a12b":
      return "NVIDIA Nemotron 3 Super 120B A12B"
    case "z-ai/glm-4.7":
      return "Z.AI GLM-4.7"
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
      trialDays: 0,
      features: [],
    }
  }

  const displayPrice = price ?? fallbackPlan.price

  const trialDays =
    "trialDays" in fallbackPlan ? (fallbackPlan as { trialDays?: number }).trialDays ?? 0 : 0

  return {
    name: fallbackPlan.name,
    price: displayPrice,
    aiBudget: fallbackPlan.aiBudget,
    eventLimit: fallbackPlan.eventLimit,
    trialDays,
    features: [
      ...(trialDays > 0 ? [`${trialDays}-day free trial`] : []),
      `$${fallbackPlan.aiBudget} AI budget / month`,
      `${fallbackPlan.eventLimit.toLocaleString()} events included, then $0.015/event`,
      "Overages auto-charged",
      ...(fallbackPlan.id === "scale" ? ["Priority support"] : []),
    ],
  }
}

export function getCurrentMonthLabel(timestamp = Date.now()) {
  return new Date(timestamp).toLocaleString("default", { month: "long" })
}
