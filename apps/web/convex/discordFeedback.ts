import { generateText } from "ai"
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
import { classifyRunResult, recordRunDirect } from "./moduleRuns"

const FEEDBACK_WINDOW_LIMIT = 100
const FEEDBACK_CONTEXT_LIMIT = 25
const RELEVANT_MESSAGE_LIMIT = 25
const TASK_CONTEXT_FETCH_LIMIT = 100
const EXISTING_TASK_CONTEXT_LIMIT = 12
const FEEDBACK_PROCESSING_DEBOUNCE_MS = 8_000
const FEEDBACK_PROCESSING_RETRY_DELAY_MS = 5_000
const FEEDBACK_PROCESSING_MAX_RETRIES = 3
const DEFAULT_WORKPOOL_PARALLELISM = 2
const MAX_MESSAGE_CONTENT_CHARS = 280
const MAX_TASK_DESCRIPTION_CHARS = 220
const MAX_LOCATION_TEXT_CHARS = 80
const MAX_ADDITIONAL_CONTEXT_CHARS = 500
const MAX_SEARCH_TERMS = 18
const MAX_EXTRACTED_TASK_ACTIONS = 5
const MAX_EXTRACTED_TASK_LABELS = 5

const TASK_MATCH_STOP_WORDS = new Set([
  "about",
  "after",
  "all",
  "also",
  "and",
  "any",
  "are",
  "but",
  "can",
  "cant",
  "could",
  "did",
  "does",
  "dont",
  "for",
  "from",
  "get",
  "got",
  "had",
  "has",
  "have",
  "hey",
  "how",
  "into",
  "its",
  "just",
  "like",
  "maybe",
  "more",
  "not",
  "now",
  "our",
  "out",
  "pls",
  "please",
  "really",
  "same",
  "should",
  "some",
  "still",
  "than",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "too",
  "use",
  "using",
  "very",
  "was",
  "were",
  "what",
  "when",
  "with",
  "would",
  "you",
  "your",
])

const HIGH_SIGNAL_TASK_ACTION_PATTERNS = [
  /\b5\d{2}\b/,
  /\b(?:error|errors|exception|exceptions|crash|crashes|crashed|crashing|broken|fails?|failing|failure)\b/,
  /\b(?:not working|doesn't work|nothing works|unable to|can't|cannot)\b/,
  /\b(?:slow|sluggish|lag|laggy|latency|unresponsive|freeze|freezing|hang|hanging|takes forever|forever to load|loading forever)\b/,
]

