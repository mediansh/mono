import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import type { Id } from "@/convex/_generated/dataModel"
import type { WorkspaceQuotaStatus } from "@/convex/billing"

export type DiscordFeedbackMessage = {
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

export type SlackFeedbackMessage = {
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

export type XFeedbackPost = {
  _id: Id<"xPosts">
  postId: string
  authorUsername: string
  content: string
  permalink: string
  postCreatedAt: number
}

export type DiscordFeedbackWindow = {
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
  messages: DiscordFeedbackMessage[]
}

export type SlackFeedbackWindow = {
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
  messages: SlackFeedbackMessage[]
}

export type XFeedbackWindow = {
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
  posts: XFeedbackPost[]
}

export type TaskSnapshot = {
  taskId: Id<"tasks">
  taskCode: string
  title: string
  description: string | null
  status: "requests" | "todo" | "in_progress" | "ready" | "shipped" | "archive"
  priority: "urgent" | "high" | "medium" | "low" | "none"
  labels: string[]
  sourceUrl: string | null
}

export type DiscordFeedbackTaskOperation =
  | {
      action: "create"
      task: {
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
    }
  | {
      action: "update"
      taskCode: string
      title: string
      description?: string
      priority?: "urgent" | "high" | "medium" | "low" | "none"
      labels: string[]
    }

export type SlackFeedbackTaskOperation =
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

export type XFeedbackTaskOperation =
  | {
      action: "create"
      task: {
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
    }
  | {
      action: "update"
      taskCode: string
      title: string
      description?: string
      priority?: "urgent" | "high" | "medium" | "low" | "none"
      labels: string[]
    }

type FinalizeResult = {
  kind: "success" | "failed" | "canceled"
  error?: string
  reason?: string
  pauseReason?: string
}

const getPendingDiscordFeedbackWindowRef = makeFunctionReference<
  "query",
  {
    botSecret: string
    integrationId: Id<"discordWorkspaceIntegrations">
    limit?: number
  },
  DiscordFeedbackWindow
>("discord:getPendingFeedbackWindow")

const markDiscordFeedbackWindowProcessedRef = makeFunctionReference<
  "mutation",
  {
    botSecret: string
    integrationId: Id<"discordWorkspaceIntegrations">
    lastProcessedMessageId: string
    lastProcessedMessageCreatedAt: number
  },
  null
>("discord:markFeedbackWindowProcessed")

const getTaskSnapshotForDiscordRef = makeFunctionReference<
  "query",
  {
    botSecret: string
    workspaceId: Id<"workspaces">
    limit?: number
  },
  TaskSnapshot[]
>("tasks:getTaskSnapshotForDiscord")

const applyDiscordFeedbackTaskOperationsRef = makeFunctionReference<
  "mutation",
  {
    botSecret: string
    workspaceId: Id<"workspaces">
    operations: DiscordFeedbackTaskOperation[]
    cost?: number
  },
  {
    createdTaskIds: Id<"tasks">[]
    updatedTaskIds: Id<"tasks">[]
  }
>("tasks:applyDiscordFeedbackTaskOperations")

const getWorkspaceQuotaStatusForDiscordFeedbackRef = makeFunctionReference<
  "action",
  {
    botSecret: string
    workspaceId: Id<"workspaces">
  },
  WorkspaceQuotaStatus
>("billing:getWorkspaceQuotaStatusForDiscordFeedback")

const finalizeDelegatedDiscordFeedbackProcessingRef = makeFunctionReference<
  "mutation",
  {
    botSecret: string
    integrationId: Id<"discordWorkspaceIntegrations">
    result: FinalizeResult
  },
  null
>("discordFeedback:finalizeDelegatedFeedbackProcessing")

const getPendingSlackFeedbackWindowRef = makeFunctionReference<
  "query",
  {
    botSecret: string
    integrationId: Id<"slackWorkspaceIntegrations">
    limit?: number
  },
  SlackFeedbackWindow
>("slack:getPendingFeedbackWindow")

const markSlackFeedbackWindowProcessedRef = makeFunctionReference<
  "mutation",
  {
    botSecret: string
    integrationId: Id<"slackWorkspaceIntegrations">
    lastProcessedMessageId: string
    lastProcessedMessageCreatedAt: number
  },
  null
>("slack:markFeedbackWindowProcessed")

const getTaskSnapshotForSlackRef = makeFunctionReference<
  "query",
  {
    botSecret: string
    workspaceId: Id<"workspaces">
    limit?: number
  },
  TaskSnapshot[]
>("tasks:getTaskSnapshotForSlackFeedback")

const applySlackFeedbackTaskOperationsRef = makeFunctionReference<
  "mutation",
  {
    botSecret: string
    workspaceId: Id<"workspaces">
    operations: SlackFeedbackTaskOperation[]
    cost?: number
  },
  {
    createdTaskIds: Id<"tasks">[]
    updatedTaskIds: Id<"tasks">[]
  }
>("tasks:applySlackFeedbackTaskOperations")

const getWorkspaceQuotaStatusForSlackFeedbackRef = makeFunctionReference<
  "action",
  {
    botSecret: string
    workspaceId: Id<"workspaces">
  },
  WorkspaceQuotaStatus
>("billing:getWorkspaceQuotaStatusForSlackFeedback")

const finalizeDelegatedSlackFeedbackProcessingRef = makeFunctionReference<
  "mutation",
  {
    botSecret: string
    integrationId: Id<"slackWorkspaceIntegrations">
    result: FinalizeResult
  },
  null
>("slackFeedback:finalizeDelegatedFeedbackProcessing")

const getPendingXFeedbackWindowRef = makeFunctionReference<
  "query",
  {
    botSecret: string
    integrationId: Id<"xWorkspaceIntegrations">
    limit?: number
  },
  XFeedbackWindow
>("x:getPendingFeedbackWindow")

const markXFeedbackWindowProcessedRef = makeFunctionReference<
  "mutation",
  {
    botSecret: string
    integrationId: Id<"xWorkspaceIntegrations">
    lastProcessedPostId: string
    lastProcessedPostCreatedAt: number
  },
  null
>("x:markFeedbackWindowProcessed")

const getTaskSnapshotForXRef = makeFunctionReference<
  "query",
  {
    botSecret: string
    workspaceId: Id<"workspaces">
    limit?: number
  },
  TaskSnapshot[]
>("tasks:getTaskSnapshotForXFeedback")

const applyXFeedbackTaskOperationsRef = makeFunctionReference<
  "mutation",
  {
    botSecret: string
    workspaceId: Id<"workspaces">
    operations: XFeedbackTaskOperation[]
    cost?: number
  },
  {
    createdTaskIds: Id<"tasks">[]
    updatedTaskIds: Id<"tasks">[]
  }
>("tasks:applyXFeedbackTaskOperations")

const getWorkspaceQuotaStatusForXFeedbackRef = makeFunctionReference<
  "action",
  {
    botSecret: string
    workspaceId: Id<"workspaces">
  },
  WorkspaceQuotaStatus
>("billing:getWorkspaceQuotaStatusForXFeedback")

const finalizeDelegatedXFeedbackProcessingRef = makeFunctionReference<
  "mutation",
  {
    botSecret: string
    integrationId: Id<"xWorkspaceIntegrations">
    result: FinalizeResult
  },
  null
>("xFeedback:finalizeDelegatedFeedbackProcessing")

function getRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function getConvexUrl() {
  return getRequiredEnv("NEXT_PUBLIC_CONVEX_URL")
}

export function createConvexWorkerClient() {
  const client = new ConvexHttpClient(getConvexUrl())

  return {
    discord: {
      getPendingFeedbackWindow(botSecret: string, integrationId: Id<"discordWorkspaceIntegrations">, limit?: number) {
        return client.query(getPendingDiscordFeedbackWindowRef, { botSecret, integrationId, limit })
      },
      markFeedbackWindowProcessed(
        botSecret: string,
        integrationId: Id<"discordWorkspaceIntegrations">,
        lastProcessedMessageId: string,
        lastProcessedMessageCreatedAt: number
      ) {
        return client.mutation(markDiscordFeedbackWindowProcessedRef, {
          botSecret,
          integrationId,
          lastProcessedMessageId,
          lastProcessedMessageCreatedAt,
        })
      },
      getTaskSnapshot(botSecret: string, workspaceId: Id<"workspaces">, limit?: number) {
        return client.query(getTaskSnapshotForDiscordRef, { botSecret, workspaceId, limit })
      },
      applyTaskOperations(
        botSecret: string,
        workspaceId: Id<"workspaces">,
        operations: DiscordFeedbackTaskOperation[],
        cost?: number
      ) {
        return client.mutation(applyDiscordFeedbackTaskOperationsRef, {
          botSecret,
          workspaceId,
          operations,
          cost,
        })
      },
      getWorkspaceQuotaStatus(botSecret: string, workspaceId: Id<"workspaces">) {
        return client.action(getWorkspaceQuotaStatusForDiscordFeedbackRef, { botSecret, workspaceId })
      },
      finalize(
        botSecret: string,
        integrationId: Id<"discordWorkspaceIntegrations">,
        result: FinalizeResult
      ) {
        return client.mutation(finalizeDelegatedDiscordFeedbackProcessingRef, {
          botSecret,
          integrationId,
          result,
        })
      },
    },
    slack: {
      getPendingFeedbackWindow(botSecret: string, integrationId: Id<"slackWorkspaceIntegrations">, limit?: number) {
        return client.query(getPendingSlackFeedbackWindowRef, { botSecret, integrationId, limit })
      },
      markFeedbackWindowProcessed(
        botSecret: string,
        integrationId: Id<"slackWorkspaceIntegrations">,
        lastProcessedMessageId: string,
        lastProcessedMessageCreatedAt: number
      ) {
        return client.mutation(markSlackFeedbackWindowProcessedRef, {
          botSecret,
          integrationId,
          lastProcessedMessageId,
          lastProcessedMessageCreatedAt,
        })
      },
      getTaskSnapshot(botSecret: string, workspaceId: Id<"workspaces">, limit?: number) {
        return client.query(getTaskSnapshotForSlackRef, { botSecret, workspaceId, limit })
      },
      applyTaskOperations(
        botSecret: string,
        workspaceId: Id<"workspaces">,
        operations: SlackFeedbackTaskOperation[],
        cost?: number
      ) {
        return client.mutation(applySlackFeedbackTaskOperationsRef, {
          botSecret,
          workspaceId,
          operations,
          cost,
        })
      },
      getWorkspaceQuotaStatus(botSecret: string, workspaceId: Id<"workspaces">) {
        return client.action(getWorkspaceQuotaStatusForSlackFeedbackRef, { botSecret, workspaceId })
      },
      finalize(
        botSecret: string,
        integrationId: Id<"slackWorkspaceIntegrations">,
        result: FinalizeResult
      ) {
        return client.mutation(finalizeDelegatedSlackFeedbackProcessingRef, {
          botSecret,
          integrationId,
          result,
        })
      },
    },
    x: {
      getPendingFeedbackWindow(botSecret: string, integrationId: Id<"xWorkspaceIntegrations">, limit?: number) {
        return client.query(getPendingXFeedbackWindowRef, { botSecret, integrationId, limit })
      },
      markFeedbackWindowProcessed(
        botSecret: string,
        integrationId: Id<"xWorkspaceIntegrations">,
        lastProcessedPostId: string,
        lastProcessedPostCreatedAt: number
      ) {
        return client.mutation(markXFeedbackWindowProcessedRef, {
          botSecret,
          integrationId,
          lastProcessedPostId,
          lastProcessedPostCreatedAt,
        })
      },
      getTaskSnapshot(botSecret: string, workspaceId: Id<"workspaces">, limit?: number) {
        return client.query(getTaskSnapshotForXRef, { botSecret, workspaceId, limit })
      },
      applyTaskOperations(
        botSecret: string,
        workspaceId: Id<"workspaces">,
        operations: XFeedbackTaskOperation[],
        cost?: number
      ) {
        return client.mutation(applyXFeedbackTaskOperationsRef, {
          botSecret,
          workspaceId,
          operations,
          cost,
        })
      },
      getWorkspaceQuotaStatus(botSecret: string, workspaceId: Id<"workspaces">) {
        return client.action(getWorkspaceQuotaStatusForXFeedbackRef, { botSecret, workspaceId })
      },
      finalize(
        botSecret: string,
        integrationId: Id<"xWorkspaceIntegrations">,
        result: FinalizeResult
      ) {
        return client.mutation(finalizeDelegatedXFeedbackProcessingRef, {
          botSecret,
          integrationId,
          result,
        })
      },
    },
  }
}
