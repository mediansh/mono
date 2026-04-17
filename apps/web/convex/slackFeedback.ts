import { generateText, Output } from "ai"
import { trackLLMGeneration, trackFeedbackProcessing } from "./posthog"
import { AI_MODEL_IDS, AI_MODELS } from "../lib/ai"
import { safeTrackAiUsage } from "../lib/billing/autumn"
import { getAiCostForTokens } from "../lib/billing/config"
import { Workpool, vOnCompleteArgs } from "@convex-dev/workpool"
import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"
import { z } from "zod"
import { components, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import type { WorkspaceQuotaStatus } from "./billing"
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"

const FEEDBACK_WINDOW_LIMIT = 100
const FEEDBACK_CONTEXT_LIMIT = 10
const EXISTING_TASK_CONTEXT_LIMIT = 50
const FEEDBACK_PROCESSING_DEBOUNCE_MS = 8_000
const FEEDBACK_PROCESSING_RETRY_DELAY_MS = 5_000
const DEFAULT_WORKPOOL_PARALLELISM = 2
const MAX_EXTRACTED_TASK_ACTIONS = 5
const MAX_EXTRACTED_TASK_LABELS = 5

type FeedbackMessage = {
  _id: Id<"slackMessages">
  channelId: string
  channelName: string | null
  threadTs: string | null
  messageTs: string
  authorUsername: string
  content: string
  permalink: string | null
  messageCreatedAt: number
}

type FeedbackWindow = {
  integration: {
    integrationId: Id<"slackWorkspaceIntegrations">
    workspaceId: Id<"workspaces">
    workspaceName: string
    availableLabels: string[]
    teamId: string
    teamName: string
    lastProcessedMessageId: string | null
    lastProcessedMessageCreatedAt: number | null
    additionalContext: string | null
  }
  messages: FeedbackMessage[]
}

type TaskSnapshot = {
  taskId: Id<"tasks">
  taskCode: string
  title: string
  description: string | null
  status: "requests" | "todo" | "in_progress" | "ready" | "shipped" | "archive"
  priority: "urgent" | "high" | "medium" | "low" | "none"
  labels: string[]
  sourceUrl: string | null
}

type SlackFeedbackTaskOperation =
  | {
      action: "create"
      task: {
        title: string
        description?: string
        status: "requests" | "todo" | "in_progress" | "ready" | "shipped" | "archive"
        priority: "urgent" | "high" | "medium" | "low" | "none"
        labels: string[]
        source?: {
          platform: "slack"
          url: string
          author: string
        }
        createdAtLabel?: string
      }
    }
  | {
      action: "update"
      taskCode: string
      title: string
      description?: string
      priority?: "urgent" | "high" | "medium" | "low" | "none"
      labels: string[]
    }

type WorkpoolResult =
  | { kind: "success"; returnValue: unknown }
  | { kind: "failed"; error: string }
  | { kind: "canceled" }

type ProcessFeedbackWindowResult =
  | { skipped: true; reason: string }
  | {
      skipped: false
      createdTaskCount: number
      updatedTaskCount: number
      reason?: string
    }

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
        priority: z
          .enum(["urgent", "high", "medium", "low", "none"])
          .nullable(),
        labels: z.array(z.string()),
      }),
      z.object({
        action: z.literal("update"),
        taskCode: z.string().min(1),
        title: z.string().min(1).max(140),
        description: z.string().max(2000).nullable(),
        priority: z
          .enum(["urgent", "high", "medium", "low", "none"])
          .nullable(),
        labels: z.array(z.string()),
      }),
    ])
  ),
})

function getFeedbackWorkpoolParallelism() {
  const parsed = Number(
    process.env.SLACK_FEEDBACK_WORKPOOL_PARALLELISM ??
      DEFAULT_WORKPOOL_PARALLELISM
  )
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_WORKPOOL_PARALLELISM
  }
  return Math.floor(parsed)
}

