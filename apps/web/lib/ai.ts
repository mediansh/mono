import { createAnthropic } from "@ai-sdk/anthropic"
import type { LanguageModel } from "ai"

const openrouter = createAnthropic({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1/anthropic",
})

export const AI_MODEL_IDS = {
  feedbackClassifier: "nvidia/nemotron-3-super-120b-a12b",
  feedbackExtractor: "moonshotai/kimi-k2.6",
  taskGeneration: "moonshotai/kimi-k2.6",
} as const

export const AI_MODELS: Record<keyof typeof AI_MODEL_IDS, LanguageModel> = {
  feedbackClassifier: openrouter("nvidia/nemotron-3-super-120b-a12b"),
  feedbackExtractor: openrouter("moonshotai/kimi-k2.6"),
  taskGeneration: openrouter("moonshotai/kimi-k2.6"),
}

export function hasOpenRouterApiKey() {
  return Boolean(process.env.OPENROUTER_API_KEY)
}
