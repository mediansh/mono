import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const getUserWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect()

    const workspaces = await Promise.all(
      memberships.map(async (m) => {
        const workspace = await ctx.db.get(m.workspaceId)
        return workspace ? { ...workspace, role: m.role } : null
      })
    )

    return workspaces.filter(Boolean)
  },
})

export const createWorkspace = mutation({
  args: {
    name: v.string(),
    icon: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.name,
      icon: args.icon,
      ownerId: identity.subject,
    })

    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: identity.subject,
      role: "owner",
    })

    return workspaceId
  },
})
