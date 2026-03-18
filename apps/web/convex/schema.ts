import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  workspaces: defineTable({
    name: v.string(),
    iconId: v.id("_storage"),
    ownerId: v.string(),
  }).index("by_owner", ["ownerId"]),

  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_user_workspace", ["userId", "workspaceId"]),
})
