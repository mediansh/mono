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

type XPostRow = {
  _id: Id<"xPosts">
  postId: string
  authorUsername: string
  content: string
  permalink: string
  postCreatedAt: number
}

type FeedbackWindow = {
  integration: {
    integrationId: Id<"xWorkspaceIntegrations">
    workspaceId: Id<"workspaces">
    workspaceName: string
    availableLabels: string[]
    xUserId: string
    username: string
    lastProcessedPostId: string | null
    lastProcessedPostCreatedAt: number | null
    additionalContext: string | null
  }
  posts: XPostRow[]
}

type XFeedbackCreateTaskInput = {
  title: string
  description?: string
  status: "requests" | "todo" | "in_progress" | "ready" | "shipped" | "archive"
  priority: "urgent" | "high" | "medium" | "low" | "none"
  labels: string[]
  source?: {
    platform: "x"
    url: string
    author: string
  }
  createdAtLabel?: string
}

type XFeedbackTaskOperation =
  | {
      action: "create"
      task: XFeedbackCreateTaskInput
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
    process.env.X_FEEDBACK_WORKPOOL_PARALLELISM ?? DEFAULT_WORKPOOL_PARALLELISM
  )
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_WORKPOOL_PARALLELISM
  }
  return Math.floor(parsed)
}

const xFeedbackPool = new Workpool(components.xFeedbackWorkpool, {
  maxParallelism: getFeedbackWorkpoolParallelism(),
  retryActionsByDefault: false,
})

const processFeedbackWindowAction = makeFunctionReference<
  "action",
  { integrationId: Id<"xWorkspaceIntegrations"> },
  ProcessFeedbackWindowResult
>("xFeedback:processFeedbackWindow")

const handleFeedbackProcessingCompleteMutation = makeFunctionReference<
  "mutation",
  {
    workId: string
    context: { integrationId: Id<"xWorkspaceIntegrations"> }
    result: WorkpoolResult
  },
  null
>("xFeedback:handleFeedbackProcessingComplete")

function getCompletedProcessingReason(result: WorkpoolResult): string | null {
  if (result.kind !== "success" || typeof result.returnValue !== "object") {
    return null
  }
  const reason = (result.returnValue as { reason?: unknown } | null)?.reason
  return typeof reason === "string" ? reason : null
}

const getPendingFeedbackWindowInternalQuery = makeFunctionReference<
  "query",
  {
    integrationId: Id<"xWorkspaceIntegrations">
    limit?: number
  },
  FeedbackWindow
>("xFeedback:getPendingFeedbackWindowInternal")

const markFeedbackWindowProcessedInternalMutation = makeFunctionReference<
  "mutation",
  {
    integrationId: Id<"xWorkspaceIntegrations">
    lastProcessedPostId: string
    lastProcessedPostCreatedAt: number
  },
  null
>("xFeedback:markFeedbackWindowProcessedInternal")

const markFeedbackProcessingRunningMutation = makeFunctionReference<
  "mutation",
  { integrationId: Id<"xWorkspaceIntegrations"> },
  boolean
>("xFeedback:markFeedbackProcessingRunning")

const markFeedbackProcessingPausedMutation = makeFunctionReference<
  "mutation",
  {
    integrationId: Id<"xWorkspaceIntegrations">
    reason: string
  },
  null
>("xFeedback:markFeedbackProcessingPaused")

const getTaskSnapshotForFeedbackInternalQuery = makeFunctionReference<
  "query",
  {
    workspaceId: Id<"workspaces">
    limit?: number
  },
  ExistingTask[]
>("tasks:getTaskSnapshotForFeedbackInternal")

const createTasksFromFeedbackInternalMutation = makeFunctionReference<
  "mutation",
  {
    workspaceId: Id<"workspaces">
    operations: XFeedbackTaskOperation[]
    cost?: number
  },
  {
    createdTaskIds: Id<"tasks">[]
    updatedTaskIds: Id<"tasks">[]
  }
>("tasks:createTasksFromFeedbackInternal")

