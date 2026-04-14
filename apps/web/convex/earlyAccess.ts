import { v } from "convex/values"
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server"
import { internal } from "./_generated/api"
import { requireIdentity, getIdentityProfile } from "./permissions"
import { requireAdmin } from "./admins"
import {
  attachComplimentaryWorkspacePlan,
  cancelWorkspacePlan,
} from "../lib/billing/autumn"

const EARLY_ACCESS_ENABLED_KEY = "earlyAccess.enabled"
const EARLY_ACCESS_PLAN_ID = "scale"

function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let out = ""
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
}

export const isEnabled = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", EARLY_ACCESS_ENABLED_KEY))
      .unique()
    return row?.value === "true"
  },
})

export const currentUserRedemption = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const redemption = await ctx.db
      .query("earlyAccessRedemptions")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .unique()
    return redemption
  },
})

export const redeemCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const profile = getIdentityProfile(identity)
    const normalized = normalizeCode(args.code)

    const existing = await ctx.db
      .query("earlyAccessRedemptions")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .unique()
    if (existing) {
      return { redemptionId: existing._id, alreadyRedeemed: true }
    }

    const codeRow = await ctx.db
      .query("earlyAccessCodes")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .unique()
    if (!codeRow) {
      throw new Error("Invalid early access code")
    }
    if (codeRow.redeemedByUserId) {
      throw new Error("This code has already been used")
    }

    const now = Date.now()
    await ctx.db.patch(codeRow._id, {
      redeemedByUserId: identity.subject,
      redeemedAt: now,
    })
    const redemptionId = await ctx.db.insert("earlyAccessRedemptions", {
      userId: identity.subject,
      codeId: codeRow._id,
      code: normalized,
      email: profile.email,
      name: profile.name,
      redeemedAt: now,
    })
    return { redemptionId, alreadyRedeemed: false }
  },
})

export const attachScaleForCurrentUser = action({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const redemption = await ctx.runQuery(
      internal.earlyAccess.getRedemptionForCurrentUser,
      {}
    )
    if (!redemption) return { attached: false }
    if (redemption.scaleAttachedAt && !redemption.scaleRemovedAt) {
      return { attached: true, alreadyAttached: true }
    }

    const workspace = await ctx.runQuery(
      internal.earlyAccess.getWorkspaceForAttach,
      { workspaceId: args.workspaceId, userId: redemption.userId }
    )
    if (!workspace) {
      throw new Error("Workspace not found or not owned by user")
    }

    await attachComplimentaryWorkspacePlan({
      workspaceId: args.workspaceId,
      workspaceName: workspace.name,
      email: redemption.email ?? null,
      planId: EARLY_ACCESS_PLAN_ID,
    })

    await ctx.runMutation(internal.earlyAccess.markScaleAttached, {
      redemptionId: redemption._id,
      workspaceId: args.workspaceId,
    })

    return { attached: true }
  },
})

export const getRedemptionForCurrentUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    return await ctx.db
      .query("earlyAccessRedemptions")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .unique()
  },
})

export const getWorkspaceForAttach = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const ws = await ctx.db.get(args.workspaceId)
    if (!ws || ws.ownerId !== args.userId) return null
    return ws
  },
})

export const markScaleAttached = internalMutation({
  args: {
    redemptionId: v.id("earlyAccessRedemptions"),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.redemptionId, {
      workspaceId: args.workspaceId,
      scaleAttachedAt: Date.now(),
      scaleRemovedAt: undefined,
    })
  },
})

export const markScaleRemoved = internalMutation({
  args: { redemptionId: v.id("earlyAccessRedemptions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.redemptionId, {
      scaleRemovedAt: Date.now(),
    })
  },
})

// ---------- Admin ----------

export const adminListCodes = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)
    const rows = await ctx.db.query("earlyAccessCodes").collect()
    return rows.sort((a, b) => b.createdAt - a.createdAt)
  },
})

export const adminListRedemptions = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)
    const rows = await ctx.db.query("earlyAccessRedemptions").collect()
    return rows.sort((a, b) => b.redeemedAt - a.redeemedAt)
  },
})

export const adminCreateCode = mutation({
  args: { note: v.optional(v.string()), count: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx)
    const count = Math.max(1, Math.min(args.count ?? 1, 50))
    const ids: string[] = []
    for (let i = 0; i < count; i++) {
      let code = generateCode()
      // Avoid (extremely unlikely) collision
      for (let attempt = 0; attempt < 5; attempt++) {
        const collision = await ctx.db
          .query("earlyAccessCodes")
          .withIndex("by_code", (q) => q.eq("code", code))
          .unique()
        if (!collision) break
        code = generateCode()
      }
      await ctx.db.insert("earlyAccessCodes", {
        code,
        createdByUserId: identity.subject,
        createdAt: Date.now(),
        note: args.note,
      })
      ids.push(code)
    }
    return ids
  },
})

export const adminDeleteCode = mutation({
  args: { codeId: v.id("earlyAccessCodes") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const row = await ctx.db.get(args.codeId)
    if (!row) return
    if (row.redeemedByUserId) {
      throw new Error("Cannot delete a redeemed code")
    }
    await ctx.db.delete(args.codeId)
  },
})

export const adminSetEnabled = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const row = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", EARLY_ACCESS_ENABLED_KEY))
      .unique()
    const value = args.enabled ? "true" : "false"
    if (row) {
      await ctx.db.patch(row._id, { value })
    } else {
      await ctx.db.insert("appSettings", {
        key: EARLY_ACCESS_ENABLED_KEY,
        value,
      })
    }
  },
})

export const adminRemoveScalePlan = action({
  args: { redemptionId: v.id("earlyAccessRedemptions") },
  handler: async (ctx, args) => {
    const redemption = await ctx.runQuery(
      internal.earlyAccess.adminGetRedemption,
      { redemptionId: args.redemptionId }
    )
    if (!redemption) throw new Error("Redemption not found")
    if (!redemption.workspaceId || !redemption.scaleAttachedAt) {
      throw new Error("No Scale plan is attached for this user")
    }
    if (redemption.scaleRemovedAt) {
      return { removed: true, alreadyRemoved: true }
    }

    await cancelWorkspacePlan({
      workspaceId: redemption.workspaceId,
      planId: EARLY_ACCESS_PLAN_ID,
    })

    await ctx.runMutation(internal.earlyAccess.markScaleRemoved, {
      redemptionId: redemption._id,
    })
    return { removed: true }
  },
})

export const adminGetRedemption = internalQuery({
  args: { redemptionId: v.id("earlyAccessRedemptions") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const row = await ctx.db.get(args.redemptionId)
    return row
  },
})
