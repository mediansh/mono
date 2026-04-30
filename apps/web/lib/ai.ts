import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import type { LanguageModel } from "ai"

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

export const AI_MODEL_IDS = {
  feedbackClassifier: "nvidia/nemotron-3-super-120b-a12b",
  feedbackExtractor: "z-ai/glm-4.7",
  taskGeneration: "z-ai/glm-4.7",
} as const

const glm47Settings = {
  provider: {
    only: ["cerebras"],
    quantizations: ["fp16"],
    allow_fallbacks: false,
  },
}

export const AI_MODELS: Record<keyof typeof AI_MODEL_IDS, LanguageModel> = {
  feedbackClassifier: openrouter(AI_MODEL_IDS.feedbackClassifier),
  feedbackExtractor: openrouter(AI_MODEL_IDS.feedbackExtractor, glm47Settings),
  taskGeneration: openrouter(AI_MODEL_IDS.taskGeneration, glm47Settings),
}

export function hasOpenRouterApiKey() {
  return Boolean(process.env.OPENROUTER_API_KEY)
}
