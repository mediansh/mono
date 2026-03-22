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

export const updateWorkspace = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.optional(v.string()),
    iconId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) throw new Error("Workspace not found")
    if (workspace.ownerId !== identity.subject) throw new Error("Not authorized")

    const updates: Record<string, unknown> = {}
    if (args.name !== undefined) updates.name = args.name
    if (args.iconId !== undefined) {
      // Delete old icon from storage
      await ctx.storage.delete(workspace.iconId)
      updates.iconId = args.iconId
    }

    await ctx.db.patch(args.workspaceId, updates)
  },
})

export const deleteWorkspace = mutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) throw new Error("Workspace not found")
    if (workspace.ownerId !== identity.subject) throw new Error("Not authorized")

    // Delete all members
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()

    for (const member of members) {
      await ctx.db.delete(member._id)
    }

    // Delete icon from storage
    await ctx.storage.delete(workspace.iconId)

    // Delete workspace
    await ctx.db.delete(args.workspaceId)
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
      taskCounter: 0,
    })

    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: identity.subject,
      role: "owner",
    })

    return workspaceId
  },
})
