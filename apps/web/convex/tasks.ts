import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { STATUS_ORDER, isDemoTaskSet } from "../lib/task-board"

async function requireWorkspaceAccess(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">
) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Not authenticated")

  const membership = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_user_workspace", (q) =>
      q.eq("userId", identity.subject).eq("workspaceId", workspaceId)
    )
    .unique()

  if (!membership) throw new Error("Not authorized")

  return identity
}

function sortTasks<T extends { status: keyof typeof STATUS_ORDER; order: number }>(tasks: T[]) {
  return tasks.sort((a, b) => {
    const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if (statusDiff !== 0) return statusDiff
    return a.order - b.order
  })
}

async function getWorkspaceTasks(ctx: QueryCtx | MutationCtx, workspaceId: Id<"workspaces">) {
  const tasks = (await ctx.db
    .query("tasks")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect()) as Doc<"tasks">[]

  return sortTasks(tasks)
}

export const listByWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId)
    return await getWorkspaceTasks(ctx, args.workspaceId)
  },
})

export const createTask = mutation({
  args: {
    workspaceId: v.id("workspaces"),
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
    labels: v.array(
      v.union(
        v.literal("feature"),
        v.literal("bug"),
        v.literal("improvement"),
        v.literal("design"),
        v.literal("devops")
      )
    ),
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
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId)

    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) throw new Error("Workspace not found")

    const tasks = await getWorkspaceTasks(ctx, args.workspaceId)
    const nextTaskNumber =
      Math.max(
        workspace.taskCounter ?? 0,
        ...tasks.map((task) => task.taskNumber)
      ) + 1

    const order = tasks.filter((task) => task.status === args.status).length

    const taskId = await ctx.db.insert("tasks", {
      workspaceId: args.workspaceId,
      taskCode: `MED-${nextTaskNumber}`,
      taskNumber: nextTaskNumber,
      title: args.title.trim(),
      description: args.description?.trim() || undefined,
      status: args.status,
      priority: args.priority,
      labels: args.labels,
      order,
      project: workspace.name,
      assignee: {
        name: "Abdul",
        avatar: "",
      },
      attachments: args.attachments ?? undefined,
    })

    await ctx.db.patch(args.workspaceId, { taskCounter: nextTaskNumber })

    return await ctx.db.get(taskId)
  },
})

export const updateTask = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("requests"),
        v.literal("todo"),
        v.literal("in_progress"),
        v.literal("ready"),
        v.literal("shipped"),
        v.literal("archive")
      )
    ),
    priority: v.optional(
      v.union(
        v.literal("urgent"),
        v.literal("high"),
        v.literal("medium"),
        v.literal("low"),
        v.literal("none")
      )
    ),
    labels: v.optional(
      v.array(
        v.union(
          v.literal("feature"),
          v.literal("bug"),
          v.literal("improvement"),
          v.literal("design"),
          v.literal("devops")
        )
      )
    ),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId)
    if (!task) throw new Error("Task not found")

    await requireWorkspaceAccess(ctx, task.workspaceId)

    const updates: Partial<Doc<"tasks">> = {}
    if (args.title !== undefined) updates.title = args.title.trim()
    if (args.description !== undefined) updates.description = args.description.trim() || undefined
    if (args.status !== undefined) updates.status = args.status
    if (args.priority !== undefined) updates.priority = args.priority
    if (args.labels !== undefined) updates.labels = args.labels

    await ctx.db.patch(args.taskId, updates)
  },
})

export const reorderTasks = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    changes: v.array(
      v.object({
        taskId: v.id("tasks"),
        status: v.union(
          v.literal("requests"),
          v.literal("todo"),
          v.literal("in_progress"),
          v.literal("ready"),
          v.literal("shipped"),
          v.literal("archive")
        ),
        order: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId)

    for (const change of args.changes) {
      const task = await ctx.db.get(change.taskId)
      if (!task || task.workspaceId !== args.workspaceId) {
        throw new Error("Task not found")
      }
    }

    for (const change of args.changes) {
      await ctx.db.patch(change.taskId, {
        status: change.status,
        order: change.order,
      })
    }
  },
})

export const deleteTask = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId)
    if (!task) throw new Error("Task not found")

    await requireWorkspaceAccess(ctx, task.workspaceId)
    await ctx.db.delete(args.taskId)
  },
})

export const clearDemoTasks = mutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId)

    const tasks = await getWorkspaceTasks(ctx, args.workspaceId)
    if (!isDemoTaskSet(tasks)) {
      return false
    }

    for (const task of tasks) {
      await ctx.db.delete(task._id)
    }

    await ctx.db.patch(args.workspaceId, { taskCounter: 0 })
    return true
  },
})
