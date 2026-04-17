import { generateText, Output } from "ai"
import { z } from "zod"
import { AI_MODEL_IDS, AI_MODELS } from "../lib/ai"
import { getAiCostForTokens } from "../lib/billing/config"
import { safeTrackAiUsage } from "../lib/billing/autumn"
import { trackLLMGeneration } from "./posthog"
import type { Id } from "./_generated/dataModel"

export const RELEVANT_MESSAGE_LIMIT = 25
export const MAX_EXTRACTED_ACTIONS = 5
export const MAX_EXTRACTED_LABELS = 5
export const MAX_MESSAGE_CONTENT_CHARS = 2000
export const MAX_ADDITIONAL_CONTEXT_CHARS = 500

export type Platform = "discord" | "slack" | "x"
export type TaskStatus =
  | "requests"
  | "todo"
  | "in_progress"
  | "ready"
  | "shipped"
  | "archive"
export type TaskPriority = "urgent" | "high" | "medium" | "low" | "none"

export type FeedbackMessage = {
  id: string
  authorUsername: string
  content: string
  permalink: string | null
  createdAt: number
  locationLabels: string[]
  isAdmin: boolean
}

export type ExistingTask = {
  taskCode: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  labels: string[]
  sourceUrl: string | null
}

export type CreateTaskAction = {
  action: "create"
  title: string
  description: string | null
  priority: TaskPriority | null
  labels: string[]
}

export type UpdateTaskAction = {
  action: "update"
  taskCode: string
  title: string
  description: string | null
  priority: TaskPriority | null
  labels: string[]
}

export type TaskAction = CreateTaskAction | UpdateTaskAction

export type Classification = {
  isProductFeedback: boolean
  needsTaskAction: boolean
  confidence: number
  summary: string | null
  reason: string
  relevantMessageIds: string[]
}

export const feedbackClassificationSchema = z.object({
  isProductFeedback: z.boolean(),
  needsTaskAction: z.boolean(),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).nullable(),
  reason: z.string().min(1),
  relevantMessageIds: z.array(z.string()).max(RELEVANT_MESSAGE_LIMIT),
})

export const extractedFeedbackTasksSchema = z.object({
  actions: z
    .array(
      z.discriminatedUnion("action", [
        z.object({
          action: z.literal("create"),
          title: z.string().min(1).max(140),
          description: z.string().max(2000).nullable(),
          priority: z
            .enum(["urgent", "high", "medium", "low", "none"])
            .nullable(),
          labels: z.array(z.string()).max(MAX_EXTRACTED_LABELS),
        }),
        z.object({
          action: z.literal("update"),
          taskCode: z.string().min(1),
          title: z.string().min(1).max(140),
          description: z.string().max(2000).nullable(),
          priority: z
            .enum(["urgent", "high", "medium", "low", "none"])
            .nullable(),
          labels: z.array(z.string()).max(MAX_EXTRACTED_LABELS),
        }),
      ])
    )
    .max(MAX_EXTRACTED_ACTIONS),
})

export function extractJsonObject(text: string) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return a JSON object.")
  }
  return text.slice(start, end + 1)
}

