type PostHogEventPayload = {
  distinctId: string
  event: string
  properties: Record<string, unknown>
}

function getPostHogConfig() {
  const key =
    process.env.NEXT_PUBLIC_POSTHOG_KEY ??
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  if (!key) {
    return null
  }

  return {
    key,
    host: (process.env.NEXT_PUBLIC_POSTHOG_HOST ??
      "https://us.i.posthog.com").replace(/\/$/, ""),
  }
}

async function captureEvent(payload: PostHogEventPayload) {
  const config = getPostHogConfig()
  if (!config) {
    return
  }

  try {
    await fetch(`${config.host}/capture/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: config.key,
        event: payload.event,
        distinct_id: payload.distinctId,
        properties: payload.properties,
      }),
    })
  } catch {
    // PostHog capture is best-effort — don't block callers on failure
  }
}

export async function trackLLMGeneration(props: {
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
  await captureEvent({
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

export async function trackFeedbackProcessing(props: {
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
  await captureEvent({
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