function logInfo(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.log("[convex:x-feedback]", message, details)
    return
  }
  console.log("[convex:x-feedback]", message)
}

function logError(
  message: string,
  error: unknown,
  details?: Record<string, unknown>
) {
  if (details) {
    console.error("[convex:x-feedback]", message, details, error)
    return
  }
  console.error("[convex:x-feedback]", message, error)
}

function formatCreatedAtLabel(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(timestamp)
}

function isPostAfterCursor(
  post: { postId: string; postCreatedAt: number },
  cursor: { postId: string | null; postCreatedAt: number | null }
) {
  if (cursor.postCreatedAt === null || cursor.postId === null) return true
  if (post.postCreatedAt > cursor.postCreatedAt) return true
  if (post.postCreatedAt < cursor.postCreatedAt) return false
  return BigInt(post.postId) > BigInt(cursor.postId)
}

function toFeedbackMessage(row: XPostRow): FeedbackMessage {
  return {
    id: row.postId,
    authorUsername: `@${row.authorUsername}`,
    content: row.content,
    permalink: row.permalink,
    createdAt: row.postCreatedAt,
    locationLabels: [],
    isAdmin: false,
  }
}

async function loadPendingFeedbackWindow(
  ctx: QueryCtx,
  integrationId: Id<"xWorkspaceIntegrations">,
  limit: number
): Promise<FeedbackWindow> {
  const integration = await ctx.db.get(integrationId)
  if (!integration) {
    throw new Error("X integration not found")
  }

  const workspace = await ctx.db.get(integration.workspaceId)
  if (!workspace) {
    throw new Error("Workspace not found")
  }

  const posts = await ctx.db
    .query("xPosts")
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
      xUserId: integration.xUserId,
      username: integration.username,
      lastProcessedPostId: integration.lastProcessedPostId ?? null,
      lastProcessedPostCreatedAt:
        integration.lastProcessedPostCreatedAt ?? null,
      additionalContext: integration.additionalContext ?? null,
    },
    posts: posts.reverse().map((post) => ({
      _id: post._id,
      postId: post.postId,
      authorUsername: post.authorUsername,
      content: post.content,
      permalink: post.permalink,
      postCreatedAt: post.postCreatedAt,
    })),
  }
}

async function enqueueFeedbackProcessingWork(
  ctx: MutationCtx,
  integrationId: Id<"xWorkspaceIntegrations">,
  delayMs: number
): Promise<string> {
  const workId = await xFeedbackPool.enqueueAction(
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
    integrationId: v.id("xWorkspaceIntegrations"),
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
    integrationId: v.id("xWorkspaceIntegrations"),
    lastProcessedPostId: v.string(),
    lastProcessedPostCreatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.integrationId)
    if (!integration) {
      throw new Error("X integration not found")
    }

    await ctx.db.patch(args.integrationId, {
      lastProcessedPostId: args.lastProcessedPostId,
      lastProcessedPostCreatedAt: args.lastProcessedPostCreatedAt,
      lastProcessedAt: Date.now(),
    })
  },
})

export const scheduleFeedbackDetection = internalMutation({
  args: {
    integrationId: v.id("xWorkspaceIntegrations"),
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

    logInfo("Queued X feedback work", {
      integrationId: args.integrationId,
      workId,
      delayMs: args.delayMs ?? FEEDBACK_PROCESSING_DEBOUNCE_MS,
    })

    return { scheduled: true, workId }
  },
})

