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

type DiscordFeedbackTaskInput = {
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
  relevantMessageIds: z.array(z.string()).max(25),
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
    tasks: DiscordFeedbackTaskInput[]
  },
  { _id: Id<"tasks"> }[]
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
        message.forumTitle ? `forum:${message.forumTitle}` : null,
        message.threadTitle ? `thread:${message.threadTitle}` : null,
        message.parentChannelName
          ? `parent_channel:${message.parentChannelName}`
          : null,
        message.channelName ? `channel:${message.channelName}` : null,
      ].filter(Boolean)
      const locationPrefix =
        locationParts.length > 0 ? ` [${locationParts.join(" | ")}]` : ""
      const content =
        message.content ||
        (message.threadTitle
          ? "(no body text; use the thread title as the post title)"
          : "(no body text)")
      return `[${marker}] [id:${message.messageId}] ${timestamp}${locationPrefix} ${message.authorUsername}: ${content}`
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

export const handleFeedbackProcessingComplete = internalMutation({
  args: vOnCompleteArgs(
    v.object({
      integrationId: v.id("discordWorkspaceIntegrations"),
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

    const shouldRerun =
      args.result.kind === "failed" ||
      integration.feedbackProcessingNeedsRerun === true ||
      hasPendingMessages

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
            : integration.feedbackProcessingNeedsRerun
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
        args.result.kind === "failed" ? args.result.error : undefined,
    })
  },
})

export const processFeedbackWindow = internalAction({
  args: {
    integrationId: v.id("discordWorkspaceIntegrations"),
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

      logInfo("Loaded Discord feedback window", {
        integrationId: args.integrationId,
        workspaceId: feedbackWindow.integration.workspaceId,
        totalMessages: feedbackWindow.messages.length,
        pendingMessages: pendingMessages.length,
        pendingAdminMessages:
          pendingMessages.length - pendingNonAdminMessages.length,
      })

      if (pendingMessages.length === 0) {
        return { skipped: true, reason: "no_pending_messages" }
      }

      const latestPendingMessage = pendingMessages.at(-1)
      if (!latestPendingMessage) {
        return { skipped: true, reason: "missing_latest_pending_message" }
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
          reason: "admin_only_messages",
        }
      }

      const contextMessages = feedbackWindow.messages
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
        "Reject off-topic chat, memes, introductions, hiring talk, agency requests, feedback about unrelated tools, and generic conversation that is not about the product itself.",
        "Use the recent context only to interpret what the new messages refer to.",
        "Forum and thread metadata may appear inline as forum/thread/channel labels; use that metadata, especially when a forum post body is empty.",
        "Only include relevantMessageIds from NEW messages.",
        "Each message has an [id:XXXXXXX] tag. Use the numeric ID from that tag as the relevantMessageId, NOT the timestamp.",
        "Return valid JSON only. No markdown. No code fences. No commentary.",
        'Use this exact JSON shape: {"isProductFeedback":false,"confidence":0.0,"summary":null,"reason":"...","relevantMessageIds":["123456789"]}',
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
          `Guild: ${feedbackWindow.integration.guildName}`,
          "Conversation transcript:",
          transcript,
        ].join("\n\n"),
      })
      const classifierDurationMs = Date.now() - classifierStart

      trackLLMGeneration({
        distinctId: feedbackWindow.integration.workspaceId,
        model: "google/gemma-3-27b-it",
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

      const classification = feedbackClassificationSchema.parse(
        JSON.parse(extractJsonObject(classifierResult.text))
      )

      logInfo("Discord feedback classified", {
        integrationId: args.integrationId,
        isProductFeedback: classification.isProductFeedback,
        confidence: classification.confidence,
        relevantMessageCount: classification.relevantMessageIds.length,
      })

      if (
        !classification.isProductFeedback ||
        classification.relevantMessageIds.length === 0
      ) {
        await ctx.runMutation(markFeedbackWindowProcessedInternalMutation, {
          integrationId: args.integrationId,
          lastProcessedMessageId: latestPendingMessage.messageId,
          lastProcessedMessageCreatedAt: latestPendingMessage.messageCreatedAt,
        })

        return {
          skipped: false,
          createdTaskCount: 0,
          reason: "not_product_feedback",
        }
      }

      const normalizedRelevantIds = new Set(
        classification.relevantMessageIds
          .map((messageId) => normalizeDiscordId(messageId))
          .filter(Boolean)
      )

      const matchedRelevantMessages = pendingNonAdminMessages.filter((message) =>
        normalizedRelevantIds.has(normalizeDiscordId(message.messageId))
      )

      const relevantMessages =
        matchedRelevantMessages.length > 0
          ? matchedRelevantMessages
          : pendingNonAdminMessages

      const existingTasks = await ctx.runQuery(
        getTaskSnapshotForDiscordInternalQuery,
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
        "Each task must be distinct, concrete, and understandable without Discord context.",
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
          "Relevant feedback messages:",
          relevantMessages
            .map(
              (message) =>
                [
                  `- ${new Date(message.messageCreatedAt).toISOString()}`,
                  message.forumTitle ? `forum=${message.forumTitle}` : null,
                  message.threadTitle ? `thread=${message.threadTitle}` : null,
                  message.parentChannelName
                    ? `parent_channel=${message.parentChannelName}`
                    : null,
                  message.channelName ? `channel=${message.channelName}` : null,
                  `${message.authorUsername}: ${
                    message.content ||
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
      const extractorDurationMs = Date.now() - extractorStart
      const extracted = extractorResult.output

      trackLLMGeneration({
        distinctId: feedbackWindow.integration.workspaceId,
        model: "anthropic/claude-haiku-4.5",
        feature: "discord_feedback_extractor",
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

      if (!extracted) {
        await ctx.runMutation(markFeedbackWindowProcessedInternalMutation, {
          integrationId: args.integrationId,
          lastProcessedMessageId: latestPendingMessage.messageId,
          lastProcessedMessageCreatedAt: latestPendingMessage.messageCreatedAt,
        })

        return {
          skipped: false,
          createdTaskCount: 0,
          reason: "no_structured_output",
        }
      }

      if (extracted.tasks.length > 0) {
        const authors = Array.from(
          new Set(relevantMessages.map((message) => message.authorUsername))
        )
        const sourceUrl =
          relevantMessages[relevantMessages.length - 1]?.permalink
        const createdAtLabel = formatCreatedAtLabel(
          latestPendingMessage.messageCreatedAt
        )

        await ctx.runMutation(createTasksFromDiscordFeedbackInternalMutation, {
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
                  platform: "discord" as const,
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
        lastProcessedMessageId: latestPendingMessage.messageId,
        lastProcessedMessageCreatedAt: latestPendingMessage.messageCreatedAt,
      })

      logInfo("Finished Discord feedback processing attempt", {
        integrationId: args.integrationId,
        createdTaskCount: extracted.tasks.length,
      })

      trackFeedbackProcessing({
        distinctId: feedbackWindow.integration.workspaceId,
        platform: "discord",
        integrationId: args.integrationId,
        workspaceId: feedbackWindow.integration.workspaceId,
        messageCount: pendingNonAdminMessages.length,
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
      logError("Failed to process Discord feedback window", error, {
        integrationId: args.integrationId,
      })
      throw error
    }
  },
})
