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
          v.literal("linear")
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
