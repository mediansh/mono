import { v } from "convex/values"
import { mutation, query, type MutationCtx } from "./_generated/server"
import { requireWorkspaceAccess, requireWorkspaceAdminAccess } from "./permissions"

const PAIRING_CODE_TTL_MS = 1000 * 60 * 10

function normalizePairingCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
}

function requireDiscordBotSecret(botSecret: string) {
  const configuredSecret = process.env.DISCORD_PAIRING_SECRET
  if (!configuredSecret || botSecret !== configuredSecret) {
    throw new Error("Invalid Discord bot secret")
  }
}

async function getActiveIntegrationForGuildChannel(
  ctx: Pick<MutationCtx, "db">,
  guildId: string,
  channelId: string
) {
  const integrations = await ctx.db
    .query("discordWorkspaceIntegrations")
    .withIndex("by_guild", (q) => q.eq("guildId", guildId))
    .collect()

  return (
    integrations.find((integration) => !integration.channelId || integration.channelId === channelId) ??
    null
  )
}

async function generateUniquePairingCode(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()
    const existing = await ctx.db
      .query("discordPairingCodes")
      .withIndex("by_code", (q) => q.eq("code", candidate))
      .unique()

    if (!existing) {
      return candidate
    }
  }

  throw new Error("Failed to generate a unique pairing code")
}

export const getWorkspaceDiscordIntegration = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireWorkspaceAccess(ctx, args.workspaceId)

    const integration = await ctx.db
      .query("discordWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()

    if (!integration) {
      return {
        canManage: membership.role === "admin" || membership.role === "owner",
        integration: null,
      }
    }

    return {
      canManage: membership.role === "admin" || membership.role === "owner",
      integration: {
        _id: integration._id,
        guildId: integration.guildId,
        guildName: integration.guildName,
        channelId: integration.channelId ?? null,
        pairedAt: integration.pairedAt,
      },
    }
  },
})

export const issuePairingCode = mutation({
  args: {
    botSecret: v.string(),
    guildId: v.string(),
    guildName: v.string(),
    channelId: v.optional(v.string()),
    issuedByDiscordUserId: v.string(),
    issuedByDiscordUsername: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireDiscordBotSecret(args.botSecret)

    const now = Date.now()
    const existingCodes = await ctx.db
      .query("discordPairingCodes")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .collect()

    await Promise.all(
      existingCodes
        .filter((code) => code.status === "pending" && code.expiresAt <= now)
        .map((code) => ctx.db.patch(code._id, { status: "expired" }))
    )

    const code = await generateUniquePairingCode(ctx)
    const expiresAt = now + PAIRING_CODE_TTL_MS

    await ctx.db.insert("discordPairingCodes", {
      code,
      guildId: args.guildId,
      guildName: args.guildName,
      channelId: args.channelId,
      issuedByDiscordUserId: args.issuedByDiscordUserId,
      issuedByDiscordUsername: args.issuedByDiscordUsername,
      status: "pending",
      expiresAt,
    })

    return {
      code,
      expiresAt,
    }
  },
})

export const recordInboundMessage = mutation({
  args: {
    botSecret: v.string(),
    guildId: v.string(),
    channelId: v.string(),
    messageId: v.string(),
    authorId: v.string(),
    authorUsername: v.string(),
    content: v.string(),
    messageCreatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    requireDiscordBotSecret(args.botSecret)

    const integration = await getActiveIntegrationForGuildChannel(ctx, args.guildId, args.channelId)
    if (!integration) {
      return {
        accepted: false,
        duplicate: false,
        integration: null,
      } as const
    }

    const existingMessage = await ctx.db
      .query("discordMessages")
      .withIndex("by_discord_message", (q) =>
        q.eq("guildId", args.guildId).eq("channelId", args.channelId).eq("messageId", args.messageId)
      )
      .unique()

    if (existingMessage) {
      return {
        accepted: false,
        duplicate: true,
        integration: {
          integrationId: integration._id,
          workspaceId: integration.workspaceId,
          channelId: integration.channelId ?? args.channelId,
          guildName: integration.guildName,
        },
      } as const
    }

    await ctx.db.insert("discordMessages", {
      workspaceId: integration.workspaceId,
      integrationId: integration._id,
      guildId: args.guildId,
      channelId: args.channelId,
      messageId: args.messageId,
      permalink: `https://discord.com/channels/${args.guildId}/${args.channelId}/${args.messageId}`,
      authorId: args.authorId,
      authorUsername: args.authorUsername,
      content: args.content,
      messageCreatedAt: args.messageCreatedAt,
      receivedAt: Date.now(),
    })

    return {
      accepted: true,
      duplicate: false,
      integration: {
        integrationId: integration._id,
        workspaceId: integration.workspaceId,
        channelId: integration.channelId ?? args.channelId,
        guildName: integration.guildName,
      },
    } as const
  },
})

