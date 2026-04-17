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
  truncateText,
  type ExistingTask,
  type FeedbackMessage,
  type TaskAction,
} from "./feedbackPipeline"

const FEEDBACK_WINDOW_LIMIT = 100
const FEEDBACK_CONTEXT_LIMIT = 10
const TASK_CONTEXT_FETCH_LIMIT = 100
const EXISTING_TASK_CONTEXT_LIMIT = 12
const FEEDBACK_PROCESSING_DEBOUNCE_MS = 8_000
const FEEDBACK_PROCESSING_RETRY_DELAY_MS = 5_000
const DEFAULT_WORKPOOL_PARALLELISM = 2
const MAX_LOCATION_TEXT_CHARS = 80
const MAX_SEARCH_TERMS = 18

const TASK_MATCH_STOP_WORDS = new Set([
  "about", "after", "all", "also", "and", "any", "are", "but", "can", "cant",
  "could", "did", "does", "dont", "for", "from", "get", "got", "had", "has",
  "have", "hey", "how", "into", "its", "just", "like", "maybe", "more", "not",
  "now", "our", "out", "pls", "please", "really", "same", "should", "some",
  "still", "than", "that", "the", "their", "them", "there", "they", "this",
  "too", "use", "using", "very", "was", "were", "what", "when", "with",
  "would", "you", "your",
])

type DiscordMessageRow = {
  _id: Id<"discordMessages">
  channelId: string
  channelName: string | null
  parentChannelId: string | null
  parentChannelName: string | null
  threadId: string | null
  threadTitle: string | null
  forumChannelId: string | null
  forumTitle: string | null
  messageId: string
  authorUsername: string
  authorHasAdminPrivileges: boolean
  content: string
  permalink: string
  messageCreatedAt: number
}

type FeedbackWindow = {
  integration: {
    integrationId: Id<"discordWorkspaceIntegrations">
    workspaceId: Id<"workspaces">
    workspaceName: string
    availableLabels: string[]
    guildId: string
    guildName: string
    channelId: string | null
    lastProcessedMessageId: string | null
    lastProcessedMessageCreatedAt: number | null
    additionalContext: string | null
  }
  messages: DiscordMessageRow[]
}

type DiscordFeedbackCreateTaskInput = {
  title: string
  description?: string
  status: "requests" | "todo" | "in_progress" | "ready" | "shipped" | "archive"
  priority: "urgent" | "high" | "medium" | "low" | "none"
  labels: string[]
  source?: {
    platform: "discord"
    url: string
    author: string
  }
  createdAtLabel?: string
}

type DiscordFeedbackTaskOperation =
  | {
      action: "create"
      task: DiscordFeedbackCreateTaskInput
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
    process.env.DISCORD_FEEDBACK_WORKPOOL_PARALLELISM ??
      DEFAULT_WORKPOOL_PARALLELISM
  )
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_WORKPOOL_PARALLELISM
  }
  return Math.floor(parsed)
}

const discordFeedbackPool = new Workpool(components.discordFeedbackWorkpool, {
  maxParallelism: getFeedbackWorkpoolParallelism(),
  retryActionsByDefault: false,
})

const processFeedbackWindowAction = makeFunctionReference<
  "action",
  { integrationId: Id<"discordWorkspaceIntegrations"> },
  ProcessFeedbackWindowResult
>("discordFeedback:processFeedbackWindow")

const handleFeedbackProcessingCompleteMutation = makeFunctionReference<
  "mutation",
  {
    workId: string
    context: { integrationId: Id<"discordWorkspaceIntegrations"> }
    result: WorkpoolResult
  },
  null
>("discordFeedback:handleFeedbackProcessingComplete")

const getPendingFeedbackWindowInternalQuery = makeFunctionReference<
  "query",
  {
    integrationId: Id<"discordWorkspaceIntegrations">
    limit?: number
  },
  FeedbackWindow
>("discordFeedback:getPendingFeedbackWindowInternal")

const markFeedbackWindowProcessedInternalMutation = makeFunctionReference<
  "mutation",
  {
    integrationId: Id<"discordWorkspaceIntegrations">
    lastProcessedMessageId: string
    lastProcessedMessageCreatedAt: number
  },
  null
>("discordFeedback:markFeedbackWindowProcessedInternal")

const markFeedbackProcessingRunningMutation = makeFunctionReference<
  "mutation",
  { integrationId: Id<"discordWorkspaceIntegrations"> },
  boolean
>("discordFeedback:markFeedbackProcessingRunning")

const markFeedbackProcessingPausedMutation = makeFunctionReference<
  "mutation",
  {
    integrationId: Id<"discordWorkspaceIntegrations">
    reason: string
  },
  null
