import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import { feedbackImageAttachmentValidator } from "./feedbackAttachments"

const BENCHMARK_SUITE_IDS = v.union(
  v.literal("discordScan"),
  v.literal("feedbackExtract"),
  v.literal("taskGen")
)

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
    disableOveragesWhenExhausted: v.optional(v.boolean()),
    hasActivePlan: v.optional(v.boolean()),
    currentPlanId: v.optional(v.string()),
    planStatusCheckedAt: v.optional(v.number()),
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

  slackOAuthStates: defineTable({
    workspaceId: v.id("workspaces"),
    initiatedByUserId: v.string(),
    state: v.string(),
    redirectUrl: v.string(),
    expiresAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_state", ["state"])
    .index("by_workspace", ["workspaceId"]),

  slackWorkspaceIntegrations: defineTable({
    workspaceId: v.id("workspaces"),
    teamId: v.string(),
    teamName: v.string(),
    botUserId: v.string(),
    accessTokenEncrypted: v.string(),
    connectedAt: v.number(),
    connectedByUserId: v.string(),
    feedbackCollectionEnabled: v.optional(v.boolean()),
    feedbackChannelId: v.optional(v.string()),
    notificationChannelId: v.optional(v.string()),
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
    feedbackIgnoredChannelIds: v.optional(v.array(v.string())),
    teamChannels: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          isPrivate: v.boolean(),
        })
      )
    ),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_team", ["teamId"]),

  slackMessages: defineTable({
    workspaceId: v.id("workspaces"),
    integrationId: v.id("slackWorkspaceIntegrations"),
    teamId: v.string(),
    channelId: v.string(),
    channelName: v.optional(v.string()),
    threadTs: v.optional(v.string()),
    messageTs: v.string(),
    permalink: v.optional(v.string()),
    authorId: v.string(),
    authorUsername: v.string(),
    content: v.string(),
    imageAttachments: v.optional(v.array(feedbackImageAttachmentValidator)),
    messageCreatedAt: v.number(),
    receivedAt: v.number(),
  })
    .index("by_slack_message", ["teamId", "channelId", "messageTs"])
    .index("by_integration_created_at", ["integrationId", "messageCreatedAt"])
    .index("by_workspace_channel_created_at", [
      "workspaceId",
      "channelId",
      "messageCreatedAt",
    ]),

  slackPendingNotifications: defineTable({
    workspaceId: v.id("workspaces"),
    integrationId: v.id("slackWorkspaceIntegrations"),
    taskId: v.id("tasks"),
    type: v.union(
      v.literal("request_received"),
      v.literal("request_shipped"),
      v.literal("feature_request")
    ),
    channelId: v.string(),
    threadTs: v.optional(v.string()),
    taskTitle: v.string(),
    taskCode: v.string(),
    taskDescription: v.optional(v.string()),
    taskPriority: v.optional(v.string()),
    taskLabels: v.optional(v.array(v.string())),
    sourceAuthor: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("failed")
    ),
    createdAt: v.number(),
    sendingStartedAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    slackMessageTs: v.optional(v.string()),
  })
    .index("by_integration_status", ["integrationId", "status"])
    .index("by_status", ["status"])
    .index("by_task", ["taskId"])
    .index("by_workspace", ["workspaceId"]),

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
    feedbackIgnoredChannelIds: v.optional(v.array(v.string())),
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

  linearCommentLinks: defineTable({
    workspaceId: v.id("workspaces"),
    taskId: v.id("tasks"),
    taskCommentId: v.id("taskComments"),
    linearIssueId: v.string(),
    linearCommentId: v.string(),
    lastLinearUpdatedAt: v.optional(v.string()),
    lastSyncedAt: v.number(),
  })
    .index("by_task", ["taskId"])
    .index("by_task_comment", ["taskCommentId"])
    .index("by_linear_comment", ["linearCommentId"])
    .index("by_linear_issue", ["linearIssueId"]),

  linearWebhookDeliveries: defineTable({
    deliveryId: v.string(),
    integrationId: v.id("linearWorkspaceIntegrations"),
    eventType: v.string(),
    receivedAt: v.number(),
  })
    .index("by_delivery", ["deliveryId"])
    .index("by_integration", ["integrationId"]),

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
    issueSyncEnabled: v.optional(v.boolean()),
    prAutomationEnabled: v.optional(v.boolean()),
    commitAutomationEnabled: v.optional(v.boolean()),
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
    imageAttachments: v.optional(v.array(feedbackImageAttachmentValidator)),
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
    channelName: v.optional(v.string()),
    parentChannelId: v.optional(v.string()),
    parentChannelName: v.optional(v.string()),
    threadId: v.optional(v.string()),
    threadTitle: v.optional(v.string()),
    forumChannelId: v.optional(v.string()),
    forumTitle: v.optional(v.string()),
    messageId: v.string(),
    permalink: v.string(),
    authorId: v.string(),
    authorUsername: v.string(),
    authorHasAdminPrivileges: v.optional(v.boolean()),
    content: v.string(),
    imageAttachments: v.optional(v.array(feedbackImageAttachmentValidator)),
    messageCreatedAt: v.number(),
    receivedAt: v.number(),
  })
    .index("by_discord_message", ["guildId", "channelId", "messageId"])
    .index("by_integration_discord_message", [
      "integrationId",
      "guildId",
      "channelId",
      "messageId",
    ])
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
    .index("by_task", ["taskId"])
    .index("by_workspace", ["workspaceId"]),

  cliApiKeys: defineTable({
    workspaceId: v.id("workspaces"),
    keyHash: v.string(),
    keyPrefix: v.string(),
    label: v.string(),
    createdByUserId: v.string(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_key_hash", ["keyHash"])
    .index("by_created_by", ["createdByUserId"]),

  apiFeedbackRequests: defineTable({
    workspaceId: v.id("workspaces"),
    apiKeyId: v.id("cliApiKeys"),
    content: v.string(),
    author: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    metadata: v.optional(v.any()),
    classify: v.boolean(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("rejected_not_feedback")
    ),
    createdTaskIds: v.optional(v.array(v.id("tasks"))),
    updatedTaskIds: v.optional(v.array(v.id("tasks"))),
    errorMessage: v.optional(v.string()),
    receivedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_received", ["workspaceId", "receivedAt"])
    .index("by_status", ["status"]),

  workspaceLogs: defineTable({
    workspaceId: v.id("workspaces"),
    category: v.union(
      v.literal("tasks"),
      v.literal("webhooks"),
      v.literal("integrations"),
      v.literal("members")
    ),
    type: v.union(
      v.literal("task_created"),
      v.literal("task_moved"),
      v.literal("task_updated"),
      v.literal("task_deleted"),
      v.literal("tasks_generated_ai"),
      v.literal("request_accepted"),
      v.literal("request_denied"),
      v.literal("integration_connected"),
      v.literal("integration_disconnected"),
      v.literal("webhook_received"),
      v.literal("webhook_error"),
      v.literal("member_joined"),
      v.literal("member_removed"),
      v.literal("labels_saved"),
      v.literal("feedback_processed")
    ),
    message: v.string(),
    source: v.optional(
      v.union(
        v.literal("discord"),
        v.literal("slack"),
        v.literal("github"),
        v.literal("linear"),
        v.literal("x"),
        v.literal("cli"),
        v.literal("api"),
        v.literal("manual"),
        v.literal("ai")
      )
    ),
    cost: v.optional(v.number()),
    timestamp: v.number(),
  })
    .index("by_workspace_timestamp", ["workspaceId", "timestamp"])
    .index("by_workspace_category_timestamp", [
      "workspaceId",
      "category",
      "timestamp",
    ]),

  workspaceLogMetrics: defineTable({
    workspaceId: v.id("workspaces"),
    totalCount: v.number(),
    taskCount: v.number(),
    webhookCount: v.number(),
    integrationCount: v.number(),
    memberCount: v.number(),
  }).index("by_workspace", ["workspaceId"]),

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
    assignees: v.optional(
      v.array(
        v.object({
          userId: v.string(),
          name: v.string(),
          imageUrl: v.optional(v.string()),
        })
      )
    ),
    source: v.optional(
      v.object({
        platform: v.union(
          v.literal("discord"),
          v.literal("slack"),
          v.literal("x"),
          v.literal("linear"),
          v.literal("github"),
          v.literal("cli"),
          v.literal("api")
        ),
        url: v.string(),
        author: v.string(),
      })
    ),
    sources: v.optional(
      v.array(
        v.object({
          platform: v.union(
            v.literal("discord"),
            v.literal("slack"),
            v.literal("x"),
            v.literal("linear"),
            v.literal("github"),
            v.literal("cli"),
            v.literal("api")
          ),
          url: v.string(),
          author: v.string(),
        })
      )
    ),
    createdAtLabel: v.optional(v.string()),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          name: v.string(),
          type: v.string(),
          size: v.number(),
          width: v.optional(v.number()),
          height: v.optional(v.number()),
          displayWidth: v.optional(v.number()),
        })
      )
    ),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_status_order", ["workspaceId", "status", "order"]),

  waitlistEntries: defineTable({
    email: v.string(),
    joinedAt: v.number(),
  }).index("by_email", ["email"]),

  admins: defineTable({
    userId: v.string(),
    addedAt: v.number(),
    addedByUserId: v.optional(v.string()),
    note: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  earlyAccessCodes: defineTable({
    code: v.string(),
    createdByUserId: v.string(),
    createdAt: v.number(),
    note: v.optional(v.string()),
    redeemedByUserId: v.optional(v.string()),
    redeemedAt: v.optional(v.number()),
    voidedAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_redeemed_by", ["redeemedByUserId"]),

  earlyAccessRedemptions: defineTable({
    userId: v.string(),
    codeId: v.id("earlyAccessCodes"),
    code: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    redeemedAt: v.number(),
    workspaceId: v.optional(v.id("workspaces")),
    scaleAttachedAt: v.optional(v.number()),
    scaleRemovedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"]),

  appSettings: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),

  blogPosts: defineTable({
    slug: v.string(),
    title: v.string(),
    excerpt: v.optional(v.string()),
    // TipTap JSON document, stringified
    content: v.string(),
    coverImageUrl: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("published")),
    publishedAt: v.optional(v.number()),
    authorId: v.string(),
    authorName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_updated", ["updatedAt"]),

  changelogEntries: defineTable({
    slug: v.string(),
    title: v.string(),
    excerpt: v.optional(v.string()),
    content: v.string(),
    version: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("published")),
    publishedAt: v.optional(v.number()),
    authorId: v.string(),
    authorName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_updated", ["updatedAt"]),

  moduleRuns: defineTable({
    module: v.string(),
    operation: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("failure"),
      v.literal("skipped")
    ),
    durationMs: v.optional(v.number()),
    error: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    metadata: v.optional(
      v.object({
        integrationId: v.optional(v.string()),
        itemsProcessed: v.optional(v.number()),
        itemsSkipped: v.optional(v.number()),
        reason: v.optional(v.string()),
      })
    ),
    startedAt: v.number(),
    finishedAt: v.number(),
  })
    .index("by_module_finished", ["module", "finishedAt"])
    .index("by_module_status_finished", ["module", "status", "finishedAt"])
    .index("by_status_finished", ["status", "finishedAt"])
    .index("by_finished", ["finishedAt"]),

  benchmarkModels: defineTable({
    slug: v.string(),
    provider: v.optional(v.string()),
    createdAt: v.number(),
    createdBy: v.string(),
  }).index("by_slug", ["slug"]),

  benchmarkSuiteRuns: defineTable({
    status: v.union(
      v.literal("running"),
      v.literal("complete"),
      v.literal("failed")
    ),
    triggeredBy: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    expectedRunCount: v.number(),
    completedRunCount: v.number(),
    models: v.array(
      v.object({
        slug: v.string(),
        provider: v.optional(v.string()),
      })
    ),
    suites: v.array(BENCHMARK_SUITE_IDS),
  }).index("by_started", ["startedAt"]),

  benchmarkRuns: defineTable({
    suiteRunId: v.id("benchmarkSuiteRuns"),
    modelSlug: v.string(),
    provider: v.optional(v.string()),
    suite: v.union(
      v.literal("discordScan"),
      v.literal("feedbackExtract"),
      v.literal("taskGen")
    ),
    fixtureId: v.string(),
    fixtureLabel: v.string(),
    systemPrompt: v.string(),
    userPrompt: v.string(),
    rawOutput: v.optional(v.string()),
    parsed: v.optional(v.any()),
    schemaValid: v.boolean(),
    parseError: v.optional(v.string()),
    ttftMs: v.optional(v.number()),
    totalMs: v.number(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    tps: v.optional(v.number()),
    expected: v.optional(v.any()),
    correct: v.optional(v.boolean()),
    qualityScore: v.number(),
    scoreBreakdown: v.optional(v.any()),
    status: v.union(v.literal("ok"), v.literal("error")),
    errorMessage: v.optional(v.string()),
  })
    .index("by_suiteRun", ["suiteRunId"])
    .index("by_suiteRun_model", ["suiteRunId", "modelSlug"])
    .index("by_suiteRun_model_suite_fixture", [
      "suiteRunId",
      "modelSlug",
      "suite",
      "fixtureId",
    ])
    .index("by_suiteRun_suite", ["suiteRunId", "suite"]),

  taskComments: defineTable({
    workspaceId: v.id("workspaces"),
    taskId: v.id("tasks"),
    authorId: v.string(),
    authorName: v.optional(v.string()),
    authorImageUrl: v.optional(v.string()),
    bodyMarkdown: v.string(),
    mentionedUserIds: v.optional(v.array(v.string())),
    reactions: v.optional(
      v.array(
        v.object({
          userId: v.string(),
          emoji: v.string(),
        })
      )
    ),
    createdAt: v.number(),
    editedAt: v.optional(v.number()),
  })
    .index("by_task_created", ["taskId", "createdAt"])
    .index("by_workspace", ["workspaceId"]),

  taskCommentMentions: defineTable({
    workspaceId: v.id("workspaces"),
    taskId: v.id("tasks"),
    commentId: v.id("taskComments"),
    userId: v.string(),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
  })
    .index("by_user_task", ["userId", "taskId"])
    .index("by_user_workspace_read", ["userId", "workspaceId", "readAt"])
    .index("by_comment", ["commentId"]),

  deletedTaskSources: defineTable({
    workspaceId: v.id("workspaces"),
    platform: v.union(
      v.literal("discord"),
      v.literal("slack"),
      v.literal("x"),
      v.literal("linear"),
      v.literal("github"),
      v.literal("cli"),
      v.literal("api")
    ),
    sourceUrl: v.string(),
    titleFingerprint: v.string(),
    deletedAt: v.number(),
  })
    .index("by_workspace_source", ["workspaceId", "platform", "sourceUrl"])
    .index("by_workspace_source_title", [
      "workspaceId",
      "platform",
      "sourceUrl",
      "titleFingerprint",
    ]),
})