const slackFeedbackPool = new Workpool(components.slackFeedbackWorkpool, {
  maxParallelism: getFeedbackWorkpoolParallelism(),
  retryActionsByDefault: false,
})

const processFeedbackWindowAction = makeFunctionReference<
  "action",
  { integrationId: Id<"slackWorkspaceIntegrations"> },
  ProcessFeedbackWindowResult
>("slackFeedback:processFeedbackWindow")

const handleFeedbackProcessingCompleteMutation = makeFunctionReference<
  "mutation",
  {
    workId: string
    context: { integrationId: Id<"slackWorkspaceIntegrations"> }
    result: WorkpoolResult
  },
  null
>("slackFeedback:handleFeedbackProcessingComplete")

const getPendingFeedbackWindowInternalQuery = makeFunctionReference<
  "query",
  {
    integrationId: Id<"slackWorkspaceIntegrations">
    limit?: number
  },
  FeedbackWindow
>("slackFeedback:getPendingFeedbackWindowInternal")

const markFeedbackWindowProcessedInternalMutation = makeFunctionReference<
  "mutation",
  {
    integrationId: Id<"slackWorkspaceIntegrations">
    lastProcessedMessageId: string
    lastProcessedMessageCreatedAt: number
  },
  null
>("slackFeedback:markFeedbackWindowProcessedInternal")

const markFeedbackProcessingRunningMutation = makeFunctionReference<
  "mutation",
  { integrationId: Id<"slackWorkspaceIntegrations"> },
  boolean
>("slackFeedback:markFeedbackProcessingRunning")

const markFeedbackProcessingPausedMutation = makeFunctionReference<
  "mutation",
  {
    integrationId: Id<"slackWorkspaceIntegrations">
    reason: string
  },
  null
>("slackFeedback:markFeedbackProcessingPaused")

const getTaskSnapshotForSlackInternalQuery = makeFunctionReference<
  "query",
  {
    workspaceId: Id<"workspaces">
    limit?: number
  },
  TaskSnapshot[]
>("tasks:getTaskSnapshotForFeedbackInternal")

const createTasksFromSlackFeedbackInternalMutation = makeFunctionReference<
  "mutation",
  {
    workspaceId: Id<"workspaces">
    operations: SlackFeedbackTaskOperation[]
    cost?: number
  },
  {
    createdTaskIds: Id<"tasks">[]
    updatedTaskIds: Id<"tasks">[]
  }
>("tasks:createTasksFromSlackFeedbackInternal")

function logInfo(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.log("[convex:slack-feedback]", message, details)
    return
  }
  console.log("[convex:slack-feedback]", message)
}

function logError(
  message: string,
  error: unknown,
  details?: Record<string, unknown>
) {
  if (details) {
    console.error("[convex:slack-feedback]", message, details, error)
    return
  }
  console.error("[convex:slack-feedback]", message, error)
}

function formatCreatedAtLabel(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(timestamp)
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return a JSON object.")
  }
  return text.slice(start, end + 1)
}

function isMessageAfterCursor(
  message: { messageTs: string; messageCreatedAt: number },
  cursor: { messageId: string | null; messageCreatedAt: number | null }
) {
  if (cursor.messageCreatedAt === null || cursor.messageId === null) {
    return true
  }
  if (message.messageCreatedAt > cursor.messageCreatedAt) {
    return true
  }
  if (message.messageCreatedAt < cursor.messageCreatedAt) {
    return false
  }
  return message.messageTs > cursor.messageId
}

function formatTranscript(
  messages: FeedbackMessage[],
  pendingMessageIds: Set<string>
) {
  return messages
    .map((message) => {
      const timestamp = new Date(message.messageCreatedAt).toISOString()
      const marker = pendingMessageIds.has(message.messageTs)
        ? "NEW"
        : "CONTEXT"
      const locationParts = [
        message.threadTs ? `thread:${message.threadTs}` : null,
        message.channelName ? `channel:${message.channelName}` : null,
      ].filter(Boolean)
      const locationPrefix =
        locationParts.length > 0 ? ` [${locationParts.join(" | ")}]` : ""
      const content = message.content || "(no body text)"
      return `[${marker}] [id:${message.messageTs}] ${timestamp}${locationPrefix} ${message.authorUsername}: ${content}`
    })
    .join("\n")
}

