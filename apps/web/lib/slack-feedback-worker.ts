import { generateText, Output } from "ai"
import { z } from "zod"
import type { Id } from "@/convex/_generated/dataModel"
import { AI_MODEL_IDS, AI_MODELS } from "@/lib/ai"
import { safeTrackAiUsage } from "@/lib/billing/autumn"
import { getAiCostForTokens } from "@/lib/billing/config"
import { logger } from "@/lib/logger"
import {
  createConvexWorkerClient,
  type SlackFeedbackTaskOperation,
  type SlackFeedbackWindow,
  type TaskSnapshot,
} from "@/lib/convex-worker-client"
import { trackFeedbackProcessing, trackLLMGeneration } from "@/convex/posthog"

const FEEDBACK_WINDOW_LIMIT = 100
const FEEDBACK_CONTEXT_LIMIT = 10
const EXISTING_TASK_CONTEXT_LIMIT = 50

type FeedbackMessage = SlackFeedbackWindow["messages"][number]

const feedbackClassificationSchema = z.object({
  isProductFeedback: z.boolean(),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).nullable(),
  reason: z.string().min(1),
  relevantMessageIds: z.array(z.string()).max(25),
})

const extractedFeedbackTasksSchema = z.object({
  actions: z.array(
    z.discriminatedUnion("action", [
      z.object({
        action: z.literal("create"),
        title: z.string().min(1).max(140),
        description: z.string().max(2000).nullable(),
        priority: z.enum(["urgent", "high", "medium", "low", "none"]).nullable(),
        labels: z.array(z.string()).max(5),
      }),
      z.object({
        action: z.literal("update"),
        taskCode: z.string().min(1),
        title: z.string().min(1).max(140),
        description: z.string().max(2000).nullable(),
        priority: z.enum(["urgent", "high", "medium", "low", "none"]).nullable(),
        labels: z.array(z.string()).max(5),
      }),
    ])
  ).max(5),
})