export function truncateText(
  text: string | null | undefined,
  maxChars: number
) {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`
}

export function getAdditionalContext(context: string | null) {
  const value = truncateText(context, MAX_ADDITIONAL_CONTEXT_CHARS)
  return value || null
}

export function formatTranscript(
  messages: FeedbackMessage[],
  pendingMessageIds: Set<string>
) {
  return messages
    .map((message) => {
      const timestamp = new Date(message.createdAt).toISOString()
      const marker = pendingMessageIds.has(message.id) ? "NEW" : "CONTEXT"
      const locationPrefix =
        message.locationLabels.length > 0
          ? ` [${message.locationLabels.join(" | ")}]`
          : ""
      const content =
        truncateText(message.content, MAX_MESSAGE_CONTENT_CHARS) ||
        "(no body text)"
      return `[${marker}] [id:${message.id}] ${timestamp}${locationPrefix} ${message.authorUsername}: ${content}`
    })
    .join("\n")
}

export function formatExistingTasks(tasks: ExistingTask[]) {
  if (tasks.length === 0) return "No existing tasks."
  return tasks
    .map((task) =>
      [
        `${task.taskCode} | ${task.status} | ${task.priority} | ${truncateText(task.title, 140)}`,
        task.labels.length > 0 ? `labels: ${task.labels.join(", ")}` : null,
        task.description
          ? `description: ${truncateText(task.description, 220)}`
          : null,
      ]
        .filter(Boolean)
        .join(" | ")
    )
    .join("\n")
}

const PLATFORM_NOUNS: Record<
  Platform,
  { conversation: string; item: string; items: string; source: string }
> = {
  discord: {
    conversation: "Discord conversations",
    item: "Discord message",
    items: "Discord messages",
    source: "Discord thread",
  },
  slack: {
    conversation: "Slack conversations",
    item: "Slack message",
    items: "Slack messages",
    source: "Slack thread",
  },
  x: {
    conversation: "inbound X mentions and replies",
    item: "X post",
    items: "X posts",
    source: "X post",
  },
}

function buildClassifierPrompt(input: PipelineInput) {
  const nouns = PLATFORM_NOUNS[input.platform]
  const parts = [
    `You classify ${nouns.conversation} for a product team.`,
    `The only product that matters is ${input.workspaceName}.`,
    `Return isProductFeedback=true only when the newest ${nouns.items} contain concrete product feedback, a bug report, a feature request, workflow friction, or an actionable complaint about the actual product.`,
    `Reject off-topic chat, memes, introductions, hiring talk, agency requests, feedback about unrelated tools, and generic conversation that is not about the product itself.`,
    `Use the recent context only to interpret what the new ${nouns.items} refer to.`,
    `Return needsTaskAction=true only when the NEW ${nouns.items} contain enough specific, non-duplicate information to justify creating a task or materially updating one.`,
    `Return needsTaskAction=false for +1s, me-too replies, generic agreement, thanks, status checks, bumps, or restatements that add no meaningful new detail.`,
    `Only include relevantMessageIds from NEW ${nouns.items}.`,
    `Each ${nouns.item} has an [id:XXXXXXX] tag. Use the exact ID from that tag as the relevantMessageId.`,
    `Return valid JSON only. No markdown. No code fences. No commentary.`,
    `Use this exact JSON shape: {"isProductFeedback":false,"needsTaskAction":false,"confidence":0.0,"summary":null,"reason":"...","relevantMessageIds":["<id>"]}`,
  ]
  const additional = getAdditionalContext(input.additionalContext)
  if (additional) {
    parts.push(`Additional product context from the workspace owner: ${additional}`)
  }
  return parts.join(" ")
}

function buildExtractorPrompt(input: PipelineInput) {
  const nouns = PLATFORM_NOUNS[input.platform]
  const labelsText =
    input.availableLabels.length > 0
      ? input.availableLabels.join(", ")
      : "No predefined labels."
  const parts = [
    `You turn ${nouns.conversation} into concise task requests for a task board.`,
    `The product is ${input.workspaceName}.`,
    `Only create or update tasks for actionable feedback about the real product. Ignore unrelated discussion.`,
    `Return between 0 and ${MAX_EXTRACTED_ACTIONS} actions total.`,
    `Each action must be distinct, concrete, and understandable without requiring the original ${nouns.source}.`,
    `You can either create a new task or update an existing task.`,
    `Use update when the new feedback materially adds detail to an existing open task, such as reproduction steps, missing scope, edge cases, urgency, or acceptance criteria.`,
    `For update actions, use the existing taskCode and return the full revised title, description, priority, and labels after incorporating the new feedback.`,
    `Do not update shipped or archived tasks. If the closest shipped task is only an exact duplicate, do nothing. If the new feedback is materially different, create a new task instead.`,
    `If an existing task describes the exact same issue with no meaningful new information, do not create or update anything.`,
    `Different error messages, different symptoms, or different contexts should each get their own task even if they relate to the same general area.`,
    `When in doubt between update and create, prefer update only for the same underlying task; otherwise create.`,
    `Descriptions should summarize the user problem and expected outcome in plain text.`,
    `Priority may be urgent, high, medium, low, or none.`,
    `Allowed labels: ${labelsText}`,
    `Only use labels from the allowed list. Use an empty array when none apply.`,
    `Return valid structured output only with action items shaped like {"action":"create",...} or {"action":"update","taskCode":"MDN-123",...}.`,
  ]
  const additional = getAdditionalContext(input.additionalContext)
  if (additional) {
    parts.push(`Additional product context from the workspace owner: ${additional}`)
  }
  return parts.join(" ")
}

export type PipelineInput = {
  platform: Platform
  workspaceId: Id<"workspaces">
  workspaceName: string
  integrationId: string
  availableLabels: string[]
  additionalContext: string | null
  workspaceContextLines: string[]
  pendingMessages: FeedbackMessage[]
  contextMessages: FeedbackMessage[]
  existingTasks: ExistingTask[]
}

export type ClassifierStage =
  | { kind: "classifier_failed"; error: string; durationMs: number }
  | {
      kind: "classified"
      classification: Classification
      durationMs: number
      cost: number
      inputTokens?: number
      outputTokens?: number
    }

export type PipelineResult =
  | {
      kind: "skip"
      reason: "not_product_feedback" | "not_actionable" | "no_relevant_messages"
      classification: Classification
      classifierDurationMs: number
      classifierCost: number
    }
  | {
      kind: "no_structured_output"
      classification: Classification
      classifierDurationMs: number
      extractorDurationMs: number
      classifierCost: number
      extractorCost: number
    }
  | {
      kind: "processed"
      classification: Classification
      operations: TaskAction[]
      relevantMessages: FeedbackMessage[]
      classifierDurationMs: number
      extractorDurationMs: number
      classifierCost: number
      extractorCost: number
    }

export type FeedbackAIClient = {
  classify(args: {
    system: string
    prompt: string
  }): Promise<{
    text: string
    inputTokens?: number
    outputTokens?: number
  }>
  extract(args: {
    system: string
    prompt: string
    schema: typeof extractedFeedbackTasksSchema
  }): Promise<{
    output: z.infer<typeof extractedFeedbackTasksSchema> | null
    inputTokens?: number
    outputTokens?: number
  }>
}

export const defaultAIClient: FeedbackAIClient = {
  async classify({ system, prompt }) {
    const result = await generateText({
      model: AI_MODELS.feedbackClassifier,
      system,
      prompt,
    })
    return {
      text: result.text,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    }
  },
  async extract({ system, prompt, schema }) {
    const result = await generateText({
      model: AI_MODELS.feedbackExtractor,
      system,
      prompt,
      output: Output.object({ schema }),
    })
    return {
      output: result.output ?? null,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    }
  },
}

function buildClassifierUserPrompt(input: PipelineInput, transcript: string) {
  return [
    `Workspace name: ${input.workspaceName}`,
    ...input.workspaceContextLines,
    "Existing task context:",
    formatExistingTasks(input.existingTasks),
    "Conversation transcript:",
    transcript,
  ].join("\n\n")
}

function buildExtractorUserPrompt(
  input: PipelineInput,
  relevantTranscript: string
) {
  return [
    `Workspace name: ${input.workspaceName}`,
    ...input.workspaceContextLines,
    "Likely matching existing tasks:",
    formatExistingTasks(input.existingTasks),
    `Relevant ${PLATFORM_NOUNS[input.platform].items}:`,
    relevantTranscript,
  ].join("\n\n")
}

export async function runFeedbackPipeline(
  input: PipelineInput,
  client: FeedbackAIClient = defaultAIClient
): Promise<PipelineResult> {
  const pendingIds = new Set(input.pendingMessages.map((m) => m.id))
  const transcript = formatTranscript(input.contextMessages, pendingIds)

  const classifierSystem = buildClassifierPrompt(input)
  const classifierPrompt = buildClassifierUserPrompt(input, transcript)

  const classifierStart = Date.now()
  const classifierResponse = await client.classify({
    system: classifierSystem,
    prompt: classifierPrompt,
  })
  const classifierDurationMs = Date.now() - classifierStart
  const classifierCost = getAiCostForTokens({
    model: AI_MODEL_IDS.feedbackClassifier,
    inputTokens: classifierResponse.inputTokens,
    outputTokens: classifierResponse.outputTokens,
  })

  await trackLLMGeneration({
    distinctId: input.workspaceId,
    model: AI_MODEL_IDS.feedbackClassifier,
    feature: `${input.platform}_feedback_classifier`,
    inputTokens: classifierResponse.inputTokens,
    outputTokens: classifierResponse.outputTokens,
    durationMs: classifierDurationMs,
    success: true,
    metadata: {
      integration_id: input.integrationId,
      pending_message_count: input.pendingMessages.length,
    },
  })
  await safeTrackAiUsage({
    workspaceId: input.workspaceId,
    workspaceName: input.workspaceName,
    model: AI_MODEL_IDS.feedbackClassifier,
    inputTokens: classifierResponse.inputTokens,
    outputTokens: classifierResponse.outputTokens,
    properties: {
      feature: `${input.platform}_feedback_classifier`,
      integration_id: input.integrationId,
    },
  })

  const classification = feedbackClassificationSchema.parse(
    JSON.parse(extractJsonObject(classifierResponse.text))
  )

  if (!classification.isProductFeedback) {
    return {
      kind: "skip",
      reason: "not_product_feedback",
      classification,
      classifierDurationMs,
      classifierCost,
    }
  }

  if (!classification.needsTaskAction) {
    return {
      kind: "skip",
      reason: "not_actionable",
      classification,
      classifierDurationMs,
      classifierCost,
    }
  }

  if (classification.relevantMessageIds.length === 0) {
    return {
      kind: "skip",
      reason: "no_relevant_messages",
      classification,
      classifierDurationMs,
      classifierCost,
    }
  }

  const relevantIds = new Set(classification.relevantMessageIds)
  const matched = input.pendingMessages.filter((message) =>
    relevantIds.has(message.id)
  )
  const relevantMessages = matched.length > 0 ? matched : input.pendingMessages
  const relevantSet = new Set(relevantMessages.map((m) => m.id))
  const relevantTranscript = formatTranscript(relevantMessages, relevantSet)

  const extractorSystem = buildExtractorPrompt(input)
  const extractorPrompt = buildExtractorUserPrompt(input, relevantTranscript)

  const extractorStart = Date.now()
  const extractorResponse = await client.extract({
    system: extractorSystem,
    prompt: extractorPrompt,
    schema: extractedFeedbackTasksSchema,
  })
  const extractorDurationMs = Date.now() - extractorStart
  const extractorCost = getAiCostForTokens({
    model: AI_MODEL_IDS.feedbackExtractor,
    inputTokens: extractorResponse.inputTokens,
    outputTokens: extractorResponse.outputTokens,
  })

  await trackLLMGeneration({
    distinctId: input.workspaceId,
    model: AI_MODEL_IDS.feedbackExtractor,
    feature: `${input.platform}_feedback_extractor`,
    inputTokens: extractorResponse.inputTokens,
    outputTokens: extractorResponse.outputTokens,
    durationMs: extractorDurationMs,
    success: extractorResponse.output !== null,
    metadata: {
      integration_id: input.integrationId,
      relevant_message_count: relevantMessages.length,
    },
  })
  await safeTrackAiUsage({
    workspaceId: input.workspaceId,
    workspaceName: input.workspaceName,
    model: AI_MODEL_IDS.feedbackExtractor,
    inputTokens: extractorResponse.inputTokens,
    outputTokens: extractorResponse.outputTokens,
    properties: {
      feature: `${input.platform}_feedback_extractor`,
      integration_id: input.integrationId,
    },
  })

  if (!extractorResponse.output) {
    return {
      kind: "no_structured_output",
      classification,
      classifierDurationMs,
      extractorDurationMs,
      classifierCost,
      extractorCost,
    }
  }

  const extracted = extractedFeedbackTasksSchema.parse(extractorResponse.output)
  const filteredLabels = (labels: string[]) =>
    labels
      .filter((label) => input.availableLabels.includes(label))
      .slice(0, MAX_EXTRACTED_LABELS)

  const operations: TaskAction[] = extracted.actions.map((action) =>
    action.action === "create"
      ? ({
          action: "create",
          title: action.title,
          description: action.description,
          priority: action.priority,
          labels: filteredLabels(action.labels),
        } satisfies CreateTaskAction)
      : ({
          action: "update",
          taskCode: action.taskCode,
          title: action.title,
          description: action.description,
          priority: action.priority,
          labels: filteredLabels(action.labels),
        } satisfies UpdateTaskAction)
  )

  return {
    kind: "processed",
    classification,
    operations,
    relevantMessages,
    classifierDurationMs,
    extractorDurationMs,
    classifierCost,
    extractorCost,
  }
}
