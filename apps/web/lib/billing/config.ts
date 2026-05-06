export const AUTUMN_CREDITS_FEATURE_ID = "credits"

export const AUTUMN_TRACKED_AI_MODELS = [
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-sonnet-4.6",
] as const

export type TrackedAiModel = (typeof AUTUMN_TRACKED_AI_MODELS)[number]

export const AI_TOKEN_PRICING_PER_MILLION: Record<
  TrackedAiModel,
  { input: number; output: number }
> = {
  "anthropic/claude-haiku-4.5": {
    input: 2,
    output: 8,
  },
  "anthropic/claude-sonnet-4.6": {
    input: 5,
    output: 20,
  },
}

export const STARTER_TRIAL_DAYS = 7

export const FREE_PLAN_ID = "free"

// Each integration event consumes this many credits ($0.007).
export const EVENT_CREDIT_COST = 0.007

export const AUTUMN_BILLING_PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    credits: 0.5,
  },
  {
    id: "starter",
    name: "Starter",
    price: 5,
    credits: 5,
    trialDays: STARTER_TRIAL_DAYS,
  },
  {
    id: "plus",
    name: "Plus",
    price: 10,
    credits: 10,
  },
  {
    id: "scale",
    name: "Scale",
    price: 20,
    credits: 20,
  },
] as const

const PAID_PLAN_IDS: Set<string> = new Set(
  AUTUMN_BILLING_PLANS
    .filter((plan) => plan.id !== FREE_PLAN_ID)
    .map((plan) => plan.id)
)

export function isFreePlan(planId: string | null | undefined): boolean {
  return planId === FREE_PLAN_ID
}

// Free tier is restricted to the lower-cost AI tier — no advanced model access,
// and no paid overages beyond the included credits.
export function planAllowsAdvancedAi(planId: string | null | undefined): boolean {
  return typeof planId === "string" && PAID_PLAN_IDS.has(planId)
}

export function planAllowsOverages(planId: string | null | undefined): boolean {
  return typeof planId === "string" && PAID_PLAN_IDS.has(planId)
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
    case "anthropic/claude-haiku-4.5":
      return "Anthropic Claude Haiku 4.5"
    case "anthropic/claude-sonnet-4.6":
      return "Anthropic Claude Sonnet 4.6"
  }
}

export function getPlanCopy(planId: string, price?: number | null) {
  const fallbackPlan = AUTUMN_BILLING_PLANS.find((plan) => plan.id === planId) ?? null
  if (!fallbackPlan) {
    return {
      name: planId,
      price: price ?? 0,
      credits: 0,
      trialDays: 0,
      features: [],
    }
  }

  const displayPrice = price ?? fallbackPlan.price

  const trialDays =
    "trialDays" in fallbackPlan ? (fallbackPlan as { trialDays?: number }).trialDays ?? 0 : 0

  if (fallbackPlan.id === FREE_PLAN_ID) {
    return {
      name: fallbackPlan.name,
      price: displayPrice,
      credits: fallbackPlan.credits,
      trialDays: 0,
      features: [
        `$${fallbackPlan.credits.toFixed(2)} in credits / month`,
        `Standard AI model only`,
        `Events at $${EVENT_CREDIT_COST.toFixed(3)}/event`,
        `No overages — usage hard-capped`,
      ],
    }
  }

  return {
    name: fallbackPlan.name,
    price: displayPrice,
    credits: fallbackPlan.credits,
    trialDays,
    features: [
      ...(trialDays > 0 ? [`${trialDays}-day free trial`] : []),
      `$${fallbackPlan.credits} in credits / month`,
      `Advanced AI model included`,
      `Events at $${EVENT_CREDIT_COST.toFixed(3)}/event`,
      `AI charged at cost`,
      `Overages auto-charged`,
      ...(fallbackPlan.id === "scale" ? ["Priority support"] : []),
    ],
  }
}

export function getCurrentMonthLabel(timestamp = Date.now()) {
  return new Date(timestamp).toLocaleString("default", { month: "long" })
}
