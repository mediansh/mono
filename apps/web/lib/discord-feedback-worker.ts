import { generateText, Output } from "ai"
import { z } from "zod"
import type { Id } from "@/convex/_generated/dataModel"
import { AI_MODEL_IDS, AI_MODELS } from "@/lib/ai"
import { safeTrackAiUsage } from "@/lib/billing/autumn"
import { getAiCostForTokens } from "@/lib/billing/config"
import { logger } from "@/lib/logger"
import {
  createConvexWorkerClient,
  type DiscordFeedbackTaskOperation,
  type DiscordFeedbackWindow,
  type TaskSnapshot,
} from "@/lib/convex-worker-client"
import { trackFeedbackProcessing, trackLLMGeneration } from "@/convex/posthog"

const FEEDBACK_WINDOW_LIMIT = 100
const FEEDBACK_CONTEXT_LIMIT = 10
const RELEVANT_MESSAGE_LIMIT = 10
const TASK_CONTEXT_FETCH_LIMIT = 100
const EXISTING_TASK_CONTEXT_LIMIT = 12
const MAX_MESSAGE_CONTENT_CHARS = 280
const MAX_TASK_DESCRIPTION_CHARS = 220
const MAX_LOCATION_TEXT_CHARS = 80
const MAX_ADDITIONAL_CONTEXT_CHARS = 500
const MAX_SEARCH_TERMS = 18

const TASK_MATCH_STOP_WORDS = new Set(["about","after","all","also","and","any","are","but","can","cant","could","did","does","dont","for","from","get","got","had","has","have","hey","how","into","its","just","like","maybe","more","not","now","our","out","pls","please","really","same","should","some","still","than","that","the","their","them","there","they","this","too","use","using","very","was","were","what","when","with","would","you","your"])

type FeedbackMessage = DiscordFeedbackWindow["messages"][number]

const feedbackClassificationSchema = z.object({
  isProductFeedback: z.boolean(),
  needsTaskAction: z.boolean(),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).nullable(),
  reason: z.string().min(1),
  relevantMessageIds: z.array(z.string()).max(RELEVANT_MESSAGE_LIMIT),
})

const MAX_EXTRACTED_ACTIONS = 5
const MAX_EXTRACTED_LABELS = 5

const extractedFeedbackTasksSchema = z.object({
  actions: z.array(
    z.discriminatedUnion("action", [
      z.object({
        action: z.literal("create"),
        title: z.string().min(1).max(140),
        description: z.string().max(2000).nullable(),
        priority: z.enum(["urgent", "high", "medium", "low", "none"]).nullable(),
        labels: z.array(z.string()),
      }),
      z.object({
        action: z.literal("update"),
        taskCode: z.string().min(1),
        title: z.string().min(1).max(140),
        description: z.string().max(2000).nullable(),
        priority: z.enum(["urgent", "high", "medium", "low", "none"]).nullable(),
        labels: z.array(z.string()),
      }),
    ])
  ),
})

function getRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function formatCreatedAtLabel(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(timestamp)
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) throw new Error("Model did not return a JSON object.")
  return text.slice(start, end + 1)
}

function normalizeDiscordId(id: string) {
  return id.trim().replace(/\D/g, "")
}

