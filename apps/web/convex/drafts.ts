import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { Id, Doc } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import { requireTaskWriteAccess, requireWorkspaceAccess } from "./permissions"
import { STATUS_ORDER } from "../lib/task-board"
import { insertWorkspaceLog } from "./logs"
import {
  recordDeletedTaskSource,
  recordLinkedPlatformDeletions,
  queueGitHubIssueClosure,
  queueLinearIssueDeletion,
  clearLinearTaskLink,
  clearGitHubTaskLink,
} from "./tasks"

const draftStatusValidator = v.union(
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("ready"),
  v.literal("shipped"),
  v.literal("archive")
)

const draftPriorityValidator = v.union(
  v.literal("urgent"),
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
  v.literal("none")
)

const attachmentValidator = v.object({
  storageId: v.id("_storage"),
  name: v.string(),
  type: v.string(),
  size: v.number(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  displayWidth: v.optional(v.number()),
})

async function queueLinearSync(ctx: MutationCtx, taskId: Id<"tasks">) {
  await ctx.scheduler.runAfter(0, internal.linear.syncTaskToLinearIssue, {
    taskId,
  })
}

async function queueGitHubSync(ctx: MutationCtx, taskId: Id<"tasks">) {
  await ctx.scheduler.runAfter(0, internal.github.syncTaskToGitHubIssue, {
    taskId,
  })
}

// ── Queries ──

export const listDrafts = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId)
    const drafts = await ctx.db
      .query("drafts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()
    return drafts.sort((a, b) => b.updatedAt - a.updatedAt)
  },
})

export const getDraft = query({
  args: { draftId: v.id("drafts") },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId)
    if (!draft) return null
    await requireWorkspaceAccess(ctx, draft.workspaceId)
    return draft
  },
})

export const getDraftCount = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId)
    const drafts = await ctx.db
      .query("drafts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()
    return drafts.length
  },
})

// ── Mutations ──

export const saveDraft = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    title: v.string(),
    description: v.optional(v.string()),
    status: draftStatusValidator,
    priority: draftPriorityValidator,
    labels: v.array(v.string()),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, args) => {
    await requireTaskWriteAccess(ctx, args.workspaceId)
    const now = Date.now()
    const draftId = await ctx.db.insert("drafts", {
      workspaceId: args.workspaceId,
      title: args.title.trim(),
      description: args.description?.trim() || undefined,
      status: args.status,
      priority: args.priority,
      labels: args.labels,
      updatedAt: now,
      attachments: args.attachments ?? undefined,
    })
    return draftId
  },
})

export const updateDraft = mutation({
  args: {
    draftId: v.id("drafts"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(draftStatusValidator),
    priority: v.optional(draftPriorityValidator),
    labels: v.optional(v.array(v.string())),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId)
    if (!draft) throw new Error("Draft not found")
    await requireTaskWriteAccess(ctx, draft.workspaceId)

    const updates: Record<string, unknown> = { updatedAt: Date.now() }
    if (args.title !== undefined) updates.title = args.title.trim()
    if (args.description !== undefined)
      updates.description = args.description.trim() || undefined
    if (args.status !== undefined) updates.status = args.status
    if (args.priority !== undefined) updates.priority = args.priority
    if (args.labels !== undefined) updates.labels = args.labels
    if (args.attachments !== undefined) updates.attachments = args.attachments

    await ctx.db.patch(args.draftId, updates)
  },
})

export const deleteDraft = mutation({
  args: { draftId: v.id("drafts") },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId)
    if (!draft) throw new Error("Draft not found")
    await requireTaskWriteAccess(ctx, draft.workspaceId)
    await ctx.db.delete(args.draftId)
  },
})

export const publishDraft = mutation({
  args: { draftId: v.id("drafts") },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId)
    if (!draft) throw new Error("Draft not found")
    await requireTaskWriteAccess(ctx, draft.workspaceId)

    const workspace = await ctx.db.get(draft.workspaceId)
    if (!workspace) throw new Error("Workspace not found")

    const now = Date.now()

    // Get existing tasks for ordering
    const existingTasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", draft.workspaceId)
      )
      .collect()

    const baseTaskNumber = Math.max(
      workspace.taskCounter ?? 0,
      ...existingTasks.map((t) => t.taskNumber)
    )
    const nextTaskNumber = baseTaskNumber + 1

    const statusOrder = STATUS_ORDER[draft.status]
    let maxOrder = 0
    for (const task of existingTasks) {
      if (STATUS_ORDER[task.status] === statusOrder) {
        maxOrder = Math.max(maxOrder, task.order + 1)
      }
    }

    const taskId = await ctx.db.insert("tasks", {
      workspaceId: draft.workspaceId,
      taskCode: `${workspace.prefix || "MED"}-${nextTaskNumber}`,
      taskNumber: nextTaskNumber,
      title: draft.title,
      description: draft.description,
      status: draft.status,
      priority: draft.priority,
      labels: draft.labels,
      order: maxOrder,
      project: workspace.name,
      updatedAt: now,
      assignee: { name: "Abdul", avatar: "" },
      attachments: draft.attachments,
    })

    await ctx.db.patch(draft.workspaceId, {
      taskCounter: nextTaskNumber,
    })

    // Log and sync integrations
    const task = await ctx.db.get(taskId)
    if (task) {
      await insertWorkspaceLog(ctx, {
        workspaceId: draft.workspaceId,
        category: "tasks",
        type: "task_created",
        message: `Published draft "${task.title}" as ${task.taskCode}`,
        source: "manual",
      })
      await queueLinearSync(ctx, task._id)
      await queueGitHubSync(ctx, task._id)
    }

    // Delete the draft
    await ctx.db.delete(args.draftId)

    return taskId
  },
})

export const moveTaskToDraft = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId)
    if (!task) throw new Error("Task not found")
    await requireTaskWriteAccess(ctx, task.workspaceId)

    const now = Date.now()

    // Create draft from task data
    const draftId = await ctx.db.insert("drafts", {
      workspaceId: task.workspaceId,
      title: task.title,
      description: task.description,
      status: task.status === "requests" ? "todo" : task.status,
      priority: task.priority,
      labels: task.labels,
      updatedAt: now,
      attachments: task.attachments,
    })

    // Log before deleting
    await insertWorkspaceLog(ctx, {
      workspaceId: task.workspaceId,
      category: "tasks",
      type: "task_updated",
      message: `Moved ${task.taskCode} "${task.title}" to drafts`,
      source: "manual",
    })

    // Clean up integration links (same as deleteTask in tasks.ts)
    await recordDeletedTaskSource(ctx, task)
    await recordLinkedPlatformDeletions(ctx, task)
    await queueGitHubIssueClosure(ctx, task.workspaceId, args.taskId)
    await queueLinearIssueDeletion(ctx, task.workspaceId, args.taskId)
    await clearLinearTaskLink(ctx, args.taskId)
    await clearGitHubTaskLink(ctx, args.taskId)

    // Delete the task
    await ctx.db.delete(args.taskId)

    return draftId
  },
})
