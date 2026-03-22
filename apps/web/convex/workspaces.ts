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
        const iconUrl = workspace.iconId ? await ctx.storage.getUrl(workspace.iconId) : null
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

export const updateWorkspaceLabels = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    labels: v.array(
      v.object({
        name: v.string(),
        color: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) throw new Error("Workspace not found")
    if (workspace.ownerId !== identity.subject) throw new Error("Not authorized")

    await ctx.db.patch(args.workspaceId, { labels: args.labels })
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
      if (workspace.iconId) {
        await ctx.storage.delete(workspace.iconId)
      }
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
    if (workspace.iconId) {
      await ctx.storage.delete(workspace.iconId)
    }

    // Delete workspace
    await ctx.db.delete(args.workspaceId)
  },
})

function generatePrefix(name: string): string {
  const cleaned = name.trim().toUpperCase()
  const words = cleaned.split(/\s+/).filter(Boolean)

  if (words.length >= 3) {
    // Take first letter of first 3 words: "My Cool App" → "MCA"
    return words.slice(0, 3).map((w) => w[0]).join("")
  }
  if (words.length === 2) {
    // First letter of each word: "Cool App" → "CA"
    // But if that's only 2 chars, take first 2 of first word + first of second
    const twoChar = words.map((w) => w[0]).join("")
    if (twoChar.length >= 3) return twoChar.slice(0, 3)
    return (words[0]!.slice(0, 2) + words[1]![0]!).slice(0, 3)
  }
  // Single word: take first 3 consonants, fallback to first 3 chars
  const consonants = cleaned.replace(/[^A-Z]/g, "").replace(/[AEIOU]/g, "")
  if (consonants.length >= 3) return consonants.slice(0, 3)
  return cleaned.replace(/[^A-Z0-9]/g, "").slice(0, 3) || "TSK"
}

export const createWorkspace = mutation({
  args: {
    name: v.string(),
    iconId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const prefix = generatePrefix(args.name)

    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.name,
      prefix,
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
