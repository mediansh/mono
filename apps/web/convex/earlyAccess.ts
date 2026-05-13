import { v } from "convex/values"
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server"
import { internal } from "./_generated/api"
import {
  getAuthUserId,
  getAuthUserIds,
  requireIdentity,
  getIdentityProfile,
} from "./permissions"
import { requireAdmin } from "./admins"
import {
  attachComplimentaryWorkspacePlan,
  cancelWorkspacePlan,
} from "../lib/billing/autumn"

const EARLY_ACCESS_ENABLED_KEY = "earlyAccess.enabled"
const EARLY_ACCESS_PLAN_ID = "scale"

function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  // Use a cryptographic RNG so codes are not predictable from observed
  // outputs. Reject-sample to keep the distribution uniform across the
  // 32-character alphabet.
  const bytes = new Uint8Array(8)
  let out = ""
  while (out.length < 8) {
    crypto.getRandomValues(bytes)
    for (const byte of bytes) {
      // 256 is divisible by 32, so masking gives a uniform distribution.
      out += alphabet[byte & 0x1f]
      if (out.length >= 8) break
    }
  }
  return out
}

function normalizeCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
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

    for (const userId of getAuthUserIds(identity)) {
      const redemption = await ctx.db
        .query("earlyAccessRedemptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first()
      if (redemption) return redemption
    }

    return null
  },
})

export const redeemCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const userId = getAuthUserId(identity)
    const profile = getIdentityProfile(identity)
    const normalized = normalizeCode(args.code)

    for (const authUserId of getAuthUserIds(identity)) {
      const existing = await ctx.db
        .query("earlyAccessRedemptions")
        .withIndex("by_user", (q) => q.eq("userId", authUserId))
        .first()
      if (existing) {
        return { redemptionId: existing._id, alreadyRedeemed: true }
      }
    }

    const codeRow = await ctx.db
      .query("earlyAccessCodes")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .unique()
    if (!codeRow || codeRow.voidedAt) {
      throw new Error("Invalid early access code")
    }
    if (codeRow.redeemedByUserId) {
      throw new Error("This code has already been used")
    }

    const now = Date.now()
    await ctx.db.patch(codeRow._id, {
      redeemedByUserId: userId,
      redeemedAt: now,
    })
    const redemptionId = await ctx.db.insert("earlyAccessRedemptions", {
      userId,
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
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return { attached: false }

    const redemption = await ctx.runQuery(
      internal.earlyAccess.getRedemptionForCurrentUser,
      {}
    )
    if (!redemption) return { attached: false }
    if (redemption.scaleAttachedAt && !redemption.scaleRemovedAt) {
      return { attached: true, alreadyAttached: true }
    }
    // Once an admin removes the complimentary Scale plan, the user must not
    // be able to silently re-attach it through the normal user-facing flow.
    if (redemption.scaleRemovedAt) {
      return { attached: false, adminRemoved: true }
    }

    const code = await ctx.runQuery(internal.earlyAccess.getCodeForRedemption, {
      codeId: redemption.codeId,
    })
    if (!code || code.voidedAt) {
      return { attached: false, voided: true }
    }

    const workspace = await ctx.runQuery(
      internal.earlyAccess.getWorkspaceForAttach,
      { workspaceId: args.workspaceId, userIds: getAuthUserIds(identity) }
    )
    if (!workspace) {
      throw new Error("Workspace not found or not owned by user")
    }

    // Atomically claim the redemption before any external billing call so
    // concurrent invocations can't each attach a complimentary Scale plan.
    const claim = await ctx.runMutation(
      internal.earlyAccess.claimScaleAttach,
      {
        redemptionId: redemption._id,
        workspaceId: args.workspaceId,
      }
    )
    if (!claim.ok) {
      if (claim.reason === "alreadyAttached") {
        return { attached: true, alreadyAttached: true }
      }
      return { attached: false, claimContended: true }
    }

    try {
      await attachComplimentaryWorkspacePlan({
        workspaceId: args.workspaceId,
        workspaceName: workspace.name,
        email: redemption.email ?? null,
        planId: EARLY_ACCESS_PLAN_ID,
      })
    } catch (err) {
      // Release the claim so a follow-up retry can succeed.
      await ctx.runMutation(internal.earlyAccess.releaseScaleAttachClaim, {
        redemptionId: redemption._id,
      })
      throw err
    }

    await ctx.runMutation(internal.earlyAccess.markScaleAttached, {
      redemptionId: redemption._id,
      workspaceId: args.workspaceId,
    })

    return { attached: true }
  },
})

export const claimScaleAttach = internalMutation({
  args: {
    redemptionId: v.id("earlyAccessRedemptions"),
    workspaceId: v.id("workspaces"),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const row = await ctx.db.get(args.redemptionId)
    if (!row) return { ok: false, reason: "missing" }
    if (row.scaleAttachedAt && !row.scaleRemovedAt) {
      return { ok: false, reason: "alreadyAttached" }
    }
    if (row.scaleRemovedAt) {
      return { ok: false, reason: "adminRemoved" }
    }
    // Allow re-claiming if a previous claim is stale (>5 min) or matches.
    const now = Date.now()
    const STALE_MS = 5 * 60 * 1000
    if (
      row.scaleAttachClaimedAt &&
      now - row.scaleAttachClaimedAt < STALE_MS &&
      row.scaleAttachClaimWorkspaceId !== args.workspaceId
    ) {
      return { ok: false, reason: "claimed" }
    }
    await ctx.db.patch(args.redemptionId, {
      scaleAttachClaimedAt: now,
      scaleAttachClaimWorkspaceId: args.workspaceId,
    })
    return { ok: true }
  },
})

export const releaseScaleAttachClaim = internalMutation({
  args: { redemptionId: v.id("earlyAccessRedemptions") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.redemptionId)
    if (!row || row.scaleAttachedAt) return
    await ctx.db.patch(args.redemptionId, {
      scaleAttachClaimedAt: undefined,
      scaleAttachClaimWorkspaceId: undefined,
    })
  },
})

export const getRedemptionForCurrentUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    for (const userId of getAuthUserIds(identity)) {
      const redemption = await ctx.db
        .query("earlyAccessRedemptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first()
      if (redemption) return redemption
    }

    return null
  },
})

export const getCodeForRedemption = internalQuery({
  args: { codeId: v.id("earlyAccessCodes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.codeId)
  },
})

export const getWorkspaceForAttach = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    userIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const ws = await ctx.db.get(args.workspaceId)
    if (!ws || !args.userIds.includes(ws.ownerId)) return null
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
    const userId = getAuthUserId(identity)
    const count = Math.max(1, Math.min(args.count ?? 1, 50))
    const ids: string[] = []
    for (let i = 0; i < count; i++) {
      let code = generateCode()
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
        createdByUserId: userId,
        createdAt: Date.now(),
        note: args.note,
      })
      ids.push(code)
    }
    return ids
  },
})

export const adminVoidCode = mutation({
  args: { codeId: v.id("earlyAccessCodes") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const row = await ctx.db.get(args.codeId)
    if (!row || row.voidedAt) return
    await ctx.db.patch(args.codeId, {
      voidedAt: Date.now(),
    })
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