function truncateText(text: string | null | undefined, maxChars: number) {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`
}

function getAdditionalContext(context: string | null) {
  const value = truncateText(context, MAX_ADDITIONAL_CONTEXT_CHARS)
  return value || null
}

function tokenizeTaskMatchTerms(text: string | null | undefined) {
  const normalized = truncateText(text, 400).toLowerCase()
  if (!normalized) return []
  return Array.from(new Set((normalized.match(/[a-z0-9][a-z0-9_-]*/g) ?? []).filter((term) => term.length >= 3 && !TASK_MATCH_STOP_WORDS.has(term))))
}

function collectRelevantTaskTerms(messages: FeedbackMessage[]) {
  const counts = new Map<string, number>()
  for (const message of messages) {
    const parts = [message.content, message.threadTitle, message.forumTitle, message.channelName, message.parentChannelName]
    for (const part of parts) {
      for (const term of tokenizeTaskMatchTerms(part)) {
        counts.set(term, (counts.get(term) ?? 0) + 1)
      }
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_SEARCH_TERMS)
    .map(([term]) => term)
}

function parseDiscordPermalink(url: string | null) {
  if (!url) return null
  const match = url.match(/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/)
  if (!match?.[1] || !match[2] || !match[3]) return null
  return { guildId: match[1], channelId: match[2], messageId: match[3] }
}

function selectRelevantTasks(tasks: TaskSnapshot[], relevantMessages: FeedbackMessage[]) {
  if (tasks.length === 0 || relevantMessages.length === 0) return []
  const exactSourceUrls = new Set(relevantMessages.map((message) => message.permalink).filter(Boolean))
  const relevantChannelIds = new Set(relevantMessages.flatMap((message) => [message.channelId, message.parentChannelId, message.threadId, message.forumChannelId].filter(Boolean)))
  const relevantGuildIds = new Set(relevantMessages.map((message) => parseDiscordPermalink(message.permalink)?.guildId).filter(Boolean))
  const relevantTerms = collectRelevantTaskTerms(relevantMessages)
  return tasks
    .map((task) => {
      let score = 0
      if (exactSourceUrls.has(task.sourceUrl ?? "")) score += 100
      const parsedSource = parseDiscordPermalink(task.sourceUrl)
      if (parsedSource) {
        if (relevantChannelIds.has(parsedSource.channelId)) score += 16
        if (relevantGuildIds.has(parsedSource.guildId)) score += 4
      }
      if (task.status !== "shipped") score += 2
      const taskTerms = new Set([...tokenizeTaskMatchTerms(task.title), ...tokenizeTaskMatchTerms(task.description), ...task.labels.flatMap((label) => tokenizeTaskMatchTerms(label))])
      for (const term of relevantTerms) {
        if (taskTerms.has(term)) score += 3
      }
      return { task, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.task.status === b.task.status ? a.task.taskCode.localeCompare(b.task.taskCode) : a.task.status === "shipped" ? 1 : -1))
    .slice(0, EXISTING_TASK_CONTEXT_LIMIT)
    .map((entry) => entry.task)
}

function isMessageAfterCursor(message: { messageId: string; messageCreatedAt: number }, cursor: { messageId: string | null; messageCreatedAt: number | null }) {
  if (cursor.messageCreatedAt === null || cursor.messageId === null) return true
  if (message.messageCreatedAt > cursor.messageCreatedAt) return true
  if (message.messageCreatedAt < cursor.messageCreatedAt) return false
  return BigInt(message.messageId) > BigInt(cursor.messageId)
}

function formatTranscript(messages: FeedbackMessage[], pendingMessageIds: Set<string>) {
  return messages
    .map((message) => {
      const timestamp = new Date(message.messageCreatedAt).toISOString()
      const marker = pendingMessageIds.has(message.messageId) ? "NEW" : "CONTEXT"
      const locationParts = [
        message.forumTitle ? `forum:${truncateText(message.forumTitle, MAX_LOCATION_TEXT_CHARS)}` : null,
        message.threadTitle ? `thread:${truncateText(message.threadTitle, MAX_LOCATION_TEXT_CHARS)}` : null,
        message.parentChannelName ? `parent_channel:${truncateText(message.parentChannelName, MAX_LOCATION_TEXT_CHARS)}` : null,
        message.channelName ? `channel:${truncateText(message.channelName, MAX_LOCATION_TEXT_CHARS)}` : null,
      ].filter(Boolean)
      const locationPrefix = locationParts.length > 0 ? ` [${locationParts.join(" | ")}]` : ""
      const content = truncateText(message.content, MAX_MESSAGE_CONTENT_CHARS) || (message.threadTitle ? "(no body text; use the thread title as the post title)" : "(no body text)")
      return `[${marker}] [id:${message.messageId}] ${timestamp}${locationPrefix} ${message.authorUsername}: ${content}`
    })
    .join("\n")
}

function formatExistingTasks(tasks: TaskSnapshot[]) {
  if (tasks.length === 0) return "No likely matching existing tasks."
  return tasks.map((task) => [
    `${task.taskCode} | ${task.status} | ${task.priority} | ${truncateText(task.title, 140)}`,
    task.labels.length > 0 ? `labels: ${task.labels.join(", ")}` : null,
    task.description ? `description: ${truncateText(task.description, MAX_TASK_DESCRIPTION_CHARS)}` : null,
  ].filter(Boolean).join(" | ")).join("\n")
}

export async function processDiscordFeedbackInBackground(args: { integrationId: Id<"discordWorkspaceIntegrations"> }) {
  const botSecret = getRequiredEnv("DISCORD_PAIRING_SECRET")
  const client = createConvexWorkerClient()

  try {
    const processingStart = Date.now()
    const feedbackWindow = await client.discord.getPendingFeedbackWindow(botSecret, args.integrationId, FEEDBACK_WINDOW_LIMIT)
    const quotaStatus = await client.discord.getWorkspaceQuotaStatus(botSecret, feedbackWindow.integration.workspaceId)

    if (quotaStatus.eventsExhausted) {
      await client.discord.finalize(botSecret, args.integrationId, { kind: "success", reason: "events_exhausted", pauseReason: "Paused — events exhausted (overages disabled)" })
      return
    }

    const pendingMessages = feedbackWindow.messages.filter((message) => isMessageAfterCursor(message, { messageId: feedbackWindow.integration.lastProcessedMessageId, messageCreatedAt: feedbackWindow.integration.lastProcessedMessageCreatedAt }))
    const pendingNonAdminMessages = pendingMessages.filter((message) => !message.authorHasAdminPrivileges)
    if (pendingMessages.length === 0) {
      await client.discord.finalize(botSecret, args.integrationId, { kind: "success", reason: "no_pending_messages" })
      return
    }

    const latestPendingMessage = pendingMessages.at(-1)
    if (!latestPendingMessage) {
      await client.discord.finalize(botSecret, args.integrationId, { kind: "success", reason: "missing_latest_pending_message" })
      return
    }

    if (pendingNonAdminMessages.length === 0) {
      await client.discord.markFeedbackWindowProcessed(botSecret, args.integrationId, latestPendingMessage.messageId, latestPendingMessage.messageCreatedAt)
      await client.discord.finalize(botSecret, args.integrationId, { kind: "success", reason: "admin_only_messages" })
      return
    }

    const contextMessages = feedbackWindow.messages.filter((message) => !message.authorHasAdminPrivileges).slice(-FEEDBACK_CONTEXT_LIMIT)
    const pendingMessageIds = new Set(pendingNonAdminMessages.map((message) => message.messageId))
    const transcript = formatTranscript(contextMessages, pendingMessageIds)
    const classifierSystemParts = [
      "You classify Discord conversations for a product team.",
      `The only product that matters is ${feedbackWindow.integration.workspaceName}`,
      "Return isProductFeedback=true only when the newest messages contain concrete product feedback, a bug report, a feature request, workflow friction, or an actionable complaint about the actual product.",
      "Reject off-topic chat, memes, introductions, hiring talk, agency requests, feedback about unrelated tools, and generic conversation that is not about the product itself.",
      "Use the recent context only to interpret what the new messages refer to.",
      "Return needsTaskAction=true only when the NEW messages contain enough specific, non-duplicate information to justify creating a task or materially updating one.",
      "Return needsTaskAction=false for +1s, me-too replies, generic agreement, thanks, status checks, bumps, or restatements that add no meaningful new detail.",
      "Forum and thread metadata may appear inline as forum/thread/channel labels; use that metadata, especially when a forum post body is empty.",
      "Only include relevantMessageIds from NEW messages.",
      "Each message has an [id:XXXXXXX] tag. Use the numeric ID from that tag as the relevantMessageId, NOT the timestamp.",
      "Return valid JSON only. No markdown. No code fences. No commentary.",
      'Use this exact JSON shape: {"isProductFeedback":false,"needsTaskAction":false,"confidence":0.0,"summary":null,"reason":"...","relevantMessageIds":["123456789"]}',
    ]
    const additionalContext = getAdditionalContext(feedbackWindow.integration.additionalContext)
    if (additionalContext) classifierSystemParts.push(`Additional product context from the workspace owner: ${additionalContext}`)

    const classifierStart = Date.now()
    const classifierResult = await generateText({
      model: AI_MODELS.feedbackClassifier,
      system: classifierSystemParts.join(" "),
      prompt: [`Workspace name: ${feedbackWindow.integration.workspaceName}`, `Guild: ${feedbackWindow.integration.guildName}`, "Conversation transcript:", transcript].join("\n\n"),
    })
    const classifierDurationMs = Date.now() - classifierStart
    await trackLLMGeneration({ distinctId: feedbackWindow.integration.workspaceId, model: AI_MODEL_IDS.feedbackClassifier, feature: "discord_feedback_classifier", inputTokens: classifierResult.usage?.inputTokens, outputTokens: classifierResult.usage?.outputTokens, durationMs: classifierDurationMs, success: true, metadata: { integration_id: args.integrationId, pending_message_count: pendingNonAdminMessages.length } })
    await safeTrackAiUsage({ workspaceId: feedbackWindow.integration.workspaceId, workspaceName: feedbackWindow.integration.workspaceName, model: AI_MODEL_IDS.feedbackClassifier, inputTokens: classifierResult.usage?.inputTokens, outputTokens: classifierResult.usage?.outputTokens, properties: { feature: "discord_feedback_classifier", integration_id: args.integrationId } })
    logger.info("[debug] Discord classifier raw text", { integrationId: args.integrationId, text: classifierResult.text, pendingCount: pendingNonAdminMessages.length, transcript })
    const classification = feedbackClassificationSchema.parse(JSON.parse(extractJsonObject(classifierResult.text)))
    logger.info("[debug] Discord classifier parsed", { integrationId: args.integrationId, classification })

    if (!classification.isProductFeedback || !classification.needsTaskAction || classification.relevantMessageIds.length === 0) {
      await client.discord.markFeedbackWindowProcessed(botSecret, args.integrationId, latestPendingMessage.messageId, latestPendingMessage.messageCreatedAt)
      await trackFeedbackProcessing({ distinctId: feedbackWindow.integration.workspaceId, platform: "discord", integrationId: args.integrationId, workspaceId: feedbackWindow.integration.workspaceId, messageCount: pendingNonAdminMessages.length, isProductFeedback: classification.isProductFeedback, confidence: classification.confidence, createdTaskCount: 0, updatedTaskCount: 0, classifierDurationMs, totalDurationMs: Date.now() - processingStart })
      await client.discord.finalize(botSecret, args.integrationId, { kind: "success", reason: classification.isProductFeedback ? "not_actionable" : "not_product_feedback" })
      return
    }

    const normalizedRelevantIds = new Set(classification.relevantMessageIds.map((messageId) => normalizeDiscordId(messageId)).filter(Boolean))
    const matchedRelevantMessages = pendingNonAdminMessages.filter((message) => normalizedRelevantIds.has(normalizeDiscordId(message.messageId)))
    const relevantMessages = matchedRelevantMessages.length > 0 ? matchedRelevantMessages : pendingNonAdminMessages
    const existingTasks = await client.discord.getTaskSnapshot(botSecret, feedbackWindow.integration.workspaceId, TASK_CONTEXT_FETCH_LIMIT)
    const relevantExistingTasks = selectRelevantTasks(existingTasks, relevantMessages)
    const labelsText = feedbackWindow.integration.availableLabels.length > 0 ? feedbackWindow.integration.availableLabels.join(", ") : "No predefined labels."
    const extractorSystemParts = [
      "You turn Discord conversations into concise task requests for a task board.",
      `The product is ${feedbackWindow.integration.workspaceName}.`,
      "Only create or update tasks for actionable feedback about the real product. Ignore unrelated discussion.",
      "Return between 0 and 5 actions total.",
      "Each action must be distinct, concrete, and understandable without requiring the original Discord thread.",
      "You can either create a new task or update an existing task.",
      "Use update when the new feedback materially adds detail to an existing open task, such as reproduction steps, missing scope, edge cases, urgency, or acceptance criteria.",
      "For update actions, use the existing taskCode and return the full revised title, description, priority, and labels after incorporating the new feedback.",
      "Do not update shipped or archived tasks. If the closest shipped task is only an exact duplicate, do nothing. If the new feedback is materially different, create a new task instead.",
      "If an existing task describes the exact same issue with no meaningful new information, do not create or update anything.",
      "Different error messages, different symptoms, or different contexts should each get their own task even if they relate to the same general area.",
      "When in doubt between update and create, prefer update only for the same underlying task; otherwise create.",
      "Descriptions should summarize the user problem and expected outcome in plain text.",
      "Priority may be urgent, high, medium, low, or none.",
      `Allowed labels: ${labelsText}`,
      "Only use labels from the allowed list. Use an empty array when none apply.",
      'Return valid structured output only with action items shaped like {"action":"create",...} or {"action":"update","taskCode":"MDN-123",...}.',
    ]
    if (additionalContext) extractorSystemParts.push(`Additional product context from the workspace owner: ${additionalContext}`)
    const relevantMessageIds = new Set(relevantMessages.map((message) => message.messageId))
    const extractorStart = Date.now()
    const extractorResult = await generateText({
      model: AI_MODELS.feedbackExtractor,
      system: extractorSystemParts.join(" "),
      prompt: [`Workspace name: ${feedbackWindow.integration.workspaceName}`, `Guild: ${feedbackWindow.integration.guildName}`, "Likely matching existing tasks:", formatExistingTasks(relevantExistingTasks), "Relevant Discord messages:", formatTranscript(relevantMessages, relevantMessageIds)].join("\n\n"),
      output: Output.object({ schema: extractedFeedbackTasksSchema }),
    })
    const extractorDurationMs = Date.now() - extractorStart
    await trackLLMGeneration({ distinctId: feedbackWindow.integration.workspaceId, model: AI_MODEL_IDS.feedbackExtractor, feature: "discord_feedback_extractor", inputTokens: extractorResult.usage?.inputTokens, outputTokens: extractorResult.usage?.outputTokens, durationMs: extractorDurationMs, success: true, metadata: { integration_id: args.integrationId, relevant_message_count: relevantMessages.length } })
    await safeTrackAiUsage({ workspaceId: feedbackWindow.integration.workspaceId, workspaceName: feedbackWindow.integration.workspaceName, model: AI_MODEL_IDS.feedbackExtractor, inputTokens: extractorResult.usage?.inputTokens, outputTokens: extractorResult.usage?.outputTokens, properties: { feature: "discord_feedback_extractor", integration_id: args.integrationId } })
    logger.info("[debug] Discord extractor result", { integrationId: args.integrationId, hasOutput: Boolean(extractorResult.output), output: extractorResult.output, text: extractorResult.text })
    if (!extractorResult.output) {
      logger.warn("Discord feedback extractor produced no structured output", { integrationId: args.integrationId })
      await client.discord.markFeedbackWindowProcessed(botSecret, args.integrationId, latestPendingMessage.messageId, latestPendingMessage.messageCreatedAt)
      await trackFeedbackProcessing({ distinctId: feedbackWindow.integration.workspaceId, platform: "discord", integrationId: args.integrationId, workspaceId: feedbackWindow.integration.workspaceId, messageCount: pendingNonAdminMessages.length, isProductFeedback: classification.isProductFeedback, confidence: classification.confidence, createdTaskCount: 0, updatedTaskCount: 0, classifierDurationMs, extractorDurationMs, totalDurationMs: Date.now() - processingStart })
      await client.discord.finalize(botSecret, args.integrationId, { kind: "success", reason: "no_structured_output" })
      return
    }

    const extracted = extractedFeedbackTasksSchema.parse(extractorResult.output)
    const limitedActions = extracted.actions.slice(0, MAX_EXTRACTED_ACTIONS)
    const operations: DiscordFeedbackTaskOperation[] = limitedActions.map((action) => action.action === "create" ? ({ action: "create", task: { title: action.title, description: action.description ?? undefined, status: "requests", priority: action.priority ?? "none", labels: action.labels.filter((label) => feedbackWindow.integration.availableLabels.includes(label)).slice(0, MAX_EXTRACTED_LABELS), source: relevantMessages[0] ? { platform: "discord", url: relevantMessages[0].permalink, author: relevantMessages[0].authorUsername } : undefined, createdAtLabel: formatCreatedAtLabel(relevantMessages[0]?.messageCreatedAt ?? latestPendingMessage.messageCreatedAt) } }) : ({ action: "update", taskCode: action.taskCode, title: action.title, description: action.description ?? undefined, priority: action.priority ?? undefined, labels: action.labels.filter((label) => feedbackWindow.integration.availableLabels.includes(label)).slice(0, MAX_EXTRACTED_LABELS) }))
    const classifierCost = getAiCostForTokens({ model: AI_MODEL_IDS.feedbackClassifier, inputTokens: classifierResult.usage?.inputTokens, outputTokens: classifierResult.usage?.outputTokens })
    const extractorCost = getAiCostForTokens({ model: AI_MODEL_IDS.feedbackExtractor, inputTokens: extractorResult.usage?.inputTokens, outputTokens: extractorResult.usage?.outputTokens })
    const totalAiCost = classifierCost + extractorCost
    const taskResult = operations.length > 0 ? await client.discord.applyTaskOperations(botSecret, feedbackWindow.integration.workspaceId, operations, totalAiCost > 0 ? totalAiCost : undefined) : { createdTaskIds: [], updatedTaskIds: [] }
    await client.discord.markFeedbackWindowProcessed(botSecret, args.integrationId, latestPendingMessage.messageId, latestPendingMessage.messageCreatedAt)
    await trackFeedbackProcessing({ distinctId: feedbackWindow.integration.workspaceId, platform: "discord", integrationId: args.integrationId, workspaceId: feedbackWindow.integration.workspaceId, messageCount: pendingNonAdminMessages.length, isProductFeedback: classification.isProductFeedback, confidence: classification.confidence, createdTaskCount: taskResult.createdTaskIds.length, updatedTaskCount: taskResult.updatedTaskIds.length, classifierDurationMs, extractorDurationMs, totalDurationMs: Date.now() - processingStart })
    await client.discord.finalize(botSecret, args.integrationId, { kind: "success", reason: operations.length > 0 ? "processed" : "no_task_operations" })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    logger.error("Discord feedback worker failed", { integrationId: args.integrationId, error: message })
    try {
      await createConvexWorkerClient().discord.finalize(botSecret, args.integrationId, { kind: "failed", error: message })
    } catch (finalizeError) {
      logger.error("Failed to finalize Discord feedback worker failure", { integrationId: args.integrationId, error: finalizeError instanceof Error ? finalizeError.message : "Unknown finalize error" })
    }
  }
}
