import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { internal } from "./_generated/api"
import {
  getIdentityProfile,
  requireTaskWriteAccess,
  requireWorkspaceAccess,
} from "./permissions"

const REACTION_EMOJI = "+1"

async function queueLinearSync(ctx: MutationCtx, taskId: Id<"tasks">) {
  await ctx.scheduler.runAfter(0, internal.linear.syncTaskToLinearIssue, {
    taskId,
  })
}

export type TaskCommentDTO = {
  _id: Id<"taskComments">
  taskId: Id<"tasks">
  workspaceId: Id<"workspaces">
  authorId: string
  authorName: string | null
  authorImageUrl: string | null
  bodyMarkdown: string
  mentionedUserIds: string[]
  reactions: { userId: string; emoji: string }[]
  createdAt: number
  editedAt: number | null
}

async function loadWorkspaceMemberIds(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">
): Promise<Set<string>> {
  const members = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect()
  return new Set(members.map((m) => m.userId))
}

export const listByTask = query({
  args: {
    workspaceId: v.id("workspaces"),
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args): Promise<TaskCommentDTO[]> => {
    await requireWorkspaceAccess(ctx, args.workspaceId)
    const comments = await ctx.db
      .query("taskComments")
      .withIndex("by_task_created", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect()
    return comments.map((c) => ({
      _id: c._id,
      taskId: c.taskId,
      workspaceId: c.workspaceId,
      authorId: c.authorId,
      authorName: c.authorName ?? null,
      authorImageUrl: c.authorImageUrl ?? null,
      bodyMarkdown: c.bodyMarkdown,
      mentionedUserIds: c.mentionedUserIds ?? [],
      reactions: c.reactions ?? [],
      createdAt: c.createdAt,
      editedAt: c.editedAt ?? null,
    }))
  },
})

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    taskId: v.id("tasks"),
    bodyMarkdown: v.string(),
    mentionedUserIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireTaskWriteAccess(ctx, args.workspaceId)

    const task = await ctx.db.get(args.taskId)
    if (!task || task.workspaceId !== args.workspaceId) {
      throw new Error("Task not found")
    }

    const trimmed = args.bodyMarkdown.trim()
    if (!trimmed) {
      throw new Error("Comment cannot be empty")
    }

    const memberIds = await loadWorkspaceMemberIds(ctx, args.workspaceId)
    const requestedMentions = args.mentionedUserIds ?? []
    const validMentions = Array.from(
      new Set(requestedMentions.filter((id) => memberIds.has(id)))
    )

    const profile = getIdentityProfile(identity)
    const now = Date.now()

    const commentId = await ctx.db.insert("taskComments", {
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      authorId: identity.subject,
      authorName: profile.name,
      authorImageUrl: profile.imageUrl,
      bodyMarkdown: trimmed,
      mentionedUserIds: validMentions,
      reactions: [],
      createdAt: now,
    })

    for (const userId of validMentions) {
      if (userId === identity.subject) continue
      await ctx.db.insert("taskCommentMentions", {
        workspaceId: args.workspaceId,
        taskId: args.taskId,
        commentId,
        userId,
        createdAt: now,
      })
    }

    await queueLinearSync(ctx, args.taskId)

    return commentId
  },
})

export const edit = mutation({
  args: {
    commentId: v.id("taskComments"),
    bodyMarkdown: v.string(),
    mentionedUserIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId)
    if (!comment) throw new Error("Comment not found")

    const { identity } = await requireTaskWriteAccess(ctx, comment.workspaceId)
    if (comment.authorId !== identity.subject) {
      throw new Error("Only the author can edit this comment")
    }

    const trimmed = args.bodyMarkdown.trim()
    if (!trimmed) throw new Error("Comment cannot be empty")

    const memberIds = await loadWorkspaceMemberIds(ctx, comment.workspaceId)
    const requestedMentions = args.mentionedUserIds ?? []
    const validMentions = Array.from(
      new Set(requestedMentions.filter((id) => memberIds.has(id)))
    )

    const previousMentions = new Set(comment.mentionedUserIds ?? [])
    const newMentions = validMentions.filter(
      (id) => id !== identity.subject && !previousMentions.has(id)
    )

    await ctx.db.patch(args.commentId, {
      bodyMarkdown: trimmed,
      mentionedUserIds: validMentions,
      editedAt: Date.now(),
    })

    const now = Date.now()
    for (const userId of newMentions) {
      await ctx.db.insert("taskCommentMentions", {
        workspaceId: comment.workspaceId,
        taskId: comment.taskId,
        commentId: args.commentId,
        userId,
        createdAt: now,
      })
    }

    await queueLinearSync(ctx, comment.taskId)
  },
})

export const remove = mutation({
  args: { commentId: v.id("taskComments") },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId)
    if (!comment) return

    const { identity } = await requireTaskWriteAccess(ctx, comment.workspaceId)
    if (comment.authorId !== identity.subject) {
      throw new Error("Only the author can delete this comment")
    }

    const mentions = await ctx.db
      .query("taskCommentMentions")
      .withIndex("by_comment", (q) => q.eq("commentId", args.commentId))
      .collect()
    for (const mention of mentions) {
      await ctx.db.delete(mention._id)
    }

    await ctx.db.delete(args.commentId)
  },
})

export const toggleReaction = mutation({
  args: { commentId: v.id("taskComments") },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId)
    if (!comment) throw new Error("Comment not found")

    const { identity } = await requireTaskWriteAccess(ctx, comment.workspaceId)

    const existing = comment.reactions ?? []
    const alreadyReacted = existing.some(
      (r) => r.userId === identity.subject && r.emoji === REACTION_EMOJI
    )

    const nextReactions = alreadyReacted
      ? existing.filter(
          (r) => !(r.userId === identity.subject && r.emoji === REACTION_EMOJI)
        )
      : [...existing, { userId: identity.subject, emoji: REACTION_EMOJI }]

    await ctx.db.patch(args.commentId, { reactions: nextReactions })
  },
})

export const markTaskMentionsRead = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceAccess(ctx, args.workspaceId)

    const unread = await ctx.db
      .query("taskCommentMentions")
      .withIndex("by_user_task", (q) =>
        q.eq("userId", identity.subject).eq("taskId", args.taskId)
      )
      .collect()

    const now = Date.now()
    for (const mention of unread) {
      if (mention.readAt == null) {
        await ctx.db.patch(mention._id, { readAt: now })
      }
    }
  },
})

export const unreadMentionCountsForWorkspace = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args): Promise<Record<string, number>> => {
    const { identity } = await requireWorkspaceAccess(ctx, args.workspaceId)

    const unread = await ctx.db
      .query("taskCommentMentions")
      .withIndex("by_user_workspace_read", (q) =>
        q
          .eq("userId", identity.subject)
          .eq("workspaceId", args.workspaceId)
          .eq("readAt", undefined)
      )
      .collect()

    const counts: Record<string, number> = {}
    for (const mention of unread) {
      const key = mention.taskId as unknown as string
      counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  },
})
