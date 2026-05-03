import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import type { LanguageModel } from "ai"

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

export const AI_MODEL_IDS = {
  feedbackClassifier: "anthropic/claude-haiku-4.5",
  feedbackExtractor: "anthropic/claude-sonnet-4.6",
  taskGeneration: "anthropic/claude-haiku-4.5",
} as const

export const AI_MODELS: Record<keyof typeof AI_MODEL_IDS, LanguageModel> = {
  feedbackClassifier: openrouter(AI_MODEL_IDS.feedbackClassifier),
  feedbackExtractor: openrouter(AI_MODEL_IDS.feedbackExtractor),
  taskGeneration: openrouter(AI_MODEL_IDS.taskGeneration),
}

export function hasOpenRouterApiKey() {
  return Boolean(process.env.OPENROUTER_API_KEY)
}
