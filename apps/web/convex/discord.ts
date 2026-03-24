import { v } from "convex/values"
import { mutation, query, type MutationCtx } from "./_generated/server"
import { requireWorkspaceAccess, requireWorkspaceAdminAccess } from "./permissions"

const PAIRING_CODE_TTL_MS = 1000 * 60 * 10

function normalizePairingCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
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
    const configuredSecret = process.env.DISCORD_PAIRING_SECRET
    if (!configuredSecret || args.botSecret !== configuredSecret) {
      throw new Error("Invalid Discord bot secret")
    }

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
