import { PostHog } from "posthog-node"

let client: PostHog | null = null

export function getPostHogClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  if (!key) return null

  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    })
  }

  return client
}

export function trackLLMGeneration(props: {
  distinctId: string
  model: string
  feature: string
  inputTokens?: number
  outputTokens?: number
  durationMs: number
  success: boolean
  error?: string
  metadata?: Record<string, unknown>
}) {
  const posthog = getPostHogClient()
  if (!posthog) return

  posthog.capture({
    distinctId: props.distinctId,
    event: "llm_generation",
    properties: {
      model: props.model,
      feature: props.feature,
      input_tokens: props.inputTokens,
      output_tokens: props.outputTokens,
      total_tokens: (props.inputTokens ?? 0) + (props.outputTokens ?? 0),
      duration_ms: props.durationMs,
      success: props.success,
      error: props.error,
      ...props.metadata,
    },
  })
}

export function trackFeedbackProcessing(props: {
  distinctId: string
  platform: "discord" | "x"
  integrationId: string
  workspaceId: string
  messageCount: number
  isProductFeedback: boolean
  confidence?: number
  createdTaskCount: number
  classifierDurationMs?: number
  extractorDurationMs?: number
  totalDurationMs: number
}) {
  const posthog = getPostHogClient()
  if (!posthog) return

  posthog.capture({
    distinctId: props.distinctId,
    event: "feedback_processed",
    properties: {
      platform: props.platform,
      integration_id: props.integrationId,
      workspace_id: props.workspaceId,
      message_count: props.messageCount,
      is_product_feedback: props.isProductFeedback,
      confidence: props.confidence,
      created_task_count: props.createdTaskCount,
      classifier_duration_ms: props.classifierDurationMs,
      extractor_duration_ms: props.extractorDurationMs,
      total_duration_ms: props.totalDurationMs,
    },
  })
}
