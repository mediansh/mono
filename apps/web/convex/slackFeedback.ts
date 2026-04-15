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
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"

const FEEDBACK_WINDOW_LIMIT = 100
const FEEDBACK_CONTEXT_LIMIT = 10
const EXISTING_TASK_CONTEXT_LIMIT = 50
const FEEDBACK_PROCESSING_DEBOUNCE_MS = 8_000
const FEEDBACK_PROCESSING_RETRY_DELAY_MS = 5_000
const DEFAULT_WORKPOOL_PARALLELISM = 2

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
  actions: z
    .array(
      z.discriminatedUnion("action", [
        z.object({
          action: z.literal("create"),
          title: z.string().min(1).max(140),
          description: z.string().max(2000).nullable(),
          priority: z
            .enum(["urgent", "high", "medium", "low", "none"])
            .nullable(),
          labels: z.array(z.string()).max(5),
        }),
        z.object({
          action: z.literal("update"),
          taskCode: z.string().min(1),
          title: z.string().min(1).max(140),
          description: z.string().max(2000).nullable(),
          priority: z
            .enum(["urgent", "high", "medium", "low", "none"])
            .nullable(),
          labels: z.array(z.string()).max(5),
        }),
      ])
    )
    .max(5),
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

function getSlackFeedbackWorkerBaseUrl() {
  const baseUrl =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL

  if (!baseUrl) {
    throw new Error(
      "Missing APP_URL or NEXT_PUBLIC_APP_URL for Slack feedback worker handoff"
    )
  }

  return baseUrl.replace(/\/$/, "")
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

    try {
      const botSecret = process.env.SLACK_BOT_SECRET
      if (!botSecret) {
        throw new Error("Missing SLACK_BOT_SECRET for Slack feedback handoff")
      }

      const response = await fetch(
        `${getSlackFeedbackWorkerBaseUrl()}/api/internal/feedback/slack/process`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-median-worker-secret": botSecret,
          },
          body: JSON.stringify({
            integrationId: args.integrationId,
          }),
        }
      )

      if (!response.ok) {
        const responseText = await response.text()
        throw new Error(
          `Slack feedback worker handoff failed: ${response.status} ${responseText}`
        )
      }

      return { skipped: true, reason: "delegated" }
    } catch (error) {
      logError("Failed to hand off Slack feedback window", error, {
        integrationId: args.integrationId,
      })
      throw error
    }
  },
})
