import { v } from "convex/values"
import {
  internalQuery,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import { requireIdentity } from "./permissions"

type ConvexCtx = QueryCtx | MutationCtx

export async function isAdmin(
  ctx: ConvexCtx,
  userId: string
): Promise<boolean> {
  const row = await ctx.db
    .query("admins")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique()
  return row !== null
}

export async function requireAdmin(ctx: ConvexCtx) {
  const identity = await requireIdentity(ctx)
  const admin = await isAdmin(ctx, identity.subject)
  if (!admin) {
    throw new Error("Admin access required")
  }
  return identity
}

export const isCurrentUserAdmin = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return false
    return await isAdmin(ctx, identity.subject)
  },
})

export const listAdmins = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)
    const rows = await ctx.db.query("admins").collect()
    return rows.sort((a, b) => b.addedAt - a.addedAt)
  },
})

export const addAdmin = mutation({
  args: {
    userId: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx)

    const existing = await ctx.db
      .query("admins")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique()
    if (existing) return existing._id

    return await ctx.db.insert("admins", {
      userId: args.userId,
      addedAt: Date.now(),
      addedByUserId: identity.subject,
      note: args.note,
    })
  },
})

export const removeAdmin = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx)
    if (args.userId === identity.subject) {
      throw new Error("You cannot remove yourself from admins")
    }

    const row = await ctx.db
      .query("admins")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique()
    if (row) {
      await ctx.db.delete(row._id)
    }
  },
})

/**
 * Bootstrap / seed the first admin.
 *
 * Run via Convex CLI — cannot be called from the client:
 *
 *     npx convex run admins:seedAdmin '{"userId":"user_xxx"}'
 *
 * The Clerk user ID can be found in the Clerk dashboard (Users → select user
 * → copy the "User ID" field that starts with `user_`).
 */
export const seedAdmin = internalMutation({
  args: {
    userId: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("admins")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique()
    if (existing) return existing._id

    return await ctx.db.insert("admins", {
      userId: args.userId,
      addedAt: Date.now(),
      note: args.note ?? "Seeded via CLI",
    })
  },
})

export const requireAdminIdentity = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await requireAdmin(ctx)
  },
})