type FeedbackMessage = {
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
    feedbackIgnoredChannelIds: string[]
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

const feedbackClassificationSchema = z.object({
  isProductFeedback: z.boolean(),
  needsTaskAction: z.boolean(),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).nullable(),
  reason: z.string().min(1),
  relevantMessageIds: z.array(z.string()).max(RELEVANT_MESSAGE_LIMIT),
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
  {
    integrationId: Id<"discordWorkspaceIntegrations">
    retryAttempt?: number
  },
  ProcessFeedbackWindowResult
>("discordFeedback:processFeedbackWindow")

const handleFeedbackProcessingCompleteMutation = makeFunctionReference<
  "mutation",
  {
    workId: string
    context: {
      integrationId: Id<"discordWorkspaceIntegrations">
      retryAttempt?: number
    }
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
  TaskSnapshot[]
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

function extractJsonObject(text: string) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return a JSON object.")
  }

  return text.slice(start, end + 1)
}

function normalizeDiscordId(id: string) {
  return id.trim().replace(/\D/g, "")
}

function truncateText(text: string | null | undefined, maxChars: number) {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim()
  if (!normalized) {
    return ""
  }

  if (normalized.length <= maxChars) {
    return normalized
  }

  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`
}

function getAdditionalContext(context: string | null) {
  const value = truncateText(context, MAX_ADDITIONAL_CONTEXT_CHARS)
  return value || null
}

function tokenizeTaskMatchTerms(text: string | null | undefined) {
  const normalized = truncateText(text, 400).toLowerCase()
  if (!normalized) {
    return []
  }

  return Array.from(
    new Set(
      (normalized.match(/[a-z0-9][a-z0-9_-]*/g) ?? []).filter(
        (term) => term.length >= 3 && !TASK_MATCH_STOP_WORDS.has(term)
      )
    )
  )
}

function collectRelevantTaskTerms(messages: FeedbackMessage[]) {
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

function hasHighSignalTaskActionFeedback(messages: FeedbackMessage[]) {
  for (const message of messages) {
    const text = [
      message.content,
      message.threadTitle,
      message.forumTitle,
      message.channelName,
      message.parentChannelName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()

    if (!text) {
      continue
    }

    if (
      HIGH_SIGNAL_TASK_ACTION_PATTERNS.some((pattern) => pattern.test(text))
    ) {
      return true
    }
  }

  return false
}

function getFallbackFeedbackText(message: FeedbackMessage) {
  return (
    truncateText(message.content, MAX_MESSAGE_CONTENT_CHARS) ||
    truncateText(message.threadTitle, MAX_MESSAGE_CONTENT_CHARS) ||
    truncateText(message.forumTitle, MAX_MESSAGE_CONTENT_CHARS) ||
    truncateText(message.channelName, MAX_MESSAGE_CONTENT_CHARS) ||
    truncateText(message.parentChannelName, MAX_MESSAGE_CONTENT_CHARS) ||
    "(no body text)"
  )
}

function buildFallbackTaskTitle(messages: FeedbackMessage[]) {
  const latestMessage = messages[messages.length - 1]
  const detail = latestMessage
    ? getFallbackFeedbackText(latestMessage)
    : "User-reported issue"
  const prefix = hasHighSignalTaskActionFeedback(messages)
    ? "Investigate incident:"
    : "Review feedback:"
  return truncateText(`${prefix} ${detail}`, 140)
}

function buildFallbackTaskDescription(
  messages: FeedbackMessage[],
  summary: string
) {
  const excerpts = messages
    .slice(-3)
    .map(
      (message) =>
        `- ${message.authorUsername}: ${getFallbackFeedbackText(message)}`
    )
    .join("\n")
  const description = [`Summary: ${summary}`, "Recent messages:", excerpts]
    .filter(Boolean)
    .join("\n")
  const normalized = truncateText(description, 2000)
  return normalized || undefined
}

function parseDiscordPermalink(url: string | null) {
  if (!url) {
    return null
  }

  const match = url.match(/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/)
  if (!match?.[1] || !match[2] || !match[3]) {
    return null
  }

  return {
    guildId: match[1],
    channelId: match[2],
    messageId: match[3],
  }
}

function isIgnoredDiscordMessage(
  message: Pick<
    FeedbackMessage,
    "channelId" | "parentChannelId" | "forumChannelId"
  >,
  ignoredChannelIds: Set<string>
) {
  return (
    ignoredChannelIds.has(message.channelId) ||
    (message.parentChannelId
      ? ignoredChannelIds.has(message.parentChannelId)
      : false) ||
    (message.forumChannelId
      ? ignoredChannelIds.has(message.forumChannelId)
      : false)
  )
}

function selectRelevantTasks(
  tasks: TaskSnapshot[],
  relevantMessages: FeedbackMessage[]
) {
  if (tasks.length === 0 || relevantMessages.length === 0) {
    return []
  }

  const exactSourceUrls = new Set(
    relevantMessages.map((message) => message.permalink).filter(Boolean)
  )
  const relevantChannelIds = new Set(
    relevantMessages.flatMap((message) =>
      [
        message.channelId,
        message.parentChannelId,
        message.threadId,
        message.forumChannelId,
      ].filter(Boolean)
    )
  )
  const relevantGuildIds = new Set(
    relevantMessages
      .map((message) => parseDiscordPermalink(message.permalink)?.guildId)
      .filter(Boolean)
  )
  const relevantTerms = collectRelevantTaskTerms(relevantMessages)

  return tasks
    .map((task) => {
      let score = 0

      if (exactSourceUrls.has(task.sourceUrl ?? "")) {
        score += 100
      }

      const parsedSource = parseDiscordPermalink(task.sourceUrl)
      if (parsedSource) {
        if (relevantChannelIds.has(parsedSource.channelId)) {
          score += 16
        }
        if (relevantGuildIds.has(parsedSource.guildId)) {
          score += 4
        }
      }

      if (task.status !== "shipped") {
        score += 2
      }

      const taskTerms = new Set([
        ...tokenizeTaskMatchTerms(task.title),
        ...tokenizeTaskMatchTerms(task.description),
        ...task.labels.flatMap((label) => tokenizeTaskMatchTerms(label)),
      ])
      for (const term of relevantTerms) {
        if (taskTerms.has(term)) {
          score += 3
        }
      }

      return { task, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }

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
  if (cursor.messageCreatedAt === null || cursor.messageId === null) {
    return true
  }

  if (message.messageCreatedAt > cursor.messageCreatedAt) {
    return true
  }

  if (message.messageCreatedAt < cursor.messageCreatedAt) {
    return false
  }

  return BigInt(message.messageId) > BigInt(cursor.messageId)
}

function formatTranscript(
  messages: FeedbackMessage[],
  pendingMessageIds: Set<string>
) {
  return messages
    .map((message) => {
      const timestamp = new Date(message.messageCreatedAt).toISOString()
      const marker = pendingMessageIds.has(message.messageId)
        ? "NEW"
        : "CONTEXT"
      const locationParts = [
        message.forumTitle
          ? `forum:${truncateText(message.forumTitle, MAX_LOCATION_TEXT_CHARS)}`
          : null,
        message.threadTitle
          ? `thread:${truncateText(message.threadTitle, MAX_LOCATION_TEXT_CHARS)}`
          : null,
        message.parentChannelName
          ? `parent_channel:${truncateText(message.parentChannelName, MAX_LOCATION_TEXT_CHARS)}`
          : null,
        message.channelName
          ? `channel:${truncateText(message.channelName, MAX_LOCATION_TEXT_CHARS)}`
          : null,
      ].filter(Boolean)
      const locationPrefix =
        locationParts.length > 0 ? ` [${locationParts.join(" | ")}]` : ""
      const content =
        truncateText(message.content, MAX_MESSAGE_CONTENT_CHARS) ||
        (message.threadTitle
          ? "(no body text; use the thread title as the post title)"
          : "(no body text)")
      return `[${marker}] [id:${message.messageId}] ${timestamp}${locationPrefix} ${message.authorUsername}: ${content}`
    })
    .join("\n")
}

function formatExistingTasks(tasks: TaskSnapshot[]) {
  if (tasks.length === 0) {
    return "No likely matching existing tasks."
  }

  return tasks
    .map((task) =>
      [
        `${task.taskCode} | ${task.status} | ${task.priority} | ${truncateText(task.title, 140)}`,
        task.labels.length > 0 ? `labels: ${task.labels.join(", ")}` : null,
        task.description
          ? `description: ${truncateText(task.description, MAX_TASK_DESCRIPTION_CHARS)}`
          : null,
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
      feedbackIgnoredChannelIds: integration.feedbackIgnoredChannelIds ?? [],
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
  delayMs: number,
  retryAttempt = 0
): Promise<string> {
  const workId = await discordFeedbackPool.enqueueAction(
    ctx,
    processFeedbackWindowAction,
    { integrationId, retryAttempt },
    {
      runAfter: Math.max(0, delayMs),
      retry: false,
      onComplete: handleFeedbackProcessingCompleteMutation,
      context: { integrationId, retryAttempt },
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
    integrationId: v.id("discordWorkspaceIntegrations"),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<null> => {
    const integration = await ctx.db.get(args.integrationId)
    if (!integration) {
      return null
    }

    await ctx.db.patch(args.integrationId, {
      // Preserve the active state until the workpool onComplete callback
      // finalizes this run. Flipping to idle here opens a race where newly
      // ingested messages can schedule work that onComplete then clobbers.
      feedbackProcessingLastError: args.reason,
    })

    return null
  },
})

export const handleFeedbackProcessingComplete = internalMutation({
  args: vOnCompleteArgs(
    v.object({
      integrationId: v.id("discordWorkspaceIntegrations"),
      retryAttempt: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.context.integrationId)
    if (!integration) {
      return
    }

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
    if (!latestIntegration) {
      return
    }
    const completionReason = getCompletedProcessingReason(args.result)
    const shouldPauseProcessing =
      completionReason === "events_exhausted" ||
      completionReason === "no_active_plan"

    await recordRunDirect(ctx, {
      module: "discord_feedback",
      operation: "process_window",
      status: classifyRunResult(args.result),
      error: args.result.kind === "failed" ? args.result.error : undefined,
      workspaceId: latestIntegration.workspaceId,
      metadata: {
        integrationId: args.context.integrationId,
        reason: completionReason ?? undefined,
      },
      startedAt: latestIntegration.feedbackProcessingStartedAt,
    })

    const retryAttempt = args.context.retryAttempt ?? 0
    const canRetryFailure =
      args.result.kind === "failed" &&
      retryAttempt < FEEDBACK_PROCESSING_MAX_RETRIES
    const shouldRerun =
      !shouldPauseProcessing &&
      (canRetryFailure ||
        latestIntegration.feedbackProcessingNeedsRerun === true ||
        hasPendingMessages)

    if (shouldRerun) {
      const nextRetryAttempt =
        args.result.kind === "failed" ? retryAttempt + 1 : 0
      const workId = await enqueueFeedbackProcessingWork(
        ctx,
        args.context.integrationId,
        args.result.kind === "failed"
          ? FEEDBACK_PROCESSING_RETRY_DELAY_MS
          : FEEDBACK_PROCESSING_DEBOUNCE_MS,
        nextRetryAttempt
      )

      await ctx.db.patch(args.context.integrationId, {
        feedbackProcessingLastError:
          args.result.kind === "failed" ? args.result.error : undefined,
      })

      logInfo("Re-queued Discord feedback work", {
        integrationId: args.context.integrationId,
        workId,
        retryAttempt: nextRetryAttempt,
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
      feedbackProcessingLastError: shouldPauseProcessing
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
    retryAttempt: v.optional(v.number()),
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

      const planStatus = (await ctx.runAction(
        internal.billing.getWorkspacePlanStatusInternal,
        { workspaceId: feedbackWindow.integration.workspaceId }
      )) as { hasActivePlan: boolean; currentPlanId: string | null }

      if (!planStatus.hasActivePlan) {
        logInfo("Skipping Discord feedback scan — no active plan", {
          integrationId: args.integrationId,
          workspaceId: feedbackWindow.integration.workspaceId,
        })
        await ctx.runMutation(markFeedbackProcessingPausedMutation, {
          integrationId: args.integrationId,
          reason: "Paused — active plan required",
        })
        return { skipped: true, reason: "no_active_plan" }
      }

      // Hard-stop scanning when overages are disabled and the workspace has
      // run out of events. We bail before any LLM call so the workspace isn't
      // billed for AI usage tied to ingest the user has paused.
      const quotaStatus = (await ctx.runAction(
        internal.billing.getWorkspaceQuotaStatusInternal,
        { workspaceId: feedbackWindow.integration.workspaceId }
      )) as WorkspaceQuotaStatus

      if (quotaStatus.eventsExhausted) {
        logInfo("Skipping Discord feedback scan — events exhausted", {
          integrationId: args.integrationId,
          workspaceId: feedbackWindow.integration.workspaceId,
        })
        await ctx.runMutation(markFeedbackProcessingPausedMutation, {
          integrationId: args.integrationId,
          reason: "Paused — events exhausted (overages disabled)",
        })
        return { skipped: true, reason: "events_exhausted" }
      }

      const pendingMessagesBeforeIgnore = feedbackWindow.messages.filter(
        (message) =>
          isMessageAfterCursor(message, {
            messageId: feedbackWindow.integration.lastProcessedMessageId,
            messageCreatedAt:
              feedbackWindow.integration.lastProcessedMessageCreatedAt,
          })
      )

      if (pendingMessagesBeforeIgnore.length === 0) {
        return { skipped: true, reason: "no_pending_messages" }
      }

      const latestPendingMessage = pendingMessagesBeforeIgnore.at(-1)
      if (!latestPendingMessage) {
        return { skipped: true, reason: "missing_latest_pending_message" }
      }

      const ignoredChannelIds = new Set(
        feedbackWindow.integration.feedbackIgnoredChannelIds
      )
      const pendingMessages = pendingMessagesBeforeIgnore.filter(
        (message) => !isIgnoredDiscordMessage(message, ignoredChannelIds)
      )
      const pendingNonAdminMessages = pendingMessages.filter(
        (message) => !message.authorHasAdminPrivileges
      )

      logInfo("Loaded Discord feedback window", {
        integrationId: args.integrationId,
        workspaceId: feedbackWindow.integration.workspaceId,
        totalMessages: feedbackWindow.messages.length,
        pendingMessages: pendingMessages.length,
        ignoredMessages:
          pendingMessagesBeforeIgnore.length - pendingMessages.length,
        pendingAdminMessages:
          pendingMessages.length - pendingNonAdminMessages.length,
      })

      if (pendingMessages.length === 0) {
        await ctx.runMutation(markFeedbackWindowProcessedInternalMutation, {
          integrationId: args.integrationId,
          lastProcessedMessageId: latestPendingMessage.messageId,
          lastProcessedMessageCreatedAt: latestPendingMessage.messageCreatedAt,
        })

        return {
          skipped: false,
          createdTaskCount: 0,
          updatedTaskCount: 0,
          reason: "ignored_channels_only",
        }
      }

      if (pendingNonAdminMessages.length === 0) {
        await ctx.runMutation(markFeedbackWindowProcessedInternalMutation, {
          integrationId: args.integrationId,
          lastProcessedMessageId: latestPendingMessage.messageId,
          lastProcessedMessageCreatedAt: latestPendingMessage.messageCreatedAt,
        })

        return {
          skipped: false,
          createdTaskCount: 0,
          updatedTaskCount: 0,
          reason: "admin_only_messages",
        }
      }

      const contextMessages = feedbackWindow.messages
        .filter(
          (message) => !isIgnoredDiscordMessage(message, ignoredChannelIds)
        )
        .filter((message) => !message.authorHasAdminPrivileges)
        .slice(-FEEDBACK_CONTEXT_LIMIT)
      const pendingMessageIds = new Set<string>(
        pendingNonAdminMessages.map((message) => message.messageId)
      )
      const transcript = formatTranscript(contextMessages, pendingMessageIds)
      const classifierSystemParts: string[] = [
        "You classify Discord conversations for a product team.",
        `The only product that matters is ${feedbackWindow.integration.workspaceName}`,
        "Return isProductFeedback=true only when the newest messages contain concrete product feedback, a bug report, a feature request, workflow friction, or an actionable complaint about the actual product.",
        "Be strict: only flag messages that describe a specific problem, request, or behavior with the product. When in doubt, classify as not feedback.",
        "Reject compliments, praise, hype, thanks, and generic positive sentiment about the product when there is no specific request, problem, or suggestion attached. Examples to reject: 'I love this tool', 'great product', 'this is awesome', 'rlly like X'.",
        "Reject server-joining or introduction messages such as 'just joined', 'hi everyone', 'thought I'd check this out', or explanations of why someone joined the server.",
        "Reject off-topic chat, memes, social commentary about other community members or people (e.g. 'X is a cool guy'), hiring talk, agency requests, feedback about unrelated tools, and generic conversation that is not about the product itself.",
        "Use the recent context only to interpret what the new messages refer to.",
        "Return needsTaskAction=true only when the NEW messages contain enough specific, non-duplicate information to justify creating a task or materially updating one.",
        "Return needsTaskAction=false for +1s, me-too replies, generic agreement, thanks, status checks, bumps, exact duplicate restatements, compliments, or any messages that add no useful triage detail.",
        "Treat direct breakage or reliability reports as actionable even without reproduction steps, including 500 errors, pages not loading, nothing works, and severe slowness/performance regressions.",
        "Treat requests for missing functionality, confusing behavior, setup friction, integrations, workflow blockers, or repeated complaints as actionable.",
        "Forum and thread metadata may appear inline as forum/thread/channel labels; use that metadata as evidence, especially when a forum post body is empty.",
        "Only include relevantMessageIds from NEW messages.",
        "Each message has an [id:XXXXXXX] tag. Use the numeric ID from that tag as the relevantMessageId, NOT the timestamp.",
        "Return valid JSON only. No markdown. No code fences. No commentary.",
        'Use this exact JSON shape: {"isProductFeedback":false,"needsTaskAction":false,"confidence":0.0,"summary":null,"reason":"...","relevantMessageIds":["123456789"]}',
      ]

      const additionalContext = getAdditionalContext(
        feedbackWindow.integration.additionalContext
      )
      if (additionalContext) {
        classifierSystemParts.push(
          `Additional product context from the workspace owner: ${additionalContext}`
        )
      }

      const classifierStart = Date.now()
      const classifierResult = await generateText({
        model: AI_MODELS.feedbackClassifier,
        system: classifierSystemParts.join(" "),
        prompt: [
          `Workspace name: ${feedbackWindow.integration.workspaceName}`,
          `Guild: ${feedbackWindow.integration.guildName}`,
          "Conversation transcript:",
          transcript,
        ].join("\n\n"),
      })
      const classifierDurationMs = Date.now() - classifierStart

      await trackLLMGeneration({
        distinctId: feedbackWindow.integration.workspaceId,
        model: AI_MODEL_IDS.feedbackClassifier,
        feature: "discord_feedback_classifier",
        inputTokens: classifierResult.usage?.inputTokens,
        outputTokens: classifierResult.usage?.outputTokens,
        durationMs: classifierDurationMs,
        success: true,
        metadata: {
          integration_id: args.integrationId,
          pending_message_count: pendingNonAdminMessages.length,
        },
      })

      await safeTrackAiUsage({
        workspaceId: feedbackWindow.integration.workspaceId,
        workspaceName: feedbackWindow.integration.workspaceName,
        model: AI_MODEL_IDS.feedbackClassifier,
        inputTokens: classifierResult.usage?.inputTokens,
        outputTokens: classifierResult.usage?.outputTokens,
        properties: {
          feature: "discord_feedback_classifier",
          integration_id: args.integrationId,
        },
      })

      const classification = feedbackClassificationSchema.parse(
        JSON.parse(extractJsonObject(classifierResult.text))
      )

      logInfo("Discord feedback classified", {
        integrationId: args.integrationId,
        isProductFeedback: classification.isProductFeedback,
        needsTaskAction: classification.needsTaskAction,
        confidence: classification.confidence,
        relevantMessageCount: classification.relevantMessageIds.length,
      })

      const forcedTaskAction =
        classification.isProductFeedback &&
        !classification.needsTaskAction &&
        hasHighSignalTaskActionFeedback(pendingNonAdminMessages)

      if (forcedTaskAction) {
        logInfo("Forcing Discord task extraction for high-signal feedback", {
          integrationId: args.integrationId,
        })
      }

      if (!classification.isProductFeedback) {
        // Log AI cost even when no actionable feedback is found
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
            message: "Processed Discord messages (no actionable feedback)",
            source: "discord",
            cost: classifierCost,
          })
        }

        await ctx.runMutation(markFeedbackWindowProcessedInternalMutation, {
          integrationId: args.integrationId,
          lastProcessedMessageId: latestPendingMessage.messageId,
          lastProcessedMessageCreatedAt: latestPendingMessage.messageCreatedAt,
        })

        return {
          skipped: false,
          createdTaskCount: 0,
          updatedTaskCount: 0,
          reason: classification.isProductFeedback
            ? "not_actionable"
            : "not_product_feedback",
        }
      }

      const normalizedRelevantIds = new Set(
        classification.relevantMessageIds
          .map((messageId) => normalizeDiscordId(messageId))
          .filter(Boolean)
      )

      const matchedRelevantMessages = pendingNonAdminMessages.filter(
        (message) =>
          normalizedRelevantIds.has(normalizeDiscordId(message.messageId))
      )

      const relevantMessages =
        matchedRelevantMessages.length > 0
          ? matchedRelevantMessages
          : pendingNonAdminMessages
      const relevantMessagesForExtraction = relevantMessages.slice(
        -RELEVANT_MESSAGE_LIMIT
      )
      const existingTasks = await ctx.runQuery(
        getTaskSnapshotForDiscordInternalQuery,
        {
          workspaceId: feedbackWindow.integration.workspaceId,
          limit: TASK_CONTEXT_FETCH_LIMIT,
        }
      )
      const relevantTasks = selectRelevantTasks(
        existingTasks,
        relevantMessagesForExtraction
      )

      const labelsText =
        feedbackWindow.integration.availableLabels.length > 0
          ? feedbackWindow.integration.availableLabels.join(", ")
          : "No predefined labels."

      const extractorSystemParts: string[] = [
        "You turn product feedback into concise task requests for a task board.",
        `The product is ${feedbackWindow.integration.workspaceName}.`,
        "Only create or update tasks for actionable feedback about the real product. Ignore unrelated discussion.",
        "The classifier already decided these messages are product feedback. Your default behavior is to create or update a task, not to drop the feedback.",
        "Return between 0 and 5 actions total.",
        "Return 0 actions only when the feedback is an exact duplicate of an existing task and adds no new symptom, scope, user impact, reproduction detail, urgency, or acceptance criteria.",
        "Each action must be distinct, concrete, and understandable without Discord context.",
        "You can either create a new task or update an existing task.",
        "Use update when the new feedback materially adds detail to an existing open task, such as reproduction steps, missing scope, edge cases, urgency, or acceptance criteria.",
        "For update actions, use the existing taskCode and return the full revised title, description, priority, and labels after incorporating the new feedback.",
        "Do not update shipped or archived tasks. If the closest shipped task is only an exact duplicate, do nothing. If the new feedback is materially different, create a new task instead.",
        "If an existing task — regardless of status — describes the EXACT same specific issue with no meaningful new information, do not create a task and do not update anything.",
        "Different error messages, different symptoms, or different contexts should each get their own task even if they relate to the same general area.",
        "When in doubt between update and create, prefer update only for the same underlying task; otherwise create.",
        "Use forum, thread, parent channel, and channel names as task context when the message body is short or empty.",
        "Write task titles as specific outcomes or problems, not generic titles like 'Review feedback'.",
        "Descriptions should summarize the user problem and expected outcome in plain text.",
        "Priority may be urgent, high, medium, low, or none.",
        `Allowed labels: ${labelsText}`,
        "Only use labels from the allowed list. Use an empty array when none apply.",
        'Return valid structured output only with action items shaped like {"action":"create",...} or {"action":"update","taskCode":"MDN-123",...}.',
      ]

      if (additionalContext) {
        extractorSystemParts.push(
          `Additional product context from the workspace owner: ${additionalContext}`
        )
      }

      const extractorStart = Date.now()
      let extractorDurationMs = 0
      let extractorUsage:
        | {
            inputTokens?: number
            outputTokens?: number
          }
        | undefined
      let extracted: z.infer<typeof extractedFeedbackTasksSchema> | null = null

      try {
        const extractorResult = await generateText({
          model: AI_MODELS.feedbackExtractor,
          system: extractorSystemParts.join(" "),
          prompt: [
            `Classifier summary: ${classification.summary ?? classification.reason}`,
            "Likely matching existing tasks:",
            formatExistingTasks(relevantTasks),
            "Relevant feedback messages:",
            relevantMessagesForExtraction
              .map((message) =>
                [
                  `- ${new Date(message.messageCreatedAt).toISOString()}`,
                  message.forumTitle
                    ? `forum=${truncateText(message.forumTitle, MAX_LOCATION_TEXT_CHARS)}`
                    : null,
                  message.threadTitle
                    ? `thread=${truncateText(message.threadTitle, MAX_LOCATION_TEXT_CHARS)}`
                    : null,
                  message.parentChannelName
                    ? `parent_channel=${truncateText(message.parentChannelName, MAX_LOCATION_TEXT_CHARS)}`
                    : null,
                  message.channelName
                    ? `channel=${truncateText(message.channelName, MAX_LOCATION_TEXT_CHARS)}`
                    : null,
                  `${message.authorUsername}: ${
                    truncateText(message.content, MAX_MESSAGE_CONTENT_CHARS) ||
                    (message.threadTitle
                      ? "(no body text; rely on the thread title)"
                      : "(no body text)")
                  }`,
                ]
                  .filter(Boolean)
                  .join(" | ")
              )
              .join("\n"),
          ].join("\n\n"),
        })
        extractorDurationMs = Date.now() - extractorStart
        extractorUsage = extractorResult.usage
        const parsedExtraction = extractedFeedbackTasksSchema.safeParse(
          JSON.parse(extractJsonObject(extractorResult.text))
        )
        if (parsedExtraction.success) {
          extracted = parsedExtraction.data
        } else {
          logError(
            "Discord feedback extractor schema mismatch",
            parsedExtraction.error,
            {
              integrationId: args.integrationId,
              workspaceId: feedbackWindow.integration.workspaceId,
            }
          )
          throw parsedExtraction.error
        }

        await trackLLMGeneration({
          distinctId: feedbackWindow.integration.workspaceId,
          model: AI_MODEL_IDS.feedbackExtractor,
          feature: "discord_feedback_extractor",
          inputTokens: extractorResult.usage?.inputTokens,
          outputTokens: extractorResult.usage?.outputTokens,
          durationMs: extractorDurationMs,
          success: true,
          metadata: {
            integration_id: args.integrationId,
            relevant_message_count: relevantMessagesForExtraction.length,
            existing_task_count: relevantTasks.length,
          },
        })

        await safeTrackAiUsage({
          workspaceId: feedbackWindow.integration.workspaceId,
          workspaceName: feedbackWindow.integration.workspaceName,
          model: AI_MODEL_IDS.feedbackExtractor,
          inputTokens: extractorResult.usage?.inputTokens,
          outputTokens: extractorResult.usage?.outputTokens,
          properties: {
            feature: "discord_feedback_extractor",
            integration_id: args.integrationId,
          },
        })
      } catch (error) {
        extractorDurationMs = Date.now() - extractorStart
        logError("Discord feedback extractor parse failure", error, {
          integrationId: args.integrationId,
          workspaceId: feedbackWindow.integration.workspaceId,
        })
        throw error
      }

      const totalAiCost =
        getAiCostForTokens({
          model: AI_MODEL_IDS.feedbackClassifier,
          inputTokens: classifierResult.usage?.inputTokens,
          outputTokens: classifierResult.usage?.outputTokens,
        }) +
        getAiCostForTokens({
          model: AI_MODEL_IDS.feedbackExtractor,
          inputTokens: extractorUsage?.inputTokens,
          outputTokens: extractorUsage?.outputTokens,
        })

      if (!extracted) {
        logInfo("Discord feedback extraction produced no structured output", {
          integrationId: args.integrationId,
        })

        extracted = { actions: [] }
      }

      let createdTaskCount = 0
      let updatedTaskCount = 0

      const extractedActions = extracted.actions.slice(
        0,
        MAX_EXTRACTED_TASK_ACTIONS
      )
      const actionableClassification = classification.isProductFeedback
      const fallbackMessages =
        relevantMessagesForExtraction.length > 0
          ? relevantMessagesForExtraction
          : pendingNonAdminMessages

      logInfo("Discord feedback extracted actions", {
        integrationId: args.integrationId,
        extractedActionCount: extracted.actions.length,
        cappedActionCount: extractedActions.length,
      })

      if (extractedActions.length > 0) {
        const authors = Array.from(
          new Set(
            relevantMessagesForExtraction.map(
              (message) => message.authorUsername
            )
          )
        )
        const sourceUrl =
          relevantMessagesForExtraction[
            relevantMessagesForExtraction.length - 1
          ]?.permalink
        const createdAtLabel = formatCreatedAtLabel(
          latestPendingMessage.messageCreatedAt
        )

        const result = await ctx.runMutation(
          createTasksFromDiscordFeedbackInternalMutation,
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
                            platform: "discord" as const,
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
      }

      const fallbackHighSignal = hasHighSignalTaskActionFeedback(fallbackMessages)
      if (
        actionableClassification &&
        createdTaskCount === 0 &&
        updatedTaskCount === 0 &&
        fallbackHighSignal
      ) {
        const authors = Array.from(
          new Set(fallbackMessages.map((message) => message.authorUsername))
        )
        const sourceUrl =
          fallbackMessages[fallbackMessages.length - 1]?.permalink
        const createdAtLabel = formatCreatedAtLabel(
          latestPendingMessage.messageCreatedAt
        )
        const fallbackSummary = classification.summary ?? classification.reason
        const fallbackPriority = "high" as const

        logInfo("Applying fallback Discord task create for high-signal incident", {
          integrationId: args.integrationId,
        })

        const fallbackResult = await ctx.runMutation(
          createTasksFromDiscordFeedbackInternalMutation,
          {
            workspaceId: feedbackWindow.integration.workspaceId,
            operations: [
              {
                action: "create" as const,
                task: {
                  title: buildFallbackTaskTitle(fallbackMessages),
                  description: buildFallbackTaskDescription(
                    fallbackMessages,
                    fallbackSummary
                  ),
                  status: "requests" as const,
                  priority: fallbackPriority,
                  labels: [],
                  source: sourceUrl
                    ? {
                        platform: "discord" as const,
                        url: sourceUrl,
                        author: authors.join(", "),
                      }
                    : undefined,
                  createdAtLabel,
                },
              },
            ],
            cost: totalAiCost > 0 ? totalAiCost : undefined,
          }
        )

        createdTaskCount += fallbackResult.createdTaskIds.length
        updatedTaskCount += fallbackResult.updatedTaskIds.length
      }

      if (createdTaskCount === 0 && updatedTaskCount === 0 && totalAiCost > 0) {
        // Log AI cost when extractor returns no actions
        await ctx.runMutation(internal.logs.recordWorkspaceLog, {
          workspaceId: feedbackWindow.integration.workspaceId,
          category: "tasks",
          type: "feedback_processed",
          message: "Processed Discord messages (no actionable feedback)",
          source: "discord",
          cost: totalAiCost,
        })
      }

      await ctx.runMutation(markFeedbackWindowProcessedInternalMutation, {
        integrationId: args.integrationId,
        lastProcessedMessageId: latestPendingMessage.messageId,
        lastProcessedMessageCreatedAt: latestPendingMessage.messageCreatedAt,
      })

      logInfo("Finished Discord feedback processing attempt", {
        integrationId: args.integrationId,
        createdTaskCount,
        updatedTaskCount,
      })

      await trackFeedbackProcessing({
        distinctId: feedbackWindow.integration.workspaceId,
        platform: "discord",
        integrationId: args.integrationId,
        workspaceId: feedbackWindow.integration.workspaceId,
        messageCount: pendingNonAdminMessages.length,
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
      logError("Failed to process Discord feedback window", error, {
        integrationId: args.integrationId,
      })
      throw error
    }
  },
})
