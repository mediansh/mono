import { anthropic } from "@ai-sdk/anthropic"
import type { LanguageModel } from "ai"

export const AI_MODEL_IDS = {
  feedbackClassifier: "anthropic/claude-haiku-4.5",
  feedbackExtractor: "anthropic/claude-sonnet-4.6",
  taskGeneration: "anthropic/claude-sonnet-4.6",
} as const

export const AI_MODELS: Record<keyof typeof AI_MODEL_IDS, LanguageModel> = {
  feedbackClassifier: anthropic("claude-haiku-4-5"),
  feedbackExtractor: anthropic("claude-sonnet-4-6"),
  taskGeneration: anthropic("claude-sonnet-4-6"),
}

export function hasAnthropicApiKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}