function getRequiredEnv(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing required environment variable: ${name}`); return value }
function formatCreatedAtLabel(timestamp: number) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(timestamp) }
function extractJsonObject(text: string) { const start = text.indexOf("{"); const end = text.lastIndexOf("}"); if (start === -1 || end === -1 || end <= start) throw new Error("Model did not return a JSON object."); return text.slice(start, end + 1) }
function isMessageAfterCursor(message: { messageTs: string; messageCreatedAt: number }, cursor: { messageId: string | null; messageCreatedAt: number | null }) { if (cursor.messageCreatedAt === null || cursor.messageId === null) return true; if (message.messageCreatedAt > cursor.messageCreatedAt) return true; if (message.messageCreatedAt < cursor.messageCreatedAt) return false; return message.messageTs > cursor.messageId }
function formatTranscript(messages: FeedbackMessage[], pendingMessageIds: Set<string>) { return messages.map((message) => { const timestamp = new Date(message.messageCreatedAt).toISOString(); const marker = pendingMessageIds.has(message.messageTs) ? "NEW" : "CONTEXT"; const locationParts = [message.threadTs ? `thread:${message.threadTs}` : null, message.channelName ? `channel:${message.channelName}` : null].filter(Boolean); const locationPrefix = locationParts.length > 0 ? ` [${locationParts.join(" | ")}]` : ""; const content = message.content || "(no body text)"; return `[${marker}] [id:${message.messageTs}] ${timestamp}${locationPrefix} ${message.authorUsername}: ${content}` }).join("\n") }
function formatExistingTasks(tasks: TaskSnapshot[]) { if (tasks.length === 0) return "No existing tasks."; return tasks.map((task) => [ `${task.taskCode} | ${task.status} | ${task.priority} | ${task.title}`, task.labels.length > 0 ? `labels: ${task.labels.join(", ")}` : null, task.description ? `description: ${task.description}` : null ].filter(Boolean).join(" | ")).join("\n") }

export async function processSlackFeedbackInBackground(args: { integrationId: Id<"slackWorkspaceIntegrations"> }) {
  const botSecret = getRequiredEnv("SLACK_BOT_SECRET")
  const client = createConvexWorkerClient()

  try {
    const processingStart = Date.now()
    const feedbackWindow = await client.slack.getPendingFeedbackWindow(botSecret, args.integrationId, FEEDBACK_WINDOW_LIMIT)
    const quotaStatus = await client.slack.getWorkspaceQuotaStatus(botSecret, feedbackWindow.integration.workspaceId)
    if (quotaStatus.eventsExhausted) {
      await client.slack.finalize(botSecret, args.integrationId, { kind: "success", reason: "events_exhausted", pauseReason: "Paused — events exhausted (overages disabled)" })
      return
    }

    const pendingMessages = feedbackWindow.messages.filter((message) => isMessageAfterCursor(message, { messageId: feedbackWindow.integration.lastProcessedMessageId, messageCreatedAt: feedbackWindow.integration.lastProcessedMessageCreatedAt }))
    if (pendingMessages.length === 0) {
      await client.slack.finalize(botSecret, args.integrationId, { kind: "success", reason: "no_pending_messages" })
      return
    }

    const latestPendingMessage = pendingMessages.at(-1)
    if (!latestPendingMessage) {
      await client.slack.finalize(botSecret, args.integrationId, { kind: "success", reason: "missing_latest_pending_message" })
      return
    }

    const contextMessages = feedbackWindow.messages.slice(-FEEDBACK_CONTEXT_LIMIT)
    const pendingMessageIds = new Set(pendingMessages.map((message) => message.messageTs))
    const transcript = formatTranscript(contextMessages, pendingMessageIds)
    const existingTasks = await client.slack.getTaskSnapshot(botSecret, feedbackWindow.integration.workspaceId, EXISTING_TASK_CONTEXT_LIMIT)
    const classifierSystemParts = [
      "You classify Slack conversations for a product team.",
      `The only product that matters is ${feedbackWindow.integration.workspaceName}`,
      "Return isProductFeedback=true only when the newest messages contain concrete product feedback, a bug report, a feature request, workflow friction, or an actionable complaint about the actual product.",
      "Reject off-topic chat, memes, introductions, hiring talk, agency requests, feedback about unrelated tools, and generic conversation that is not about the product itself.",
      "Use the recent context only to interpret what the new messages refer to.",
      "If the new messages add detail, scope, reproduction steps, or acceptance criteria to an existing open task, that is still product feedback.",
      "Each message has an [id:XXXXXXX] tag. Use the message timestamp from that tag as the relevantMessageId.",
      "Return valid JSON only. No markdown. No code fences. No commentary.",
      'Use this exact JSON shape: {"isProductFeedback":false,"confidence":0.0,"summary":null,"reason":"...","relevantMessageIds":["1234567890.123456"]}',
    ]
    if (feedbackWindow.integration.additionalContext) classifierSystemParts.push(`Additional product context from the workspace owner: ${feedbackWindow.integration.additionalContext}`)
    const classifierStart = Date.now()
    const classifierResult = await generateText({ model: AI_MODELS.feedbackClassifier, system: classifierSystemParts.join(" "), prompt: [`Workspace name: ${feedbackWindow.integration.workspaceName}`, `Slack team: ${feedbackWindow.integration.teamName}`, "Existing task context:", formatExistingTasks(existingTasks), "Conversation transcript:", transcript].join("\n\n") })
    const classifierDurationMs = Date.now() - classifierStart
    await trackLLMGeneration({ distinctId: feedbackWindow.integration.workspaceId, model: AI_MODEL_IDS.feedbackClassifier, feature: "slack_feedback_classifier", inputTokens: classifierResult.usage?.inputTokens, outputTokens: classifierResult.usage?.outputTokens, durationMs: classifierDurationMs, success: true, metadata: { integration_id: args.integrationId, pending_message_count: pendingMessages.length } })
    await safeTrackAiUsage({ workspaceId: feedbackWindow.integration.workspaceId, workspaceName: feedbackWindow.integration.workspaceName, model: AI_MODEL_IDS.feedbackClassifier, inputTokens: classifierResult.usage?.inputTokens, outputTokens: classifierResult.usage?.outputTokens, properties: { feature: "slack_feedback_classifier", integration_id: args.integrationId } })
    const classification = feedbackClassificationSchema.parse(JSON.parse(extractJsonObject(classifierResult.text)))

    if (!classification.isProductFeedback || classification.relevantMessageIds.length === 0) {
      await client.slack.markFeedbackWindowProcessed(botSecret, args.integrationId, latestPendingMessage.messageTs, latestPendingMessage.messageCreatedAt)
      await trackFeedbackProcessing({ distinctId: feedbackWindow.integration.workspaceId, platform: "slack", integrationId: args.integrationId, workspaceId: feedbackWindow.integration.workspaceId, messageCount: pendingMessages.length, isProductFeedback: classification.isProductFeedback, confidence: classification.confidence, createdTaskCount: 0, updatedTaskCount: 0, classifierDurationMs, totalDurationMs: Date.now() - processingStart })
      await client.slack.finalize(botSecret, args.integrationId, { kind: "success", reason: classification.isProductFeedback ? "not_actionable" : "not_product_feedback" })
      return
    }

    const relevantIds = new Set(classification.relevantMessageIds)
    const matchedRelevantMessages = pendingMessages.filter((message) => relevantIds.has(message.messageTs))
    const relevantMessages = matchedRelevantMessages.length > 0 ? matchedRelevantMessages : pendingMessages
    const labelsText = feedbackWindow.integration.availableLabels.length > 0 ? feedbackWindow.integration.availableLabels.join(", ") : "No predefined labels."
    const extractorSystemParts = [
      "You turn product feedback into concise task requests for a task board.",
      `The product is ${feedbackWindow.integration.workspaceName}.`,
      "Only create or update tasks for actionable feedback about the real product. Ignore unrelated discussion.",
      "Return between 0 and 5 actions total.",
      "Each action must be distinct, concrete, and understandable without requiring the original Slack thread.",
      "You can either create a new task or update an existing task.",
      "Use update when the new feedback materially adds detail to an existing open task, such as reproduction steps, missing scope, edge cases, urgency, or acceptance criteria.",
      "For update actions, use the existing taskCode and return the full revised title, description, priority, and labels after incorporating the new feedback.",
      "Descriptions should summarize the user problem and expected outcome in plain text.",
      `Allowed labels: ${labelsText}`,
      "Only use labels from the allowed list. Use an empty array when none apply.",
      'Return valid structured output only with action items shaped like {"action":"create",...} or {"action":"update","taskCode":"MDN-123",...}.',
    ]
    if (feedbackWindow.integration.additionalContext) extractorSystemParts.push(`Additional product context from the workspace owner: ${feedbackWindow.integration.additionalContext}`)
    const relevantMessageSet = new Set(relevantMessages.map((message) => message.messageTs))
    const extractorStart = Date.now()
    const extractorResult = await generateText({ model: AI_MODELS.feedbackExtractor, system: extractorSystemParts.join(" "), prompt: [`Workspace name: ${feedbackWindow.integration.workspaceName}`, `Slack team: ${feedbackWindow.integration.teamName}`, "Existing task context:", formatExistingTasks(existingTasks), "Relevant Slack messages:", formatTranscript(relevantMessages, relevantMessageSet)].join("\n\n"), experimental_output: Output.object({ schema: extractedFeedbackTasksSchema }) })
    const extractorDurationMs = Date.now() - extractorStart
    await trackLLMGeneration({ distinctId: feedbackWindow.integration.workspaceId, model: AI_MODEL_IDS.feedbackExtractor, feature: "slack_feedback_extractor", inputTokens: extractorResult.usage?.inputTokens, outputTokens: extractorResult.usage?.outputTokens, durationMs: extractorDurationMs, success: true, metadata: { integration_id: args.integrationId, relevant_message_count: relevantMessages.length } })
    await safeTrackAiUsage({ workspaceId: feedbackWindow.integration.workspaceId, workspaceName: feedbackWindow.integration.workspaceName, model: AI_MODEL_IDS.feedbackExtractor, inputTokens: extractorResult.usage?.inputTokens, outputTokens: extractorResult.usage?.outputTokens, properties: { feature: "slack_feedback_extractor", integration_id: args.integrationId } })
    const extracted = extractedFeedbackTasksSchema.parse(extractorResult.output)
    const operations: SlackFeedbackTaskOperation[] = extracted.actions.map((action) => action.action === "create" ? ({ action: "create", task: { title: action.title, description: action.description ?? undefined, status: "requests", priority: action.priority ?? "none", labels: action.labels.filter((label) => feedbackWindow.integration.availableLabels.includes(label)), source: relevantMessages[0]?.permalink ? { platform: "slack", url: relevantMessages[0].permalink, author: relevantMessages[0].authorUsername } : undefined, createdAtLabel: formatCreatedAtLabel(relevantMessages[0]?.messageCreatedAt ?? latestPendingMessage.messageCreatedAt) } }) : ({ action: "update", taskCode: action.taskCode, title: action.title, description: action.description ?? undefined, priority: action.priority ?? undefined, labels: action.labels.filter((label) => feedbackWindow.integration.availableLabels.includes(label)) }))
    const classifierCost = getAiCostForTokens({ model: AI_MODEL_IDS.feedbackClassifier, inputTokens: classifierResult.usage?.inputTokens, outputTokens: classifierResult.usage?.outputTokens })
    const extractorCost = getAiCostForTokens({ model: AI_MODEL_IDS.feedbackExtractor, inputTokens: extractorResult.usage?.inputTokens, outputTokens: extractorResult.usage?.outputTokens })
    const totalAiCost = classifierCost + extractorCost
    const taskResult = operations.length > 0 ? await client.slack.applyTaskOperations(botSecret, feedbackWindow.integration.workspaceId, operations, totalAiCost > 0 ? totalAiCost : undefined) : { createdTaskIds: [], updatedTaskIds: [] }
    await client.slack.markFeedbackWindowProcessed(botSecret, args.integrationId, latestPendingMessage.messageTs, latestPendingMessage.messageCreatedAt)
    await trackFeedbackProcessing({ distinctId: feedbackWindow.integration.workspaceId, platform: "slack", integrationId: args.integrationId, workspaceId: feedbackWindow.integration.workspaceId, messageCount: pendingMessages.length, isProductFeedback: classification.isProductFeedback, confidence: classification.confidence, createdTaskCount: taskResult.createdTaskIds.length, updatedTaskCount: taskResult.updatedTaskIds.length, classifierDurationMs, extractorDurationMs, totalDurationMs: Date.now() - processingStart })
    await client.slack.finalize(botSecret, args.integrationId, { kind: "success", reason: operations.length > 0 ? "processed" : "no_task_operations" })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    logger.error("Slack feedback worker failed", { integrationId: args.integrationId, error: message })
    try {
      await createConvexWorkerClient().slack.finalize(botSecret, args.integrationId, { kind: "failed", error: message })
    } catch (finalizeError) {
      logger.error("Failed to finalize Slack feedback worker failure", { integrationId: args.integrationId, error: finalizeError instanceof Error ? finalizeError.message : "Unknown finalize error" })
    }
  }
}
