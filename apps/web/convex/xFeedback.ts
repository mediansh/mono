import { generateText, Output } from "ai"
import { google } from "@ai-sdk/google"
import { trackLLMGeneration, trackFeedbackProcessing } from "./posthog"
import { Workpool, vOnCompleteArgs } from "@convex-dev/workpool"
import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"
import { z } from "zod"
import { components } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"

const FEEDBACK_WINDOW_LIMIT = 100
const FEEDBACK_CONTEXT_LIMIT = 25
const EXISTING_TASK_CONTEXT_LIMIT = 50
const FEEDBACK_PROCESSING_DEBOUNCE_MS = 2_000
const FEEDBACK_PROCESSING_RETRY_DELAY_MS = 5_000
const DEFAULT_WORKPOOL_PARALLELISM = 8

type FeedbackPost = {
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
  posts: FeedbackPost[]
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

type XFeedbackTaskInput = {
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

type WorkpoolResult =
  | { kind: "success"; returnValue: unknown }
  | { kind: "failed"; error: string }
  | { kind: "canceled" }

type ProcessFeedbackWindowResult =
  | { skipped: true; reason: string }
  | { skipped: false; createdTaskCount: number; reason?: string }

const feedbackClassificationSchema = z.object({
  isProductFeedback: z.boolean(),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).nullable(),
  reason: z.string().min(1),
  relevantPostIds: z.array(z.string()).max(25),
})

const extractedFeedbackTasksSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(140),
        description: z.string().max(2000).nullable(),
        priority: z
          .enum(["urgent", "high", "medium", "low", "none"])
          .nullable(),
        labels: z.array(z.string()).max(5),
      })
    )
    .max(5),
})

function getFeedbackWorkpoolParallelism() {
  const parsed = Number(
    process.env.X_FEEDBACK_WORKPOOL_PARALLELISM ??
      DEFAULT_WORKPOOL_PARALLELISM
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

const getTaskSnapshotForFeedbackInternalQuery = makeFunctionReference<
  "query",
  {
    workspaceId: Id<"workspaces">
    limit?: number
  },
  TaskSnapshot[]
>("tasks:getTaskSnapshotForFeedbackInternal")

const createTasksFromFeedbackInternalMutation = makeFunctionReference<
  "mutation",
  {
    workspaceId: Id<"workspaces">
    tasks: XFeedbackTaskInput[]
  },
  { _id: Id<"tasks"> }[]
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

function extractJsonObject(text: string) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return a JSON object.")
  }

  return text.slice(start, end + 1)
}

function normalizeId(id: string) {
  return id.trim().replace(/\D/g, "")
}

function isPostAfterCursor(
  post: { postId: string; postCreatedAt: number },
  cursor: { postId: string | null; postCreatedAt: number | null }
) {
  if (cursor.postCreatedAt === null || cursor.postId === null) {
    return true
  }

  if (post.postCreatedAt > cursor.postCreatedAt) {
    return true
  }

  if (post.postCreatedAt < cursor.postCreatedAt) {
    return false
  }

  return BigInt(post.postId) > BigInt(cursor.postId)
}

function formatTranscript(posts: FeedbackPost[], pendingPostIds: Set<string>) {
  return posts
    .map((post) => {
      const timestamp = new Date(post.postCreatedAt).toISOString()
      const marker = pendingPostIds.has(post.postId) ? "NEW" : "CONTEXT"
      return `[${marker}] [id:${post.postId}] ${timestamp} @${post.authorUsername}: ${post.content}`
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
      await ctx.db.patch(args.integrationId, {
        feedbackProcessingNeedsRerun: true,
      })
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

    const shouldRerun =
      args.result.kind === "failed" ||
      integration.feedbackProcessingNeedsRerun === true ||
      hasPendingPosts

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
        args.result.kind === "failed" ? args.result.error : undefined,
    })
  },
})

