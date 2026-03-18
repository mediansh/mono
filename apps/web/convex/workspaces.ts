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
        if (!workspace) return null
        const iconUrl = await ctx.storage.getUrl(workspace.iconId)
        return { ...workspace, iconUrl, role: m.role }
      })
    )

    return workspaces.filter(Boolean)
  },
})

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")
    return await ctx.storage.generateUploadUrl()
  },
})

export const createWorkspace = mutation({
  args: {
    name: v.string(),
    iconId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.name,
      iconId: args.iconId,
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
