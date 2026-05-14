import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import type { LanguageModel } from "ai"
import {
  isTrackedAiModel,
  planAllowsAdvancedAi,
  type TrackedAiModel,
} from "./billing/config"

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

export const AI_MODEL_IDS = {
  feedbackClassifier: "google/gemini-3.1-flash-lite",
  feedbackExtractor: "google/gemini-3-flash-preview",
  taskGeneration: "google/gemini-3.1-flash-lite",
} as const satisfies Record<
  "feedbackClassifier" | "feedbackExtractor" | "taskGeneration",
  TrackedAiModel
>

export const AI_MODELS: Record<keyof typeof AI_MODEL_IDS, LanguageModel> = {
  feedbackClassifier: openrouter(AI_MODEL_IDS.feedbackClassifier),
  feedbackExtractor: openrouter(AI_MODEL_IDS.feedbackExtractor),
  taskGeneration: openrouter(AI_MODEL_IDS.taskGeneration),
}

// The fallback model used when a workspace's plan disallows the advanced tier.
// Free-tier workspaces are routed to this model for every AI feature.
const STANDARD_MODEL_ID: TrackedAiModel = "google/gemini-3.1-flash-lite"
const STANDARD_MODEL: LanguageModel = openrouter(STANDARD_MODEL_ID)

type ModelSelection = {
  modelId: TrackedAiModel
  model: LanguageModel
}

// Returns the AI model a workspace is allowed to use for a given feature based
// on its current plan. Free-tier plans are forced to the standard model.
export function getAiModelForPlan(
  feature: keyof typeof AI_MODEL_IDS,
  planId: string | null | undefined
): ModelSelection {
  const configuredId = AI_MODEL_IDS[feature]

  if (!planAllowsAdvancedAi(planId)) {
    return { modelId: STANDARD_MODEL_ID, model: STANDARD_MODEL }
  }

  if (!isTrackedAiModel(configuredId)) {
    // The configured id is always tracked, but narrow defensively.
    return { modelId: STANDARD_MODEL_ID, model: STANDARD_MODEL }
  }

  return { modelId: configuredId, model: AI_MODELS[feature] }
}

export function hasOpenRouterApiKey() {
  return Boolean(process.env.OPENROUTER_API_KEY)
}