>("discordFeedback:markFeedbackProcessingPaused")

const getTaskSnapshotForDiscordInternalQuery = makeFunctionReference<
  "query",
  {
    workspaceId: Id<"workspaces">
    limit?: number
  },
  ExistingTask[]
>("tasks:getTaskSnapshotForDiscordInternal")

const createTasksFromDiscordFeedbackInternalMutation = makeFunctionReference<
  "mutation",
  {
    workspaceId: Id<"workspaces">
    operations: DiscordFeedbackTaskOperation[]
    cost?: number
  },
  {
    createdTaskIds: Id<"tasks">[]
    updatedTaskIds: Id<"tasks">[]
  }
>("tasks:createTasksFromDiscordFeedbackInternal")

function logInfo(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.log("[convex:discord-feedback]", message, details)
    return
  }
  console.log("[convex:discord-feedback]", message)
}

function logError(
  message: string,
  error: unknown,
  details?: Record<string, unknown>
) {
  if (details) {
    console.error("[convex:discord-feedback]", message, details, error)
    return
  }
  console.error("[convex:discord-feedback]", message, error)
}

function formatCreatedAtLabel(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(timestamp)
}

function tokenizeTaskMatchTerms(text: string | null | undefined) {
  const normalized = truncateText(text, 400).toLowerCase()
  if (!normalized) return []
  return Array.from(
    new Set(
      (normalized.match(/[a-z0-9][a-z0-9_-]*/g) ?? []).filter(
        (term) => term.length >= 3 && !TASK_MATCH_STOP_WORDS.has(term)
      )
    )
  )
}

function collectRelevantTaskTerms(messages: DiscordMessageRow[]) {
  const counts = new Map<string, number>()
  for (const message of messages) {
    const parts = [
      message.content,
      message.threadTitle,
      message.forumTitle,
      message.channelName,
      message.parentChannelName,
    ]
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
  return {
    guildId: match[1],
    channelId: match[2],
    messageId: match[3],
  }
}

function selectRelevantTasks(
  tasks: ExistingTask[],
  relevantMessages: DiscordMessageRow[]
) {
  if (tasks.length === 0 || relevantMessages.length === 0) return []

  const exactSourceUrls = new Set(
    relevantMessages.map((m) => m.permalink).filter(Boolean)
  )
  const relevantChannelIds = new Set(
    relevantMessages.flatMap((m) =>
      [m.channelId, m.parentChannelId, m.threadId, m.forumChannelId].filter(
        (value): value is string => Boolean(value)
      )
    )
  )
  const relevantGuildIds = new Set(
    relevantMessages
      .map((m) => parseDiscordPermalink(m.permalink)?.guildId)
      .filter((value): value is string => Boolean(value))
  )
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
      const taskTerms = new Set([
        ...tokenizeTaskMatchTerms(task.title),
        ...tokenizeTaskMatchTerms(task.description),
        ...task.labels.flatMap((label) => tokenizeTaskMatchTerms(label)),
      ])
      for (const term of relevantTerms) {
        if (taskTerms.has(term)) score += 3
      }
      return { task, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (a.task.status !== b.task.status) {
        return a.task.status === "shipped" ? 1 : -1
      }
      return a.task.taskCode.localeCompare(b.task.taskCode)
    })
    .slice(0, EXISTING_TASK_CONTEXT_LIMIT)
    .map((entry) => entry.task)
}

function isMessageAfterCursor(
  message: { messageId: string; messageCreatedAt: number },
  cursor: { messageId: string | null; messageCreatedAt: number | null }
) {
  if (cursor.messageCreatedAt === null || cursor.messageId === null) return true
  if (message.messageCreatedAt > cursor.messageCreatedAt) return true
  if (message.messageCreatedAt < cursor.messageCreatedAt) return false
  return BigInt(message.messageId) > BigInt(cursor.messageId)
}

function normalizeDiscordId(id: string) {
  return id.trim().replace(/\D/g, "")
}