export const markFeedbackProcessingRunning = internalMutation({
  args: {
    integrationId: v.id("xWorkspaceIntegrations"),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const integration = await ctx.db.get(args.integrationId)
    if (!integration) {
      return false
    }

    if (integration.feedbackProcessingState === "running") {
      return false
    }

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
    integrationId: v.id("xWorkspaceIntegrations"),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<null> => {
    const integration = await ctx.db.get(args.integrationId)
    if (!integration) {
      return null
    }

    await ctx.db.patch(args.integrationId, {
      feedbackProcessingLastError: args.reason,
    })

    return null
  },
})

export const finalizeDelegatedFeedbackProcessing = mutation({
  args: {
    botSecret: v.string(),
    integrationId: v.id("xWorkspaceIntegrations"),
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
    const configuredSecret = process.env.X_API_SECRET
    if (!configuredSecret || args.botSecret !== configuredSecret) {
      throw new Error("Invalid X bot secret")
    }

    const integration = await ctx.db.get(args.integrationId)
    if (!integration) {
      return null
    }

    const [latestPost] = await ctx.db
      .query("xPosts")
      .withIndex("by_integration_created_at", (q) =>
        q.eq("integrationId", args.integrationId)
      )
      .order("desc")
      .take(1)

    const hasPendingPosts = latestPost
      ? isPostAfterCursor(latestPost, {
          postId: integration.lastProcessedPostId ?? null,
          postCreatedAt: integration.lastProcessedPostCreatedAt ?? null,
        })
      : false

    const latestIntegration = await ctx.db.get(args.integrationId)
    if (!latestIntegration) {
      return null
    }

    const pausedForEventsExhausted = args.result.reason === "events_exhausted"
    const shouldRerun =
      !pausedForEventsExhausted &&
      (args.result.kind === "failed" ||
        latestIntegration.feedbackProcessingNeedsRerun === true ||
        hasPendingPosts)

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

      logInfo("Re-queued delegated X feedback work", {
        integrationId: args.integrationId,
        workId,
        reason:
          args.result.kind === "failed"
            ? "failed"
            : latestIntegration.feedbackProcessingNeedsRerun
              ? "rerun_requested"
              : "pending_posts",
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
      integrationId: v.id("xWorkspaceIntegrations"),
    })
  ),
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.context.integrationId)
    if (!integration) {
      return
    }

    const completionReason = getCompletedProcessingReason(args.result)
    if (completionReason === "delegated") {
      return
    }

    const [latestPost] = await ctx.db
      .query("xPosts")
      .withIndex("by_integration_created_at", (q) =>
        q.eq("integrationId", args.context.integrationId)
      )
      .order("desc")
      .take(1)

    const hasPendingPosts = latestPost
      ? isPostAfterCursor(latestPost, {
          postId: integration.lastProcessedPostId ?? null,
          postCreatedAt: integration.lastProcessedPostCreatedAt ?? null,
        })
      : false
    const pausedForEventsExhausted = completionReason === "events_exhausted"

    const shouldRerun =
      !pausedForEventsExhausted &&
      (args.result.kind === "failed" ||
        integration.feedbackProcessingNeedsRerun === true ||
        hasPendingPosts)

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

      logInfo("Re-queued X feedback work", {
        integrationId: args.context.integrationId,
        workId,
        reason:
          args.result.kind === "failed"
            ? "failed"
            : integration.feedbackProcessingNeedsRerun
              ? "rerun_requested"
              : "pending_posts",
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
          ? integration.feedbackProcessingLastError
          : args.result.kind === "failed"
            ? args.result.error
            : undefined,
    })
  },
})