function formatExistingTasks(tasks: TaskSnapshot[]) {
  if (tasks.length === 0) {
    return "No existing tasks."
  }
  return tasks
    .map((task) =>
      [
        `${task.taskCode} | ${task.status} | ${task.priority} | ${task.title}`,
        task.labels.length > 0 ? `labels: ${task.labels.join(", ")}` : null,
        task.description ? `description: ${task.description}` : null,
      ]
        .filter(Boolean)
        .join(" | ")
    )
    .join("\n")
}

function getCompletedProcessingReason(result: WorkpoolResult): string | null {
  if (result.kind !== "success" || typeof result.returnValue !== "object") {
    return null
  }
  const reason = (result.returnValue as { reason?: unknown } | null)?.reason
  return typeof reason === "string" ? reason : null
}

async function loadPendingFeedbackWindow(
  ctx: QueryCtx,
  integrationId: Id<"slackWorkspaceIntegrations">,
  limit: number
): Promise<FeedbackWindow> {
  const integration = await ctx.db.get(integrationId)
  if (!integration) {
    throw new Error("Slack integration not found")
  }

  const workspace = await ctx.db.get(integration.workspaceId)
  if (!workspace) {
    throw new Error("Workspace not found")
  }

  const messages = await ctx.db
    .query("slackMessages")
    .withIndex("by_integration_created_at", (q) =>
      q.eq("integrationId", integrationId)
    )
    .order("desc")
    .take(Math.min(limit, FEEDBACK_WINDOW_LIMIT))

  return {
    integration: {
      integrationId: integration._id,
      workspaceId: integration.workspaceId,
      workspaceName: workspace.name,
      availableLabels: (workspace.labels ?? []).map((label) => label.name),
      teamId: integration.teamId,
      teamName: integration.teamName,
      lastProcessedMessageId: integration.lastProcessedMessageId ?? null,
      lastProcessedMessageCreatedAt:
        integration.lastProcessedMessageCreatedAt ?? null,
      additionalContext: integration.additionalContext ?? null,
    },
    messages: messages.reverse().map((message) => ({
      _id: message._id,
      channelId: message.channelId,
      channelName: message.channelName ?? null,
      threadTs: message.threadTs ?? null,
      messageTs: message.messageTs,
      authorUsername: message.authorUsername,
      content: message.content,
      permalink: message.permalink ?? null,
      messageCreatedAt: message.messageCreatedAt,
    })),
  }
}

async function enqueueFeedbackProcessingWork(
  ctx: MutationCtx,
  integrationId: Id<"slackWorkspaceIntegrations">,
  delayMs: number
): Promise<string> {
  const workId = await slackFeedbackPool.enqueueAction(
    ctx,
    processFeedbackWindowAction,
    { integrationId },
    {
      runAfter: Math.max(0, delayMs),
      retry: false,
      onComplete: handleFeedbackProcessingCompleteMutation,
      context: { integrationId },
    }
  )

  await ctx.db.patch(integrationId, {
    feedbackProcessingState: "scheduled",
    feedbackProcessingWorkId: workId,
    feedbackProcessingNeedsRerun: false,
    feedbackProcessingQueuedAt: Date.now(),
    feedbackProcessingStartedAt: undefined,
    feedbackProcessingCompletedAt: undefined,
  })

  return workId
}

export const getPendingFeedbackWindowInternal = internalQuery({
  args: {
    integrationId: v.id("slackWorkspaceIntegrations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await loadPendingFeedbackWindow(
      ctx,
      args.integrationId,
      args.limit ?? FEEDBACK_WINDOW_LIMIT
    )
  },
})