function toFeedbackMessage(row: DiscordMessageRow): FeedbackMessage {
  const locationLabels = [
    row.forumTitle
      ? `forum:${truncateText(row.forumTitle, MAX_LOCATION_TEXT_CHARS)}`
      : null,
    row.threadTitle
      ? `thread:${truncateText(row.threadTitle, MAX_LOCATION_TEXT_CHARS)}`
      : null,
    row.parentChannelName
      ? `parent_channel:${truncateText(row.parentChannelName, MAX_LOCATION_TEXT_CHARS)}`
      : null,
    row.channelName
      ? `channel:${truncateText(row.channelName, MAX_LOCATION_TEXT_CHARS)}`
      : null,
  ].filter((value): value is string => Boolean(value))

  const content =
    row.content.trim() ||
    (row.threadTitle
      ? "(no body text; use the thread title as the post title)"
      : "(no body text)")

  return {
    id: row.messageId,
    authorUsername: row.authorUsername,
    content,
    permalink: row.permalink,
    createdAt: row.messageCreatedAt,
    locationLabels,
    isAdmin: row.authorHasAdminPrivileges,
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
  integrationId: Id<"discordWorkspaceIntegrations">,
  limit: number
): Promise<FeedbackWindow> {
  const integration = await ctx.db.get(integrationId)
  if (!integration) {
    throw new Error("Discord integration not found")
  }

  const workspace = await ctx.db.get(integration.workspaceId)
  if (!workspace) {
    throw new Error("Workspace not found")
  }

  const messages = await ctx.db
    .query("discordMessages")
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
      guildId: integration.guildId,
      guildName: integration.guildName,
      channelId: integration.channelId ?? null,
      lastProcessedMessageId: integration.lastProcessedMessageId ?? null,
      lastProcessedMessageCreatedAt:
        integration.lastProcessedMessageCreatedAt ?? null,
      additionalContext: integration.additionalContext ?? null,
    },
    messages: messages.reverse().map((message) => ({
      _id: message._id,
      channelId: message.channelId,
      channelName: message.channelName ?? null,
      parentChannelId: message.parentChannelId ?? null,
      parentChannelName: message.parentChannelName ?? null,
      threadId: message.threadId ?? null,
      threadTitle: message.threadTitle ?? null,
      forumChannelId: message.forumChannelId ?? null,
      forumTitle: message.forumTitle ?? null,
      messageId: message.messageId,
      authorUsername: message.authorUsername,
      authorHasAdminPrivileges: message.authorHasAdminPrivileges ?? false,
      content: message.content,
      permalink: message.permalink,
      messageCreatedAt: message.messageCreatedAt,
    })),
  }
}

async function enqueueFeedbackProcessingWork(
  ctx: MutationCtx,
  integrationId: Id<"discordWorkspaceIntegrations">,
  delayMs: number
): Promise<string> {
  const workId = await discordFeedbackPool.enqueueAction(
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
    integrationId: v.id("discordWorkspaceIntegrations"),
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
    integrationId: v.id("discordWorkspaceIntegrations"),
    lastProcessedMessageId: v.string(),
    lastProcessedMessageCreatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.integrationId)
    if (!integration) {
      throw new Error("Discord integration not found")
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
    integrationId: v.id("discordWorkspaceIntegrations"),
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

    logInfo("Queued Discord feedback work", {
      integrationId: args.integrationId,
      workId,
      delayMs: args.delayMs ?? FEEDBACK_PROCESSING_DEBOUNCE_MS,
    })

    return { scheduled: true, workId }
  },
})

