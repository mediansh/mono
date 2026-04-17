import { trackFeedbackProcessing } from "./posthog"
import { Workpool, vOnCompleteArgs } from "@convex-dev/workpool"
import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"
import { components, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import type { WorkspaceQuotaStatus } from "./billing"
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import {
  runFeedbackPipeline,
  type ExistingTask,
  type FeedbackMessage,
  type TaskAction,
} from "./feedbackPipeline"

const FEEDBACK_WINDOW_LIMIT = 100
const FEEDBACK_CONTEXT_LIMIT = 10
const EXISTING_TASK_CONTEXT_LIMIT = 50
const FEEDBACK_PROCESSING_DEBOUNCE_MS = 8_000
const FEEDBACK_PROCESSING_RETRY_DELAY_MS = 5_000
const DEFAULT_WORKPOOL_PARALLELISM = 2

type SlackMessageRow = {
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
  messages: SlackMessageRow[]
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
  ExistingTask[]
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

function isMessageAfterCursor(
  message: { messageTs: string; messageCreatedAt: number },
  cursor: { messageId: string | null; messageCreatedAt: number | null }
) {
  if (cursor.messageCreatedAt === null || cursor.messageId === null) return true
  if (message.messageCreatedAt > cursor.messageCreatedAt) return true
  if (message.messageCreatedAt < cursor.messageCreatedAt) return false
  return message.messageTs > cursor.messageId
}

function toFeedbackMessage(row: SlackMessageRow): FeedbackMessage {
  const locationLabels = [
    row.threadTs ? `thread:${row.threadTs}` : null,
    row.channelName ? `channel:${row.channelName}` : null,
  ].filter((value): value is string => Boolean(value))

  return {
    id: row.messageTs,
    authorUsername: row.authorUsername,
    content: row.content,
    permalink: row.permalink,
    createdAt: row.messageCreatedAt,
    locationLabels,
    isAdmin: false,
  }
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

export const finalizeDelegatedFeedbackProcessing = mutation({
  args: {
    botSecret: v.string(),
    integrationId: v.id("slackWorkspaceIntegrations"),
    result: v.object({
      kind: v.union(
        v.literal("success"),
        v.literal("failed"),
        v.literal("canceled")
      ),
      error: v.optional(v.string()),
      reason: v.optional(v.string()),
      pauseReason: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const configuredSecret = process.env.SLACK_BOT_SECRET
    if (!configuredSecret || args.botSecret !== configuredSecret) {
      throw new Error("Invalid Slack bot secret")
    }

    const integration = await ctx.db.get(args.integrationId)
    if (!integration) return null

    const [latestMessage] = await ctx.db
      .query("slackMessages")
      .withIndex("by_integration_created_at", (q) =>
        q.eq("integrationId", args.integrationId)
      )
      .order("desc")
      .take(1)

    const hasPendingMessages = latestMessage
      ? isMessageAfterCursor(latestMessage, {
          messageId: integration.lastProcessedMessageId ?? null,
          messageCreatedAt: integration.lastProcessedMessageCreatedAt ?? null,
        })
      : false

    const latestIntegration = await ctx.db.get(args.integrationId)
    if (!latestIntegration) return null

    const pausedForEventsExhausted = args.result.reason === "events_exhausted"
    const shouldRerun =
      !pausedForEventsExhausted &&
      (args.result.kind === "failed" ||
        latestIntegration.feedbackProcessingNeedsRerun === true ||
        hasPendingMessages)

    if (shouldRerun) {
      const workId = await enqueueFeedbackProcessingWork(
        ctx,
        args.integrationId,
        args.result.kind === "failed"
          ? FEEDBACK_PROCESSING_RETRY_DELAY_MS
          : FEEDBACK_PROCESSING_DEBOUNCE_MS
      )

      await ctx.db.patch(args.integrationId, {
        feedbackProcessingLastError:
          args.result.kind === "failed" ? args.result.error : undefined,
      })

      logInfo("Re-queued delegated Slack feedback work", {
        integrationId: args.integrationId,
        workId,
        reason:
          args.result.kind === "failed"
            ? "failed"
            : latestIntegration.feedbackProcessingNeedsRerun
              ? "rerun_requested"
              : "pending_messages",
      })
      return null
    }

    await ctx.db.patch(args.integrationId, {
      feedbackProcessingState: "idle",
      feedbackProcessingWorkId: undefined,
      feedbackProcessingNeedsRerun: false,
      feedbackProcessingQueuedAt: undefined,
      feedbackProcessingStartedAt: undefined,
      feedbackProcessingCompletedAt: Date.now(),
      feedbackProcessingLastError:
        pausedForEventsExhausted
          ? (args.result.pauseReason ?? latestIntegration.feedbackProcessingLastError)
          : args.result.kind === "failed"
            ? args.result.error
            : undefined,
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

    const completionReason = getCompletedProcessingReason(args.result)
    if (completionReason === "delegated") return

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
    const acquired = await ctx.runMutation(
      markFeedbackProcessingRunningMutation,
      { integrationId: args.integrationId }
    )
    if (!acquired) {
      return { skipped: true, reason: "already_running" }
    }

    const processingStart = Date.now()

    try {
      const feedbackWindow: FeedbackWindow = await ctx.runQuery(
        getPendingFeedbackWindowInternalQuery,
        {
          integrationId: args.integrationId,
          limit: FEEDBACK_WINDOW_LIMIT,
        }
      )

      const quotaStatus: WorkspaceQuotaStatus = await ctx.runAction(
        internal.billing.getWorkspaceQuotaStatusInternal,
        { workspaceId: feedbackWindow.integration.workspaceId }
      )

      if (quotaStatus.eventsExhausted) {
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

      const existingTasks: ExistingTask[] = await ctx.runQuery(
        getTaskSnapshotForSlackInternalQuery,
        {
          workspaceId: feedbackWindow.integration.workspaceId,
          limit: EXISTING_TASK_CONTEXT_LIMIT,
        }
      )

      const pipelineResult = await runFeedbackPipeline({
        platform: "slack",
        workspaceId: feedbackWindow.integration.workspaceId,
        workspaceName: feedbackWindow.integration.workspaceName,
        integrationId: args.integrationId,
        availableLabels: feedbackWindow.integration.availableLabels,
        additionalContext: feedbackWindow.integration.additionalContext,
        workspaceContextLines: [
          `Slack team: ${feedbackWindow.integration.teamName}`,
        ],
        pendingMessages: pendingMessages.map(toFeedbackMessage),
        contextMessages: contextMessages.map(toFeedbackMessage),
        existingTasks,
      })

      const cursor = {
        messageId: latestPendingMessage.messageTs,
        messageCreatedAt: latestPendingMessage.messageCreatedAt,
      }
      async function markProcessed() {
        await ctx.runMutation(markFeedbackWindowProcessedInternalMutation, {
          integrationId: args.integrationId,
          lastProcessedMessageId: cursor.messageId,
          lastProcessedMessageCreatedAt: cursor.messageCreatedAt,
        })
      }

      if (pipelineResult.kind === "skip") {
        await markProcessed()
        await trackFeedbackProcessing({
          distinctId: feedbackWindow.integration.workspaceId,
          platform: "slack",
          integrationId: args.integrationId,
          workspaceId: feedbackWindow.integration.workspaceId,
          messageCount: pendingMessages.length,
          isProductFeedback: pipelineResult.classification.isProductFeedback,
          confidence: pipelineResult.classification.confidence,
          createdTaskCount: 0,
          updatedTaskCount: 0,
          classifierDurationMs: pipelineResult.classifierDurationMs,
          totalDurationMs: Date.now() - processingStart,
        })
        return {
          skipped: false,
          createdTaskCount: 0,
          updatedTaskCount: 0,
          reason: pipelineResult.reason,
        }
      }

      if (pipelineResult.kind === "no_structured_output") {
        logInfo("Slack feedback extractor produced no structured output", {
          integrationId: args.integrationId,
        })
        await markProcessed()
        await trackFeedbackProcessing({
          distinctId: feedbackWindow.integration.workspaceId,
          platform: "slack",
          integrationId: args.integrationId,
          workspaceId: feedbackWindow.integration.workspaceId,
          messageCount: pendingMessages.length,
          isProductFeedback: pipelineResult.classification.isProductFeedback,
          confidence: pipelineResult.classification.confidence,
          createdTaskCount: 0,
          updatedTaskCount: 0,
          classifierDurationMs: pipelineResult.classifierDurationMs,
          extractorDurationMs: pipelineResult.extractorDurationMs,
          totalDurationMs: Date.now() - processingStart,
        })
        return {
          skipped: false,
          createdTaskCount: 0,
          updatedTaskCount: 0,
          reason: "no_structured_output",
        }
      }

      const firstRelevantMessage = pipelineResult.relevantMessages[0]
      const operations: SlackFeedbackTaskOperation[] =
        pipelineResult.operations.map((action) =>
          actionToSlackOperation(
            action,
            firstRelevantMessage,
            latestPendingMessage.messageCreatedAt
          )
        )

      const totalAiCost =
        pipelineResult.classifierCost + pipelineResult.extractorCost
      const taskResult =
        operations.length > 0
          ? await ctx.runMutation(
              createTasksFromSlackFeedbackInternalMutation,
              {
                workspaceId: feedbackWindow.integration.workspaceId,
                operations,
                cost: totalAiCost > 0 ? totalAiCost : undefined,
              }
            )
          : { createdTaskIds: [], updatedTaskIds: [] }

      await markProcessed()

      await trackFeedbackProcessing({
        distinctId: feedbackWindow.integration.workspaceId,
        platform: "slack",
        integrationId: args.integrationId,
        workspaceId: feedbackWindow.integration.workspaceId,
        messageCount: pendingMessages.length,
        isProductFeedback: pipelineResult.classification.isProductFeedback,
        confidence: pipelineResult.classification.confidence,
        createdTaskCount: taskResult.createdTaskIds.length,
        updatedTaskCount: taskResult.updatedTaskIds.length,
        classifierDurationMs: pipelineResult.classifierDurationMs,
        extractorDurationMs: pipelineResult.extractorDurationMs,
        totalDurationMs: Date.now() - processingStart,
      })

      return {
        skipped: false,
        createdTaskCount: taskResult.createdTaskIds.length,
        updatedTaskCount: taskResult.updatedTaskIds.length,
        reason: operations.length > 0 ? "processed" : "no_task_operations",
      }
    } catch (error) {
      logError("Slack feedback processing failed", error, {
        integrationId: args.integrationId,
      })
      throw error
    }
  },
})

function actionToSlackOperation(
  action: TaskAction,
  firstRelevantMessage: FeedbackMessage | undefined,
  fallbackCreatedAt: number
): SlackFeedbackTaskOperation {
  if (action.action === "create") {
    return {
      action: "create",
      task: {
        title: action.title,
        description: action.description ?? undefined,
        status: "requests",
        priority: action.priority ?? "none",
        labels: action.labels,
        source:
          firstRelevantMessage?.permalink
            ? {
                platform: "slack",
                url: firstRelevantMessage.permalink,
                author: firstRelevantMessage.authorUsername,
              }
            : undefined,
        createdAtLabel: formatCreatedAtLabel(
          firstRelevantMessage?.createdAt ?? fallbackCreatedAt
        ),
      },
    }
  }

  return {
    action: "update",
    taskCode: action.taskCode,
    title: action.title,
    description: action.description ?? undefined,
    priority: action.priority ?? undefined,
    labels: action.labels,
  }
}
