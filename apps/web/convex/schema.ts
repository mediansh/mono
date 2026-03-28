import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  workspaces: defineTable({
    name: v.string(),
    prefix: v.optional(v.string()),
    iconId: v.optional(v.id("_storage")),
    ownerId: v.string(),
    taskCounter: v.optional(v.number()),
    labels: v.optional(
      v.array(
        v.object({
          name: v.string(),
          color: v.string(),
        })
      )
    ),
  }).index("by_owner", ["ownerId"]),

  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("member"),
      v.literal("guest")
    ),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_user_workspace", ["userId", "workspaceId"]),

  workspaceInvites: defineTable({
    workspaceId: v.id("workspaces"),
    createdByUserId: v.string(),
    token: v.string(),
    inviteType: v.union(v.literal("link"), v.literal("email")),
    role: v.union(v.literal("guest"), v.literal("member"), v.literal("admin")),
    invitedEmail: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("revoked")
    ),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
    acceptedByUserId: v.optional(v.string()),
  })
    .index("by_token", ["token"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_status", ["workspaceId", "status"]),

  discordPairingCodes: defineTable({
    code: v.string(),
    guildId: v.string(),
    guildName: v.string(),
    channelId: v.optional(v.string()),
    issuedByDiscordUserId: v.string(),
    issuedByDiscordUsername: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("paired"),
      v.literal("expired")
    ),
    expiresAt: v.number(),
    pairedWorkspaceId: v.optional(v.id("workspaces")),
    pairedByUserId: v.optional(v.string()),
    pairedAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_guild", ["guildId"])
    .index("by_paired_workspace", ["pairedWorkspaceId"]),

  discordWorkspaceIntegrations: defineTable({
    workspaceId: v.id("workspaces"),
    guildId: v.string(),
    guildName: v.string(),
    channelId: v.optional(v.string()),
    pairedByUserId: v.string(),
    pairedAt: v.number(),
    pairingCodeId: v.id("discordPairingCodes"),
    lastProcessedMessageId: v.optional(v.string()),
    lastProcessedMessageCreatedAt: v.optional(v.number()),
    lastProcessedAt: v.optional(v.number()),
    feedbackProcessingState: v.optional(
      v.union(v.literal("idle"), v.literal("scheduled"), v.literal("running"))
    ),
    feedbackProcessingWorkId: v.optional(v.string()),
    feedbackProcessingNeedsRerun: v.optional(v.boolean()),
    feedbackProcessingQueuedAt: v.optional(v.number()),
    feedbackProcessingStartedAt: v.optional(v.number()),
    feedbackProcessingCompletedAt: v.optional(v.number()),
    feedbackProcessingLastError: v.optional(v.string()),
    additionalContext: v.optional(v.string()),
    respondForMe: v.optional(v.boolean()),
    respondForMeMode: v.optional(
      v.union(v.literal("off"), v.literal("all"), v.literal("specific"))
    ),
    respondForMeChannelIds: v.optional(v.array(v.string())),
    guildChannels: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          type: v.number(),
          parentName: v.optional(v.string()),
        })
      )
    ),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_guild", ["guildId"]),

  linearWorkspaceIntegrations: defineTable({
    workspaceId: v.id("workspaces"),
    apiKey: v.string(),
    linearUserId: v.string(),
    linearUserName: v.string(),
    linearUserEmail: v.optional(v.string()),
    teamId: v.string(),
    teamKey: v.optional(v.string()),
    teamName: v.string(),
    statusMappings: v.optional(
      v.object({
        requests: v.optional(v.string()),
        todo: v.optional(v.string()),
        in_progress: v.optional(v.string()),
        ready: v.optional(v.string()),
        shipped: v.optional(v.string()),
        archive: v.optional(v.string()),
      })
    ),
    statusMappingsUpdatedAt: v.optional(v.number()),
    webhookId: v.optional(v.string()),
    webhookToken: v.string(),
    connectedAt: v.number(),
    lastSyncedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_team", ["teamId"])
    .index("by_webhook_token", ["webhookToken"]),

  linearTaskLinks: defineTable({
    workspaceId: v.id("workspaces"),
    taskId: v.id("tasks"),
    linearIssueId: v.string(),
    linearIssueIdentifier: v.string(),
    linearIssueUrl: v.optional(v.string()),
    lastLinearUpdatedAt: v.optional(v.string()),
    lastSyncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_task", ["taskId"])
    .index("by_linear_issue", ["linearIssueId"]),

  linearWebhookDeliveries: defineTable({
    deliveryId: v.string(),
    integrationId: v.id("linearWorkspaceIntegrations"),
    eventType: v.string(),
    receivedAt: v.number(),
  }).index("by_delivery", ["deliveryId"]),

  githubInstallStates: defineTable({
    workspaceId: v.id("workspaces"),
    initiatedByUserId: v.string(),
    state: v.string(),
    redirectUrl: v.string(),
    expiresAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_state", ["state"])
    .index("by_workspace", ["workspaceId"]),

  githubWorkspaceIntegrations: defineTable({
    workspaceId: v.id("workspaces"),
    installationId: v.string(),
    accountId: v.string(),
    accountLogin: v.string(),
    accountType: v.string(),
    repositories: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        fullName: v.string(),
        ownerLogin: v.string(),
        defaultBranch: v.optional(v.string()),
        isPrivate: v.boolean(),
      })
    ),
    selectedRepoIds: v.array(v.string()),
    defaultRepoId: v.optional(v.string()),
    connectedAt: v.number(),
    connectedByUserId: v.string(),
    lastSyncedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_installation", ["installationId"]),

  githubTaskLinks: defineTable({
    workspaceId: v.id("workspaces"),
    taskId: v.id("tasks"),
    installationId: v.string(),
    githubRepositoryId: v.string(),
    githubRepositoryName: v.string(),
    githubRepositoryFullName: v.string(),
    githubIssueId: v.string(),
    githubIssueNumber: v.number(),
    githubIssueUrl: v.string(),
    lastGithubUpdatedAt: v.optional(v.string()),
    lastSyncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_task", ["taskId"])
    .index("by_github_issue", ["githubIssueId"]),

  githubWebhookDeliveries: defineTable({
    deliveryId: v.string(),
    workspaceId: v.id("workspaces"),
    installationId: v.string(),
    eventType: v.string(),
    action: v.optional(v.string()),
    receivedAt: v.number(),
  })
    .index("by_delivery", ["deliveryId"])
    .index("by_workspace_received_at", ["workspaceId", "receivedAt"]),

  githubTaskDevelopmentRefs: defineTable({
    workspaceId: v.id("workspaces"),
    taskId: v.id("tasks"),
    refType: v.union(v.literal("commit"), v.literal("pull_request")),
    githubRepositoryId: v.string(),
    githubRepositoryFullName: v.string(),
    githubObjectId: v.string(),
    commitSha: v.optional(v.string()),
    pullRequestNumber: v.optional(v.number()),
    url: v.optional(v.string()),
    state: v.optional(v.string()),
    isOpen: v.optional(v.boolean()),
    isMerged: v.optional(v.boolean()),
    isDefaultBranch: v.optional(v.boolean()),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_task", ["taskId"])
    .index("by_task_object", ["taskId", "githubObjectId"])
    .index("by_workspace", ["workspaceId"]),

  xOAuthStates: defineTable({
    workspaceId: v.id("workspaces"),
    initiatedByUserId: v.string(),
    requestToken: v.string(),
    requestTokenSecretEncrypted: v.string(),
    redirectUrl: v.string(),
    expiresAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_request_token", ["requestToken"])
    .index("by_workspace", ["workspaceId"]),

  xWorkspaceIntegrations: defineTable({
    workspaceId: v.id("workspaces"),
    xUserId: v.string(),
    username: v.string(),
    name: v.optional(v.string()),
    profileImageUrl: v.optional(v.string()),
    accessTokenEncrypted: v.string(),
    accessTokenSecretEncrypted: v.string(),
    webhookId: v.string(),
    connectedAt: v.number(),
    connectedByUserId: v.string(),
    lastProcessedPostId: v.optional(v.string()),
    lastProcessedPostCreatedAt: v.optional(v.number()),
    lastProcessedAt: v.optional(v.number()),
    lastIngestedPostId: v.optional(v.string()),
    lastIngestedPostCreatedAt: v.optional(v.number()),
    lastIngestedAt: v.optional(v.number()),
    feedbackProcessingState: v.optional(
      v.union(v.literal("idle"), v.literal("scheduled"), v.literal("running"))
    ),
    feedbackProcessingWorkId: v.optional(v.string()),
    feedbackProcessingNeedsRerun: v.optional(v.boolean()),
    feedbackProcessingQueuedAt: v.optional(v.number()),
    feedbackProcessingStartedAt: v.optional(v.number()),
    feedbackProcessingCompletedAt: v.optional(v.number()),
    feedbackProcessingLastError: v.optional(v.string()),
    additionalContext: v.optional(v.string()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_x_user", ["xUserId"]),

  xPosts: defineTable({
    workspaceId: v.id("workspaces"),
    integrationId: v.id("xWorkspaceIntegrations"),
    forUserId: v.string(),
    postId: v.string(),
    permalink: v.string(),
    authorId: v.string(),
    authorUsername: v.string(),
    authorName: v.optional(v.string()),
    content: v.string(),
    inReplyToUserId: v.optional(v.string()),
    postCreatedAt: v.number(),
    receivedAt: v.number(),
  })
    .index("by_integration_post", ["integrationId", "postId"])
    .index("by_integration_created_at", ["integrationId", "postCreatedAt"])
    .index("by_workspace_created_at", ["workspaceId", "postCreatedAt"]),

  xWebhookDeliveries: defineTable({
    workspaceId: v.id("workspaces"),
    integrationId: v.id("xWorkspaceIntegrations"),
    status: v.union(
      v.literal("received"),
      v.literal("accepted"),
      v.literal("ignored"),
      v.literal("error")
    ),
    eventKind: v.union(
      v.literal("crc"),
      v.literal("tweet_create"),
      v.literal("replay_status"),
      v.literal("other")
    ),
    summary: v.string(),
    forUserId: v.optional(v.string()),
    tweetCreateEventCount: v.optional(v.number()),
    acceptedPostCount: v.optional(v.number()),
    ignoredReason: v.optional(v.string()),
    requestId: v.optional(v.string()),
    receivedAt: v.number(),
  })
    .index("by_workspace_received_at", ["workspaceId", "receivedAt"])
    .index("by_integration_received_at", ["integrationId", "receivedAt"]),

  discordMessages: defineTable({
    workspaceId: v.id("workspaces"),
    integrationId: v.id("discordWorkspaceIntegrations"),
    guildId: v.string(),
    channelId: v.string(),
    messageId: v.string(),
    permalink: v.string(),
    authorId: v.string(),
    authorUsername: v.string(),
    content: v.string(),
    messageCreatedAt: v.number(),
    receivedAt: v.number(),
  })
    .index("by_discord_message", ["guildId", "channelId", "messageId"])
    .index("by_integration_created_at", ["integrationId", "messageCreatedAt"])
    .index("by_workspace_channel_created_at", [
      "workspaceId",
      "channelId",
      "messageCreatedAt",
    ]),

  discordPendingNotifications: defineTable({
    workspaceId: v.id("workspaces"),
    integrationId: v.id("discordWorkspaceIntegrations"),
    taskId: v.id("tasks"),
    type: v.union(v.literal("request_received"), v.literal("request_shipped")),
    channelId: v.string(),
    replyToMessageId: v.optional(v.string()),
    taskTitle: v.string(),
    taskCode: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed")
    ),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
  })
    .index("by_integration_status", ["integrationId", "status"])
    .index("by_status", ["status"])
    .index("by_task", ["taskId"]),

  tasks: defineTable({
    workspaceId: v.id("workspaces"),
    taskCode: v.string(),
    taskNumber: v.number(),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("requests"),
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("ready"),
      v.literal("shipped"),
      v.literal("archive")
    ),
    priority: v.union(
      v.literal("urgent"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low"),
      v.literal("none")
    ),
    labels: v.array(v.string()),
    order: v.number(),
    project: v.string(),
    updatedAt: v.optional(v.number()),
    assignee: v.optional(
      v.object({
        name: v.string(),
        avatar: v.string(),
      })
    ),
    source: v.optional(
      v.object({
        platform: v.union(
          v.literal("discord"),
          v.literal("slack"),
          v.literal("x"),
          v.literal("linear"),
          v.literal("github")
        ),
        url: v.string(),
        author: v.string(),
      })
    ),
    createdAtLabel: v.optional(v.string()),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          name: v.string(),
          type: v.string(),
          size: v.number(),
        })
      )
    ),
  }).index("by_workspace", ["workspaceId"]),
})
