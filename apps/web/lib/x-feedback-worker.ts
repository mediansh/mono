import { generateText, Output } from "ai"
import { z } from "zod"
import type { Id } from "@/convex/_generated/dataModel"
import { AI_MODEL_IDS, AI_MODELS } from "@/lib/ai"
import { safeTrackAiUsage } from "@/lib/billing/autumn"
import { getAiCostForTokens } from "@/lib/billing/config"
import { logger } from "@/lib/logger"
import {
  createConvexWorkerClient,
  type XFeedbackTaskOperation,
  type XFeedbackWindow,
  type TaskSnapshot,
} from "@/lib/convex-worker-client"
import { trackFeedbackProcessing, trackLLMGeneration } from "@/convex/posthog"

const FEEDBACK_WINDOW_LIMIT = 100
const FEEDBACK_CONTEXT_LIMIT = 10
const EXISTING_TASK_CONTEXT_LIMIT = 50

type FeedbackPost = XFeedbackWindow["posts"][number]

const feedbackClassificationSchema = z.object({
  isProductFeedback: z.boolean(),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).nullable(),
  reason: z.string().min(1),
  relevantPostIds: z.array(z.string()).max(25),
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
function normalizeId(id: string) { return id.trim().replace(/\D/g, "") }
function isPostAfterCursor(post: { postId: string; postCreatedAt: number }, cursor: { postId: string | null; postCreatedAt: number | null }) { if (cursor.postCreatedAt === null || cursor.postId === null) return true; if (post.postCreatedAt > cursor.postCreatedAt) return true; if (post.postCreatedAt < cursor.postCreatedAt) return false; return BigInt(post.postId) > BigInt(cursor.postId) }
function formatTranscript(posts: FeedbackPost[], pendingPostIds: Set<string>) { return posts.map((post) => { const timestamp = new Date(post.postCreatedAt).toISOString(); const marker = pendingPostIds.has(post.postId) ? "NEW" : "CONTEXT"; return `[${marker}] [id:${post.postId}] ${timestamp} @${post.authorUsername}: ${post.content}` }).join("\n") }
function formatExistingTasks(tasks: TaskSnapshot[]) { if (tasks.length === 0) return "No existing tasks."; return tasks.map((task) => [ `${task.taskCode} | ${task.status} | ${task.priority} | ${task.title}`, task.labels.length > 0 ? `labels: ${task.labels.join(", ")}` : null, task.description ? `description: ${task.description}` : null ].filter(Boolean).join(" | ")).join("\n") }

export async function processXFeedbackInBackground(args: { integrationId: Id<"xWorkspaceIntegrations"> }) {
  const botSecret = getRequiredEnv("X_API_SECRET")
  const client = createConvexWorkerClient()

  try {
    const processingStart = Date.now()
    const feedbackWindow = await client.x.getPendingFeedbackWindow(botSecret, args.integrationId, FEEDBACK_WINDOW_LIMIT)
    const quotaStatus = await client.x.getWorkspaceQuotaStatus(botSecret, feedbackWindow.integration.workspaceId)
    if (quotaStatus.eventsExhausted) {
      await client.x.finalize(botSecret, args.integrationId, { kind: "success", reason: "events_exhausted", pauseReason: "Paused — events exhausted (overages disabled)" })
      return
    }

    const pendingPosts = feedbackWindow.posts.filter((post) => isPostAfterCursor(post, { postId: feedbackWindow.integration.lastProcessedPostId, postCreatedAt: feedbackWindow.integration.lastProcessedPostCreatedAt }))
    if (pendingPosts.length === 0) {
      await client.x.finalize(botSecret, args.integrationId, { kind: "success", reason: "no_pending_posts" })
      return
    }

    const latestPendingPost = pendingPosts.at(-1)
    if (!latestPendingPost) {
      await client.x.finalize(botSecret, args.integrationId, { kind: "success", reason: "missing_latest_pending_post" })
      return
    }

    const contextPosts = feedbackWindow.posts.slice(-FEEDBACK_CONTEXT_LIMIT)
    const pendingPostIds = new Set(pendingPosts.map((post) => post.postId))
    const transcript = formatTranscript(contextPosts, pendingPostIds)
    const existingTasks = await client.x.getTaskSnapshot(botSecret, feedbackWindow.integration.workspaceId, EXISTING_TASK_CONTEXT_LIMIT)
    const classifierSystemParts = [
      "You classify inbound X mentions and replies for a product team.",
      `The only product that matters is ${feedbackWindow.integration.workspaceName}.`,
      "Return isProductFeedback=true only when the newest posts contain concrete product feedback, a bug report, a feature request, workflow friction, or an actionable complaint about the actual product.",
      "Reject hype, compliments without a request, memes, repost-style chatter, marketing banter, hiring talk, and anything unrelated to the product itself.",
      "Use the recent context only to interpret what the new posts refer to.",
      "If the new posts add detail, scope, reproduction steps, or acceptance criteria to an existing open task, that is still product feedback.",
      "Only include relevantPostIds from NEW posts.",
      "Each post has an [id:XXXXXXX] tag. Use the numeric ID from that tag as the relevantPostId, NOT the timestamp.",
      "Return valid JSON only. No markdown. No code fences. No commentary.",
      'Use this exact JSON shape: {"isProductFeedback":false,"confidence":0.0,"summary":null,"reason":"...","relevantPostIds":["123456789"]}',
    ]
    if (feedbackWindow.integration.additionalContext) classifierSystemParts.push(`Additional product context from the workspace owner: ${feedbackWindow.integration.additionalContext}`)
    const classifierStart = Date.now()
    const classifierResult = await generateText({ model: AI_MODELS.feedbackClassifier, system: classifierSystemParts.join(" "), prompt: [`Workspace name: ${feedbackWindow.integration.workspaceName}`, `Connected X account: @${feedbackWindow.integration.username}`, "Existing task context:", formatExistingTasks(existingTasks), "Inbound post transcript:", transcript].join("\n\n") })
    const classifierDurationMs = Date.now() - classifierStart
    await trackLLMGeneration({ distinctId: feedbackWindow.integration.workspaceId, model: AI_MODEL_IDS.feedbackClassifier, feature: "x_feedback_classifier", inputTokens: classifierResult.usage?.inputTokens, outputTokens: classifierResult.usage?.outputTokens, durationMs: classifierDurationMs, success: true, metadata: { integration_id: args.integrationId, pending_post_count: pendingPosts.length } })
    await safeTrackAiUsage({ workspaceId: feedbackWindow.integration.workspaceId, workspaceName: feedbackWindow.integration.workspaceName, model: AI_MODEL_IDS.feedbackClassifier, inputTokens: classifierResult.usage?.inputTokens, outputTokens: classifierResult.usage?.outputTokens, properties: { feature: "x_feedback_classifier", integration_id: args.integrationId } })
    const classification = feedbackClassificationSchema.parse(JSON.parse(extractJsonObject(classifierResult.text)))

    if (!classification.isProductFeedback || classification.relevantPostIds.length === 0) {
      await client.x.markFeedbackWindowProcessed(botSecret, args.integrationId, latestPendingPost.postId, latestPendingPost.postCreatedAt)
      await trackFeedbackProcessing({ distinctId: feedbackWindow.integration.workspaceId, platform: "x", integrationId: args.integrationId, workspaceId: feedbackWindow.integration.workspaceId, messageCount: pendingPosts.length, isProductFeedback: classification.isProductFeedback, confidence: classification.confidence, createdTaskCount: 0, updatedTaskCount: 0, classifierDurationMs, totalDurationMs: Date.now() - processingStart })
      await client.x.finalize(botSecret, args.integrationId, { kind: "success", reason: "not_product_feedback" })
      return
    }

    const normalizedRelevantIds = new Set(classification.relevantPostIds.map((postId) => normalizeId(postId)).filter(Boolean))
    const matchedRelevantPosts = pendingPosts.filter((post) => normalizedRelevantIds.has(normalizeId(post.postId)))
    const relevantPosts = matchedRelevantPosts.length > 0 ? matchedRelevantPosts : pendingPosts
    const labelsText = feedbackWindow.integration.availableLabels.length > 0 ? feedbackWindow.integration.availableLabels.join(", ") : "No predefined labels."
    const extractorSystemParts = [
      "You turn product feedback into concise task requests for a task board.",
      `The product is ${feedbackWindow.integration.workspaceName}.`,
      "Only create or update tasks for actionable feedback about the real product. Ignore unrelated discussion.",
      "Return between 0 and 5 actions total.",
      "Each action must be distinct, concrete, and understandable without requiring the original X post.",
      "You can either create a new task or update an existing task.",
      "Use update when the new feedback materially adds detail to an existing open task, such as reproduction steps, missing scope, edge cases, urgency, or acceptance criteria.",
      "For update actions, use the existing taskCode and return the full revised title, description, priority, and labels after incorporating the new feedback.",
      "Descriptions should summarize the user problem and expected outcome in plain text.",
      `Allowed labels: ${labelsText}`,
      "Only use labels from the allowed list. Use an empty array when none apply.",
      'Return valid structured output only with action items shaped like {"action":"create",...} or {"action":"update","taskCode":"MDN-123",...}.',
    ]
    if (feedbackWindow.integration.additionalContext) extractorSystemParts.push(`Additional product context from the workspace owner: ${feedbackWindow.integration.additionalContext}`)
    const relevantPostSet = new Set(relevantPosts.map((post) => post.postId))
    const extractorStart = Date.now()
    const extractorResult = await generateText({ model: AI_MODELS.feedbackExtractor, system: extractorSystemParts.join(" "), prompt: [`Workspace name: ${feedbackWindow.integration.workspaceName}`, `Connected X account: @${feedbackWindow.integration.username}`, "Existing task context:", formatExistingTasks(existingTasks), "Relevant posts:", formatTranscript(relevantPosts, relevantPostSet)].join("\n\n"), output: Output.object({ schema: extractedFeedbackTasksSchema }) })
    const extractorDurationMs = Date.now() - extractorStart
    await trackLLMGeneration({ distinctId: feedbackWindow.integration.workspaceId, model: AI_MODEL_IDS.feedbackExtractor, feature: "x_feedback_extractor", inputTokens: extractorResult.usage?.inputTokens, outputTokens: extractorResult.usage?.outputTokens, durationMs: extractorDurationMs, success: true, metadata: { integration_id: args.integrationId, relevant_post_count: relevantPosts.length } })
    await safeTrackAiUsage({ workspaceId: feedbackWindow.integration.workspaceId, workspaceName: feedbackWindow.integration.workspaceName, model: AI_MODEL_IDS.feedbackExtractor, inputTokens: extractorResult.usage?.inputTokens, outputTokens: extractorResult.usage?.outputTokens, properties: { feature: "x_feedback_extractor", integration_id: args.integrationId } })
    const extracted = extractedFeedbackTasksSchema.parse(extractorResult.output)
    const operations: XFeedbackTaskOperation[] = extracted.actions.map((action) => action.action === "create" ? ({ action: "create", task: { title: action.title, description: action.description ?? undefined, status: "requests", priority: action.priority ?? "none", labels: action.labels.filter((label) => feedbackWindow.integration.availableLabels.includes(label)), source: relevantPosts[0] ? { platform: "x", url: relevantPosts[0].permalink, author: relevantPosts[0].authorUsername } : undefined, createdAtLabel: formatCreatedAtLabel(relevantPosts[0]?.postCreatedAt ?? latestPendingPost.postCreatedAt) } }) : ({ action: "update", taskCode: action.taskCode, title: action.title, description: action.description ?? undefined, priority: action.priority ?? undefined, labels: action.labels.filter((label) => feedbackWindow.integration.availableLabels.includes(label)) }))
    const classifierCost = getAiCostForTokens({ model: AI_MODEL_IDS.feedbackClassifier, inputTokens: classifierResult.usage?.inputTokens, outputTokens: classifierResult.usage?.outputTokens })
    const extractorCost = getAiCostForTokens({ model: AI_MODEL_IDS.feedbackExtractor, inputTokens: extractorResult.usage?.inputTokens, outputTokens: extractorResult.usage?.outputTokens })
    const totalAiCost = classifierCost + extractorCost
    const taskResult = operations.length > 0 ? await client.x.applyTaskOperations(botSecret, feedbackWindow.integration.workspaceId, operations, totalAiCost > 0 ? totalAiCost : undefined) : { createdTaskIds: [], updatedTaskIds: [] }
    await client.x.markFeedbackWindowProcessed(botSecret, args.integrationId, latestPendingPost.postId, latestPendingPost.postCreatedAt)
    await trackFeedbackProcessing({ distinctId: feedbackWindow.integration.workspaceId, platform: "x", integrationId: args.integrationId, workspaceId: feedbackWindow.integration.workspaceId, messageCount: pendingPosts.length, isProductFeedback: classification.isProductFeedback, confidence: classification.confidence, createdTaskCount: taskResult.createdTaskIds.length, updatedTaskCount: taskResult.updatedTaskIds.length, classifierDurationMs, extractorDurationMs, totalDurationMs: Date.now() - processingStart })
    await client.x.finalize(botSecret, args.integrationId, { kind: "success", reason: operations.length > 0 ? "processed" : "no_task_operations" })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    logger.error("X feedback worker failed", { integrationId: args.integrationId, error: message })
    try {
      await createConvexWorkerClient().x.finalize(botSecret, args.integrationId, { kind: "failed", error: message })
    } catch (finalizeError) {
      logger.error("Failed to finalize X feedback worker failure", { integrationId: args.integrationId, error: finalizeError instanceof Error ? finalizeError.message : "Unknown finalize error" })
    }
  }
}