export const processFeedbackWindow = internalAction({
  args: {
    integrationId: v.id("xWorkspaceIntegrations"),
  },
  handler: async (ctx, args): Promise<ProcessFeedbackWindowResult> => {
    const processingStart = Date.now()
    const acquired = await ctx.runMutation(
      markFeedbackProcessingRunningMutation,
      {
        integrationId: args.integrationId,
      }
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

      const pendingPosts = feedbackWindow.posts.filter((post) =>
        isPostAfterCursor(post, {
          postId: feedbackWindow.integration.lastProcessedPostId,
          postCreatedAt: feedbackWindow.integration.lastProcessedPostCreatedAt,
        })
      )

      logInfo("Loaded X feedback window", {
        integrationId: args.integrationId,
        workspaceId: feedbackWindow.integration.workspaceId,
        totalPosts: feedbackWindow.posts.length,
        pendingPosts: pendingPosts.length,
      })

      if (pendingPosts.length === 0) {
        return { skipped: true, reason: "no_pending_posts" }
      }

      const contextPosts = feedbackWindow.posts.slice(-FEEDBACK_CONTEXT_LIMIT)
      const pendingPostIds = new Set<string>(
        pendingPosts.map((post) => post.postId)
      )
      const transcript = formatTranscript(contextPosts, pendingPostIds)

      const classifierSystemParts: string[] = [
        "You classify inbound X mentions and replies for a product team.",
        `The only product that matters is ${feedbackWindow.integration.workspaceName}.`,
        "Return isProductFeedback=true only when the newest posts contain concrete product feedback, a bug report, a feature request, workflow friction, or an actionable complaint about the actual product.",
        "Reject hype, compliments without a request, memes, repost-style chatter, marketing banter, hiring talk, and anything unrelated to the product itself.",
        "Use the recent context only to interpret what the new posts refer to.",
        "Only include relevantPostIds from NEW posts.",
        "Each post has an [id:XXXXXXX] tag. Use the numeric ID from that tag as the relevantPostId, NOT the timestamp.",
        "Return valid JSON only. No markdown. No code fences. No commentary.",
        'Use this exact JSON shape: {"isProductFeedback":false,"confidence":0.0,"summary":null,"reason":"...","relevantPostIds":["123456789"]}',
      ]

      if (feedbackWindow.integration.additionalContext) {
        classifierSystemParts.push(
          `Additional product context from the workspace owner: ${feedbackWindow.integration.additionalContext}`
        )
      }

      const classifierStart = Date.now()
      const classifierResult = await generateText({
        model: google("gemma-3-27b-it"),
        system: classifierSystemParts.join(" "),
        prompt: [
          `Workspace name: ${feedbackWindow.integration.workspaceName}`,
          `Connected X account: @${feedbackWindow.integration.username}`,
          "Inbound post transcript:",
          transcript,
        ].join("\n\n"),
      })
      const classifierDurationMs = Date.now() - classifierStart

      trackLLMGeneration({
        distinctId: feedbackWindow.integration.workspaceId,
        model: "google/gemma-3-27b-it",
        feature: "x_feedback_classifier",
        inputTokens: classifierResult.usage?.inputTokens,
        outputTokens: classifierResult.usage?.outputTokens,
        durationMs: classifierDurationMs,
        success: true,
        metadata: {
          integration_id: args.integrationId,
          pending_post_count: pendingPosts.length,
        },
      })

      const classification = feedbackClassificationSchema.parse(
        JSON.parse(extractJsonObject(classifierResult.text))
      )

      const latestPendingPost = pendingPosts.at(-1)
      if (!latestPendingPost) {
        return { skipped: true, reason: "missing_latest_pending_post" }
      }

      logInfo("X feedback classified", {
        integrationId: args.integrationId,
        isProductFeedback: classification.isProductFeedback,
        confidence: classification.confidence,
        relevantPostCount: classification.relevantPostIds.length,
      })

      if (
        !classification.isProductFeedback ||
        classification.relevantPostIds.length === 0
      ) {
        await ctx.runMutation(markFeedbackWindowProcessedInternalMutation, {
          integrationId: args.integrationId,
          lastProcessedPostId: latestPendingPost.postId,
          lastProcessedPostCreatedAt: latestPendingPost.postCreatedAt,
        })

        return {
          skipped: false,
          createdTaskCount: 0,
          reason: "not_product_feedback",
        }
      }

      const normalizedRelevantIds = new Set(
        classification.relevantPostIds
          .map((postId) => normalizeId(postId))
          .filter(Boolean)
      )

      const matchedRelevantPosts = pendingPosts.filter((post) =>
        normalizedRelevantIds.has(normalizeId(post.postId))
      )

      const relevantPosts =
        matchedRelevantPosts.length > 0 ? matchedRelevantPosts : pendingPosts

      const existingTasks = await ctx.runQuery(
        getTaskSnapshotForFeedbackInternalQuery,
        {
          workspaceId: feedbackWindow.integration.workspaceId,
          limit: EXISTING_TASK_CONTEXT_LIMIT,
        }
      )

      const labelsText =
        feedbackWindow.integration.availableLabels.length > 0
          ? feedbackWindow.integration.availableLabels.join(", ")
          : "No predefined labels."

      const extractorSystemParts: string[] = [
        "You turn product feedback into concise task requests for a task board.",
        `The product is ${feedbackWindow.integration.workspaceName}.`,
        "Only create tasks for actionable feedback about the real product. Ignore unrelated discussion.",
        "Return between 0 and 5 tasks.",
        "Each task must be distinct, concrete, and understandable without requiring the original X post.",
        "You will be given existing tasks from the board, including shipped (resolved) tasks. Skip creating a task if an existing task — regardless of status — describes the EXACT same specific issue — same error message, same feature, same broken flow. A shipped task means the issue was already addressed; do not recreate it.",
        "Different error messages, different symptoms, or different contexts should each get their own task even if they relate to the same general area.",
        "When in doubt, create the task. It is better to create a near-duplicate than to lose real user feedback.",
        "Descriptions should summarize the user problem and expected outcome in plain text.",
        "Priority may be urgent, high, medium, low, or none.",
        `Allowed labels: ${labelsText}`,
        "Only use labels from the allowed list. Use an empty array when none apply.",
      ]

      if (feedbackWindow.integration.additionalContext) {
        extractorSystemParts.push(
          `Additional product context from the workspace owner: ${feedbackWindow.integration.additionalContext}`
        )
      }

      const extractorStart = Date.now()
      const extractorResult = await generateText({
        model: "anthropic/claude-haiku-4.5",
        output: Output.object({ schema: extractedFeedbackTasksSchema }),
        system: extractorSystemParts.join(" "),
        prompt: [
          `Classifier summary: ${classification.summary ?? classification.reason}`,
          "Existing task context:",
          formatExistingTasks(existingTasks),
          "Relevant inbound posts:",
          relevantPosts
            .map(
              (post) =>
                `- ${new Date(post.postCreatedAt).toISOString()} @${post.authorUsername}: ${post.content}`
            )
            .join("\n"),
        ].join("\n\n"),
      })
      const extractorDurationMs = Date.now() - extractorStart
      const extracted = extractorResult.output

      trackLLMGeneration({
        distinctId: feedbackWindow.integration.workspaceId,
        model: "anthropic/claude-haiku-4.5",
        feature: "x_feedback_extractor",
        inputTokens: extractorResult.usage?.inputTokens,
        outputTokens: extractorResult.usage?.outputTokens,
        durationMs: extractorDurationMs,
        success: true,
        metadata: {
          integration_id: args.integrationId,
          relevant_post_count: relevantPosts.length,
        },
      })

      if (!extracted) {
        await ctx.runMutation(markFeedbackWindowProcessedInternalMutation, {
          integrationId: args.integrationId,
          lastProcessedPostId: latestPendingPost.postId,
          lastProcessedPostCreatedAt: latestPendingPost.postCreatedAt,
        })

        return {
          skipped: false,
          createdTaskCount: 0,
          reason: "no_structured_output",
        }
      }

      if (extracted.tasks.length > 0) {
        const authors = Array.from(
          new Set(
            relevantPosts.map((post) => `@${post.authorUsername}`)
          )
        )
        const sourceUrl = relevantPosts[relevantPosts.length - 1]?.permalink
        const createdAtLabel = formatCreatedAtLabel(
          latestPendingPost.postCreatedAt
        )

        await ctx.runMutation(createTasksFromFeedbackInternalMutation, {
          workspaceId: feedbackWindow.integration.workspaceId,
          tasks: extracted.tasks.map((task) => ({
            title: task.title,
            description: task.description ?? undefined,
            status: "requests" as const,
            priority: task.priority ?? "none",
            labels: task.labels.filter((label) =>
              feedbackWindow.integration.availableLabels.includes(label)
            ),
            source: sourceUrl
              ? {
                  platform: "x" as const,
                  url: sourceUrl,
                  author: authors.join(", "),
                }
              : undefined,
            createdAtLabel,
          })),
        })
      }

      await ctx.runMutation(markFeedbackWindowProcessedInternalMutation, {
        integrationId: args.integrationId,
        lastProcessedPostId: latestPendingPost.postId,
        lastProcessedPostCreatedAt: latestPendingPost.postCreatedAt,
      })

      logInfo("Finished X feedback processing attempt", {
        integrationId: args.integrationId,
        createdTaskCount: extracted.tasks.length,
      })

      trackFeedbackProcessing({
        distinctId: feedbackWindow.integration.workspaceId,
        platform: "x",
        integrationId: args.integrationId,
        workspaceId: feedbackWindow.integration.workspaceId,
        messageCount: pendingPosts.length,
        isProductFeedback: classification.isProductFeedback,
        confidence: classification.confidence,
        createdTaskCount: extracted.tasks.length,
        classifierDurationMs,
        extractorDurationMs,
        totalDurationMs: Date.now() - processingStart,
      })

      return {
        skipped: false,
        createdTaskCount: extracted.tasks.length,
      }
    } catch (error) {
      logError("Failed to process X feedback window", error, {
        integrationId: args.integrationId,
      })
      throw error
    }
  },
})