export const processFeedbackWindow = internalAction({
  args: {
    integrationId: v.id("xWorkspaceIntegrations"),
  },
  handler: async (ctx, args): Promise<ProcessFeedbackWindowResult> => {
    const acquired = await ctx.runMutation(
      markFeedbackProcessingRunningMutation,
      {
        integrationId: args.integrationId,
      }
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

      const pendingPosts = feedbackWindow.posts.filter((post) =>
        isPostAfterCursor(post, {
          postId: feedbackWindow.integration.lastProcessedPostId,
          postCreatedAt: feedbackWindow.integration.lastProcessedPostCreatedAt,
        })
      )
      if (pendingPosts.length === 0) {
        return { skipped: true, reason: "no_pending_posts" }
      }
      const latestPendingPost = pendingPosts.at(-1)
      if (!latestPendingPost) {
        return { skipped: true, reason: "missing_latest_pending_post" }
      }

      const contextPosts = feedbackWindow.posts.slice(-FEEDBACK_CONTEXT_LIMIT)

      const existingTasks: ExistingTask[] = await ctx.runQuery(
        getTaskSnapshotForFeedbackInternalQuery,
        {
          workspaceId: feedbackWindow.integration.workspaceId,
          limit: EXISTING_TASK_CONTEXT_LIMIT,
        }
      )

      const pipelineResult = await runFeedbackPipeline({
        platform: "x",
        workspaceId: feedbackWindow.integration.workspaceId,
        workspaceName: feedbackWindow.integration.workspaceName,
        integrationId: args.integrationId,
        availableLabels: feedbackWindow.integration.availableLabels,
        additionalContext: feedbackWindow.integration.additionalContext,
        workspaceContextLines: [
          `Connected X account: @${feedbackWindow.integration.username}`,
        ],
        pendingMessages: pendingPosts.map(toFeedbackMessage),
        contextMessages: contextPosts.map(toFeedbackMessage),
        existingTasks,
      })

      const cursor = {
        postId: latestPendingPost.postId,
        postCreatedAt: latestPendingPost.postCreatedAt,
      }
      async function markProcessed() {
        await ctx.runMutation(markFeedbackWindowProcessedInternalMutation, {
          integrationId: args.integrationId,
          lastProcessedPostId: cursor.postId,
          lastProcessedPostCreatedAt: cursor.postCreatedAt,
        })
      }

      if (pipelineResult.kind === "skip") {
        await markProcessed()
        await trackFeedbackProcessing({
          distinctId: feedbackWindow.integration.workspaceId,
          platform: "x",
          integrationId: args.integrationId,
          workspaceId: feedbackWindow.integration.workspaceId,
          messageCount: pendingPosts.length,
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
        logInfo("X feedback extractor produced no structured output", {
          integrationId: args.integrationId,
        })
        await markProcessed()
        await trackFeedbackProcessing({
          distinctId: feedbackWindow.integration.workspaceId,
          platform: "x",
          integrationId: args.integrationId,
          workspaceId: feedbackWindow.integration.workspaceId,
          messageCount: pendingPosts.length,
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

      const firstRelevantPost = pipelineResult.relevantMessages[0]
      const operations: XFeedbackTaskOperation[] =
        pipelineResult.operations.map((action) =>
          actionToXOperation(
            action,
            firstRelevantPost,
            latestPendingPost.postCreatedAt
          )
        )

      const totalAiCost =
        pipelineResult.classifierCost + pipelineResult.extractorCost
      const taskResult =
        operations.length > 0
          ? await ctx.runMutation(createTasksFromFeedbackInternalMutation, {
              workspaceId: feedbackWindow.integration.workspaceId,
              operations,
              cost: totalAiCost > 0 ? totalAiCost : undefined,
            })
          : { createdTaskIds: [], updatedTaskIds: [] }

      await markProcessed()

      await trackFeedbackProcessing({
        distinctId: feedbackWindow.integration.workspaceId,
        platform: "x",
        integrationId: args.integrationId,
        workspaceId: feedbackWindow.integration.workspaceId,
        messageCount: pendingPosts.length,
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
      logError("X feedback processing failed", error, {
        integrationId: args.integrationId,
      })
      throw error
    }
  },
})

function actionToXOperation(
  action: TaskAction,
  firstRelevantPost: FeedbackMessage | undefined,
  fallbackCreatedAt: number
): XFeedbackTaskOperation {
  if (action.action === "create") {
    return {
      action: "create",
      task: {
        title: action.title,
        description: action.description ?? undefined,
        status: "requests",
        priority: action.priority ?? "none",
        labels: action.labels,
        source: firstRelevantPost?.permalink
          ? {
              platform: "x",
              url: firstRelevantPost.permalink,
              author: firstRelevantPost.authorUsername.replace(/^@/, ""),
            }
          : undefined,
        createdAtLabel: formatCreatedAtLabel(
          firstRelevantPost?.createdAt ?? fallbackCreatedAt
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
