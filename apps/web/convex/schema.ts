import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  workspaces: defineTable({
    name: v.string(),
    prefix: v.optional(v.string()),
    iconId: v.optional(v.id("_storage")),
    ownerId: v.string(),
    taskCounter: v.optional(v.number()),
    labels: v.optional(
      v.array(
        v.object({
          name: v.string(),
          color: v.string(),
        })
      )
    ),
  }).index("by_owner", ["ownerId"]),

  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_user_workspace", ["userId", "workspaceId"]),

  tasks: defineTable({
    workspaceId: v.id("workspaces"),
    taskCode: v.string(),
    taskNumber: v.number(),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("requests"),
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("ready"),
      v.literal("shipped"),
      v.literal("archive")
    ),
    priority: v.union(
      v.literal("urgent"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low"),
      v.literal("none")
    ),
    labels: v.array(v.string()),
    order: v.number(),
    project: v.string(),
    assignee: v.optional(
      v.object({
        name: v.string(),
        avatar: v.string(),
      })
    ),
    source: v.optional(
      v.object({
        platform: v.union(v.literal("discord"), v.literal("slack"), v.literal("x")),
        url: v.string(),
        author: v.string(),
      })
    ),
    createdAtLabel: v.optional(v.string()),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          name: v.string(),
          type: v.string(),
          size: v.number(),
        })
      )
    ),
  }).index("by_workspace", ["workspaceId"]),
})