export const getPendingFeedbackWindow = query({
  args: {
    botSecret: v.string(),
    integrationId: v.id("discordWorkspaceIntegrations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireDiscordBotSecret(args.botSecret)

    const integration = await ctx.db.get(args.integrationId)
    if (!integration) {
      throw new Error("Discord integration not found")
    }

    const workspace = await ctx.db.get(integration.workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    const messages = await ctx.db
      .query("discordMessages")
      .withIndex("by_integration_created_at", (q) => q.eq("integrationId", args.integrationId))
      .order("desc")
      .take(Math.min(args.limit ?? 100, 100))

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
        lastProcessedMessageCreatedAt: integration.lastProcessedMessageCreatedAt ?? null,
      },
      messages: messages.reverse().map((message) => ({
        _id: message._id,
        messageId: message.messageId,
        authorUsername: message.authorUsername,
        content: message.content,
        permalink: message.permalink,
        messageCreatedAt: message.messageCreatedAt,
      })),
    }
  },
})

export const markFeedbackWindowProcessed = mutation({
  args: {
    botSecret: v.string(),
    integrationId: v.id("discordWorkspaceIntegrations"),
    lastProcessedMessageId: v.string(),
    lastProcessedMessageCreatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    requireDiscordBotSecret(args.botSecret)

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

export const redeemPairingCode = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceAdminAccess(ctx, args.workspaceId)
    const code = normalizePairingCode(args.code)

    if (code.length < 6) {
      throw new Error("Enter a valid pairing code")
    }

    const pairingCode = await ctx.db
      .query("discordPairingCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique()

    if (!pairingCode) {
      throw new Error("That pairing code was not found")
    }

    if (pairingCode.status !== "pending") {
      throw new Error("That pairing code has already been used")
    }

    if (pairingCode.expiresAt <= Date.now()) {
      await ctx.db.patch(pairingCode._id, { status: "expired" })
      throw new Error("That pairing code has expired")
    }

    const [workspaceIntegrations, guildIntegrations] = await Promise.all([
      ctx.db
        .query("discordWorkspaceIntegrations")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect(),
      ctx.db
        .query("discordWorkspaceIntegrations")
        .withIndex("by_guild", (q) => q.eq("guildId", pairingCode.guildId))
        .collect(),
    ])

    const integrationIds = new Set([
      ...workspaceIntegrations.map((integration) => integration._id),
      ...guildIntegrations.map((integration) => integration._id),
    ])

    await Promise.all([...integrationIds].map((integrationId) => ctx.db.delete(integrationId)))

    const pairedAt = Date.now()

    const integrationId = await ctx.db.insert("discordWorkspaceIntegrations", {
      workspaceId: args.workspaceId,
      guildId: pairingCode.guildId,
      guildName: pairingCode.guildName,
      channelId: pairingCode.channelId,
      pairedByUserId: identity.subject,
      pairedAt,
      pairingCodeId: pairingCode._id,
    })

    await ctx.db.patch(pairingCode._id, {
      status: "paired",
      pairedWorkspaceId: args.workspaceId,
      pairedByUserId: identity.subject,
      pairedAt,
    })

    return {
      integrationId,
      guildName: pairingCode.guildName,
      guildId: pairingCode.guildId,
      pairedAt,
    }
  },
})

export const disconnectWorkspaceDiscordIntegration = mutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAdminAccess(ctx, args.workspaceId)

    const integrations = await ctx.db
      .query("discordWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()

    await Promise.all(integrations.map((integration) => ctx.db.delete(integration._id)))
  },
})