export const markFeedbackWindowProcessedInternal = internalMutation({
  args: {
    integrationId: v.id("slackWorkspaceIntegrations"),
    lastProcessedMessageId: v.string(),
    lastProcessedMessageCreatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.integrationId)
    if (!integration) {
      throw new Error("Slack integration not found")
    }
    await ctx.db.patch(args.integrationId, {
      lastProcessedMessageId: args.lastProcessedMessageId,
      lastProcessedMessageCreatedAt: args.lastProcessedMessageCreatedAt,
      lastProcessedAt: Date.now(),
    })
  },
})

export const scheduleFeedbackDetection = internalMutation({
  args: {
    integrationId: v.id("slackWorkspaceIntegrations"),
    delayMs: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<
    | { scheduled: false; reason: "missing_integration" | "already_active" }
    | { scheduled: true; workId: string }
  > => {
    const integration = await ctx.db.get(args.integrationId)
    if (!integration) {
      return { scheduled: false, reason: "missing_integration" }
    }

    if (
      integration.feedbackProcessingState === "scheduled" ||
      integration.feedbackProcessingState === "running"
    ) {
      if (integration.feedbackProcessingNeedsRerun !== true) {
        await ctx.db.patch(args.integrationId, {
          feedbackProcessingNeedsRerun: true,
        })
      }
      return { scheduled: false, reason: "already_active" }
    }

    const workId = await enqueueFeedbackProcessingWork(
      ctx,
      args.integrationId,
      args.delayMs ?? FEEDBACK_PROCESSING_DEBOUNCE_MS
    )

    logInfo("Queued Slack feedback work", {
      integrationId: args.integrationId,
      workId,
      delayMs: args.delayMs ?? FEEDBACK_PROCESSING_DEBOUNCE_MS,
    })

    return { scheduled: true, workId }
  },
})

export const markFeedbackProcessingRunning = internalMutation({
  args: {
    integrationId: v.id("slackWorkspaceIntegrations"),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const integration = await ctx.db.get(args.integrationId)
    if (!integration) return false
    if (integration.feedbackProcessingState === "running") return false

    await ctx.db.patch(args.integrationId, {
      feedbackProcessingState: "running",
      feedbackProcessingStartedAt: Date.now(),
      feedbackProcessingLastError: undefined,
    })
    return true
  },
})

export const markFeedbackProcessingPaused = internalMutation({
  args: {
    integrationId: v.id("slackWorkspaceIntegrations"),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<null> => {
    const integration = await ctx.db.get(args.integrationId)
    if (!integration) return null

    await ctx.db.patch(args.integrationId, {
      feedbackProcessingLastError: args.reason,
    })
    return null
  },
})

export const handleFeedbackProcessingComplete = internalMutation({
  args: vOnCompleteArgs(
    v.object({
      integrationId: v.id("slackWorkspaceIntegrations"),
    })
  ),
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.context.integrationId)
    if (!integration) return

    const [latestMessage] = await ctx.db
      .query("slackMessages")
      .withIndex("by_integration_created_at", (q) =>
        q.eq("integrationId", args.context.integrationId)
      )
      .order("desc")
      .take(1)

    const hasPendingMessages = latestMessage
      ? isMessageAfterCursor(latestMessage, {
          messageId: integration.lastProcessedMessageId ?? null,
          messageCreatedAt: integration.lastProcessedMessageCreatedAt ?? null,
        })
      : false

    const latestIntegration = await ctx.db.get(args.context.integrationId)
    if (!latestIntegration) return

    const completionReason = getCompletedProcessingReason(args.result)
    const pausedForEventsExhausted = completionReason === "events_exhausted"

    const shouldRerun =
      !pausedForEventsExhausted &&
      (args.result.kind === "failed" ||
        latestIntegration.feedbackProcessingNeedsRerun === true ||
        hasPendingMessages)

    if (shouldRerun) {
      const workId = await enqueueFeedbackProcessingWork(
        ctx,
        args.context.integrationId,
        args.result.kind === "failed"
          ? FEEDBACK_PROCESSING_RETRY_DELAY_MS
          : FEEDBACK_PROCESSING_DEBOUNCE_MS
      )

      await ctx.db.patch(args.context.integrationId, {
        feedbackProcessingLastError:
          args.result.kind === "failed" ? args.result.error : undefined,
      })

      logInfo("Re-queued Slack feedback work", {
        integrationId: args.context.integrationId,
        workId,
        reason:
          args.result.kind === "failed"
            ? "failed"
            : latestIntegration.feedbackProcessingNeedsRerun
              ? "rerun_requested"
              : "pending_messages",
      })
      return
    }

    await ctx.db.patch(args.context.integrationId, {
      feedbackProcessingState: "idle",
      feedbackProcessingWorkId: undefined,
      feedbackProcessingNeedsRerun: false,
      feedbackProcessingQueuedAt: undefined,
      feedbackProcessingStartedAt: undefined,
      feedbackProcessingCompletedAt: Date.now(),
      feedbackProcessingLastError:
        pausedForEventsExhausted
          ? latestIntegration.feedbackProcessingLastError
          : args.result.kind === "failed"
            ? args.result.error
            : undefined,
    })
  },
})