export const markFeedbackProcessingRunning = internalMutation({
  args: {
    integrationId: v.id("discordWorkspaceIntegrations"),
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
    integrationId: v.id("discordWorkspaceIntegrations"),
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
    integrationId: v.id("discordWorkspaceIntegrations"),
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
    const configuredSecret = process.env.DISCORD_PAIRING_SECRET
    if (!configuredSecret || args.botSecret !== configuredSecret) {
      throw new Error("Invalid Discord bot secret")
    }

    const integration = await ctx.db.get(args.integrationId)
    if (!integration) return null

    const [latestMessage] = await ctx.db
      .query("discordMessages")
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

      logInfo("Re-queued delegated Discord feedback work", {
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
      integrationId: v.id("discordWorkspaceIntegrations"),
    })
  ),
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.context.integrationId)
    if (!integration) return

    const completionReason = getCompletedProcessingReason(args.result)
    if (completionReason === "delegated") return

    const [latestMessage] = await ctx.db
      .query("discordMessages")
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

      logInfo("Re-queued Discord feedback work", {
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
    integrationId: v.id("discordWorkspaceIntegrations"),
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
      const pendingNonAdminMessages = pendingMessages.filter(
        (message) => !message.authorHasAdminPrivileges
      )

      if (pendingMessages.length === 0) {
        return { skipped: true, reason: "no_pending_messages" }
      }

      const latestPendingMessage = pendingMessages.at(-1)
      if (!latestPendingMessage) {
        return { skipped: true, reason: "missing_latest_pending_message" }
      }

      async function markProcessed() {
        await ctx.runMutation(markFeedbackWindowProcessedInternalMutation, {
          integrationId: args.integrationId,
          lastProcessedMessageId: latestPendingMessage!.messageId,
          lastProcessedMessageCreatedAt:
            latestPendingMessage!.messageCreatedAt,
        })
      }

      if (pendingNonAdminMessages.length === 0) {
        await markProcessed()
        return { skipped: true, reason: "admin_only_messages" }
      }

      const contextMessages = feedbackWindow.messages
        .filter((message) => !message.authorHasAdminPrivileges)
        .slice(-FEEDBACK_CONTEXT_LIMIT)

      const existingTasksRaw: ExistingTask[] = await ctx.runQuery(
        getTaskSnapshotForDiscordInternalQuery,
        {
          workspaceId: feedbackWindow.integration.workspaceId,
          limit: TASK_CONTEXT_FETCH_LIMIT,
        }
      )
      const existingTasks = selectRelevantTasks(
        existingTasksRaw,
        pendingNonAdminMessages
      )

      const pipelineResult = await runFeedbackPipeline({
        platform: "discord",
        workspaceId: feedbackWindow.integration.workspaceId,
        workspaceName: feedbackWindow.integration.workspaceName,
        integrationId: args.integrationId,
        availableLabels: feedbackWindow.integration.availableLabels,
        additionalContext: feedbackWindow.integration.additionalContext,
        workspaceContextLines: [
          `Guild: ${feedbackWindow.integration.guildName}`,
        ],
        pendingMessages: pendingNonAdminMessages.map(toFeedbackMessage),
        contextMessages: contextMessages.map(toFeedbackMessage),
        existingTasks,
      })

      if (pipelineResult.kind === "skip") {
        await markProcessed()
        await trackFeedbackProcessing({
          distinctId: feedbackWindow.integration.workspaceId,
          platform: "discord",
          integrationId: args.integrationId,
          workspaceId: feedbackWindow.integration.workspaceId,
          messageCount: pendingNonAdminMessages.length,
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
        logInfo("Discord feedback extractor produced no structured output", {
          integrationId: args.integrationId,
        })
        await markProcessed()
        await trackFeedbackProcessing({
          distinctId: feedbackWindow.integration.workspaceId,
          platform: "discord",
          integrationId: args.integrationId,
          workspaceId: feedbackWindow.integration.workspaceId,
          messageCount: pendingNonAdminMessages.length,
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

      // Map the pipeline's chosen relevantMessages back to the raw rows to keep
      // Discord-specific cursor + permalink data accurate.
      const pendingById = new Map(
        pendingNonAdminMessages.map((m) => [m.messageId, m])
      )
      const normalizedRelevantIds = new Set(
        pipelineResult.classification.relevantMessageIds
          .map((id) => normalizeDiscordId(id))
          .filter(Boolean)
      )
      const matchedRelevantRows = pendingNonAdminMessages.filter((row) =>
        normalizedRelevantIds.has(normalizeDiscordId(row.messageId))
      )
      const relevantRows =
        matchedRelevantRows.length > 0
          ? matchedRelevantRows
          : pipelineResult.relevantMessages
              .map((m) => pendingById.get(m.id))
              .filter((row): row is DiscordMessageRow => Boolean(row))
      const firstRelevant = relevantRows[0]

      const operations: DiscordFeedbackTaskOperation[] =
        pipelineResult.operations.map((action) =>
          actionToDiscordOperation(
            action,
            firstRelevant,
            latestPendingMessage.messageCreatedAt
          )
        )

      const totalAiCost =
        pipelineResult.classifierCost + pipelineResult.extractorCost
      const taskResult =
        operations.length > 0
          ? await ctx.runMutation(
              createTasksFromDiscordFeedbackInternalMutation,
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
        platform: "discord",
        integrationId: args.integrationId,
        workspaceId: feedbackWindow.integration.workspaceId,
        messageCount: pendingNonAdminMessages.length,
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
      logError("Discord feedback processing failed", error, {
        integrationId: args.integrationId,
      })
      throw error
    }
  },
})

function actionToDiscordOperation(
  action: TaskAction,
  firstRelevant: DiscordMessageRow | undefined,
  fallbackCreatedAt: number
): DiscordFeedbackTaskOperation {
  if (action.action === "create") {
    return {
      action: "create",
      task: {
        title: action.title,
        description: action.description ?? undefined,
        status: "requests",
        priority: action.priority ?? "none",
        labels: action.labels,
        source: firstRelevant
          ? {
              platform: "discord",
              url: firstRelevant.permalink,
              author: firstRelevant.authorUsername,
            }
          : undefined,
        createdAtLabel: formatCreatedAtLabel(
          firstRelevant?.messageCreatedAt ?? fallbackCreatedAt
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