export const processFeedbackWindow = internalAction({
  args: {
    integrationId: v.id("slackWorkspaceIntegrations"),
  },
  handler: async (ctx, args): Promise<ProcessFeedbackWindowResult> => {
    const processingStart = Date.now()
    const acquired = await ctx.runMutation(
      markFeedbackProcessingRunningMutation,
      { integrationId: args.integrationId }
    )
    if (!acquired) {
      return { skipped: true, reason: "already_running" }
    }

    try {
      const feedbackWindow = await ctx.runQuery(
        getPendingFeedbackWindowInternalQuery,
        {
          integrationId: args.integrationId,
          limit: FEEDBACK_WINDOW_LIMIT,
        }
      )

      const quotaStatus = (await ctx.runAction(
        internal.billing.getWorkspaceQuotaStatusInternal,
        { workspaceId: feedbackWindow.integration.workspaceId }
      )) as WorkspaceQuotaStatus

      if (quotaStatus.eventsExhausted) {
        logInfo("Skipping Slack feedback scan — events exhausted", {
          integrationId: args.integrationId,
          workspaceId: feedbackWindow.integration.workspaceId,
        })
        await ctx.runMutation(markFeedbackProcessingPausedMutation, {
          integrationId: args.integrationId,
          reason: "Paused — events exhausted (overages disabled)",
        })
        return { skipped: true, reason: "events_exhausted" }
      }

      const pendingMessages = feedbackWindow.messages.filter((message) =>
        isMessageAfterCursor(message, {
          messageId: feedbackWindow.integration.lastProcessedMessageId,
          messageCreatedAt:
            feedbackWindow.integration.lastProcessedMessageCreatedAt,
        })
      )

      logInfo("Loaded Slack feedback window", {
        integrationId: args.integrationId,
        workspaceId: feedbackWindow.integration.workspaceId,
        totalMessages: feedbackWindow.messages.length,
        pendingMessages: pendingMessages.length,
      })

      if (pendingMessages.length === 0) {
        return { skipped: true, reason: "no_pending_messages" }
      }

      const latestPendingMessage = pendingMessages.at(-1)
      if (!latestPendingMessage) {
        return { skipped: true, reason: "missing_latest_pending_message" }
      }

      const contextMessages = feedbackWindow.messages.slice(
        -FEEDBACK_CONTEXT_LIMIT
      )
      const pendingMessageIds = new Set<string>(
        pendingMessages.map((message) => message.messageTs)
      )
      const transcript = formatTranscript(contextMessages, pendingMessageIds)
      const existingTasks = await ctx.runQuery(
        getTaskSnapshotForSlackInternalQuery,
        {
          workspaceId: feedbackWindow.integration.workspaceId,
          limit: EXISTING_TASK_CONTEXT_LIMIT,
        }
      )

      const classifierSystemParts: string[] = [
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

      if (feedbackWindow.integration.additionalContext) {
        classifierSystemParts.push(
          `Additional product context from the workspace owner: ${feedbackWindow.integration.additionalContext}`
        )
      }

      const classifierStart = Date.now()
      const classifierResult = await generateText({
        model: AI_MODELS.feedbackClassifier,
        system: classifierSystemParts.join(" "),
        prompt: [
          `Workspace name: ${feedbackWindow.integration.workspaceName}`,
          `Slack team: ${feedbackWindow.integration.teamName}`,
          "Existing task context:",
          formatExistingTasks(existingTasks),
          "Conversation transcript:",
          transcript,
        ].join("\n\n"),
      })
      const classifierDurationMs = Date.now() - classifierStart

      await trackLLMGeneration({
        distinctId: feedbackWindow.integration.workspaceId,
        model: AI_MODEL_IDS.feedbackClassifier,
        feature: "slack_feedback_classifier",
        inputTokens: classifierResult.usage?.inputTokens,
        outputTokens: classifierResult.usage?.outputTokens,
        durationMs: classifierDurationMs,
        success: true,
        metadata: {
          integration_id: args.integrationId,
          pending_message_count: pendingMessages.length,
        },
      })

      await safeTrackAiUsage({
        workspaceId: feedbackWindow.integration.workspaceId,
        workspaceName: feedbackWindow.integration.workspaceName,
        model: AI_MODEL_IDS.feedbackClassifier,
        inputTokens: classifierResult.usage?.inputTokens,
        outputTokens: classifierResult.usage?.outputTokens,
        properties: {
          feature: "slack_feedback_classifier",
          integration_id: args.integrationId,
        },
      })

      const classification = feedbackClassificationSchema.parse(
        JSON.parse(extractJsonObject(classifierResult.text))
      )

      logInfo("Slack feedback classified", {
        integrationId: args.integrationId,
        isProductFeedback: classification.isProductFeedback,
        confidence: classification.confidence,
        relevantMessageCount: classification.relevantMessageIds.length,
      })

      if (
        !classification.isProductFeedback ||
        classification.relevantMessageIds.length === 0
      ) {
        const classifierCost = getAiCostForTokens({
          model: AI_MODEL_IDS.feedbackClassifier,
          inputTokens: classifierResult.usage?.inputTokens,
          outputTokens: classifierResult.usage?.outputTokens,
        })

        if (classifierCost > 0) {
          await ctx.runMutation(internal.logs.recordWorkspaceLog, {
            workspaceId: feedbackWindow.integration.workspaceId,
            category: "tasks",
            type: "feedback_processed",
            message: "Processed Slack messages (no actionable feedback)",
            source: "slack",
            cost: classifierCost,
          })
        }

        await ctx.runMutation(markFeedbackWindowProcessedInternalMutation, {
          integrationId: args.integrationId,
          lastProcessedMessageId: latestPendingMessage.messageTs,
          lastProcessedMessageCreatedAt: latestPendingMessage.messageCreatedAt,
        })

        return {
          skipped: false,
          createdTaskCount: 0,
          updatedTaskCount: 0,
          reason: "not_product_feedback",
        }
      }

      const matchedRelevantMessages = pendingMessages.filter((message) =>
        classification.relevantMessageIds.includes(message.messageTs)
      )

      const relevantMessages =
        matchedRelevantMessages.length > 0
          ? matchedRelevantMessages
          : pendingMessages

      const labelsText =
        feedbackWindow.integration.availableLabels.length > 0
          ? feedbackWindow.integration.availableLabels.join(", ")
          : "No predefined labels."

      const extractorSystemParts: string[] = [
        "You turn product feedback into concise task requests for a task board.",
        `The product is ${feedbackWindow.integration.workspaceName}.`,
        "Only create or update tasks for actionable feedback about the real product. Ignore unrelated discussion.",
        "Return between 0 and 5 actions total.",
        "Each action must be distinct, concrete, and understandable without Slack context.",
        "You can either create a new task or update an existing task.",
        "Use update when the new feedback materially adds detail to an existing open task.",
        "Do not update shipped or archived tasks.",
        "If an existing task describes the EXACT same specific issue with no meaningful new information, do not create a task and do not update anything.",
        "Descriptions should summarize the user problem and expected outcome in plain text.",
        "Priority may be urgent, high, medium, low, or none.",
        `Allowed labels: ${labelsText}`,
        "Only use labels from the allowed list. Use an empty array when none apply.",
        'Return valid structured output only with action items shaped like {"action":"create",...} or {"action":"update","taskCode":"MDN-123",...}.',
      ]

      if (feedbackWindow.integration.additionalContext) {
        extractorSystemParts.push(
          `Additional product context from the workspace owner: ${feedbackWindow.integration.additionalContext}`
        )
      }

      const extractorStart = Date.now()
      const extractorResult = await generateText({
        model: AI_MODELS.feedbackExtractor,
        output: Output.object({ schema: extractedFeedbackTasksSchema }),
        system: extractorSystemParts.join(" "),
        prompt: [
          `Classifier summary: ${classification.summary ?? classification.reason}`,
          "Existing task context:",
          formatExistingTasks(existingTasks),
          "Relevant feedback messages:",
          relevantMessages
            .map((message) =>
              [
                `- ${new Date(message.messageCreatedAt).toISOString()}`,
                message.threadTs ? `thread=${message.threadTs}` : null,
                message.channelName ? `channel=${message.channelName}` : null,
                `${message.authorUsername}: ${message.content || "(no body text)"}`,
              ]
                .filter(Boolean)
                .join(" | ")
            )
            .join("\n"),
        ].join("\n\n"),
      })
      const extractorDurationMs = Date.now() - extractorStart
      const extracted = extractorResult.output

      await trackLLMGeneration({
        distinctId: feedbackWindow.integration.workspaceId,
        model: AI_MODEL_IDS.feedbackExtractor,
        feature: "slack_feedback_extractor",
        inputTokens: extractorResult.usage?.inputTokens,
        outputTokens: extractorResult.usage?.outputTokens,
        durationMs: extractorDurationMs,
        success: true,
        metadata: {
          integration_id: args.integrationId,
          relevant_message_count: relevantMessages.length,
          existing_task_count: existingTasks.length,
        },
      })

      await safeTrackAiUsage({
        workspaceId: feedbackWindow.integration.workspaceId,
        workspaceName: feedbackWindow.integration.workspaceName,
        model: AI_MODEL_IDS.feedbackExtractor,
        inputTokens: extractorResult.usage?.inputTokens,
        outputTokens: extractorResult.usage?.outputTokens,
        properties: {
          feature: "slack_feedback_extractor",
          integration_id: args.integrationId,
        },
      })

      const totalAiCost =
        getAiCostForTokens({
          model: AI_MODEL_IDS.feedbackClassifier,
          inputTokens: classifierResult.usage?.inputTokens,
          outputTokens: classifierResult.usage?.outputTokens,
        }) +
        getAiCostForTokens({
          model: AI_MODEL_IDS.feedbackExtractor,
          inputTokens: extractorResult.usage?.inputTokens,
          outputTokens: extractorResult.usage?.outputTokens,
        })

      if (!extracted) {
        if (totalAiCost > 0) {
          await ctx.runMutation(internal.logs.recordWorkspaceLog, {
            workspaceId: feedbackWindow.integration.workspaceId,
            category: "tasks",
            type: "feedback_processed",
            message: "Processed Slack messages (no actionable feedback)",
            source: "slack",
            cost: totalAiCost,
          })
        }

        await ctx.runMutation(markFeedbackWindowProcessedInternalMutation, {
          integrationId: args.integrationId,
          lastProcessedMessageId: latestPendingMessage.messageTs,
          lastProcessedMessageCreatedAt: latestPendingMessage.messageCreatedAt,
        })

        return {
          skipped: false,
          createdTaskCount: 0,
          updatedTaskCount: 0,
          reason: "no_structured_output",
        }
      }

      let createdTaskCount = 0
      let updatedTaskCount = 0

      const extractedActions = extracted.actions.slice(
        0,
        MAX_EXTRACTED_TASK_ACTIONS
      )

      if (extractedActions.length > 0) {
        const authors = Array.from(
          new Set(relevantMessages.map((message) => message.authorUsername))
        )
        const sourceUrl =
          relevantMessages[relevantMessages.length - 1]?.permalink
        const createdAtLabel = formatCreatedAtLabel(
          latestPendingMessage.messageCreatedAt
        )

        const result = await ctx.runMutation(
          createTasksFromSlackFeedbackInternalMutation,
          {
            workspaceId: feedbackWindow.integration.workspaceId,
            operations: extractedActions.map((action) =>
              action.action === "create"
                ? {
                    action: "create" as const,
                    task: {
                      title: action.title,
                      description: action.description ?? undefined,
                      status: "requests" as const,
                      priority: action.priority ?? "none",
                      labels: action.labels
                        .slice(0, MAX_EXTRACTED_TASK_LABELS)
                        .filter((label) =>
                          feedbackWindow.integration.availableLabels.includes(
                            label
                          )
                        ),
                      source: sourceUrl
                        ? {
                            platform: "slack" as const,
                            url: sourceUrl,
                            author: authors.join(", "),
                          }
                        : undefined,
                      createdAtLabel,
                    },
                  }
                : {
                    action: "update" as const,
                    taskCode: action.taskCode,
                    title: action.title,
                    description: action.description ?? undefined,
                    priority: action.priority ?? undefined,
                    labels: action.labels
                      .slice(0, MAX_EXTRACTED_TASK_LABELS)
                      .filter((label) =>
                        feedbackWindow.integration.availableLabels.includes(
                          label
                        )
                      ),
                  }
            ),
            cost: totalAiCost > 0 ? totalAiCost : undefined,
          }
        )

        createdTaskCount = result.createdTaskIds.length
        updatedTaskCount = result.updatedTaskIds.length
      } else if (totalAiCost > 0) {
        await ctx.runMutation(internal.logs.recordWorkspaceLog, {
          workspaceId: feedbackWindow.integration.workspaceId,
          category: "tasks",
          type: "feedback_processed",
          message: "Processed Slack messages (no actionable feedback)",
          source: "slack",
          cost: totalAiCost,
        })
      }

      await ctx.runMutation(markFeedbackWindowProcessedInternalMutation, {
        integrationId: args.integrationId,
        lastProcessedMessageId: latestPendingMessage.messageTs,
        lastProcessedMessageCreatedAt: latestPendingMessage.messageCreatedAt,
      })

      logInfo("Finished Slack feedback processing attempt", {
        integrationId: args.integrationId,
        createdTaskCount,
        updatedTaskCount,
      })

      await trackFeedbackProcessing({
        distinctId: feedbackWindow.integration.workspaceId,
        platform: "slack",
        integrationId: args.integrationId,
        workspaceId: feedbackWindow.integration.workspaceId,
        messageCount: pendingMessages.length,
        isProductFeedback: classification.isProductFeedback,
        confidence: classification.confidence,
        createdTaskCount,
        updatedTaskCount,
        classifierDurationMs,
        extractorDurationMs,
        totalDurationMs: Date.now() - processingStart,
      })

      return {
        skipped: false,
        createdTaskCount,
        updatedTaskCount,
      }
    } catch (error) {
      logError("Failed to process Slack feedback window", error, {
        integrationId: args.integrationId,
      })
      throw error
    }
  },
})
