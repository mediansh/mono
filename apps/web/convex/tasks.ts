import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { STATUS_ORDER, isDemoTaskSet } from "../lib/task-board"
import {
  requireTaskWriteAccess,
  requireWorkspaceAccess,
} from "./permissions"

const taskStatusValidator = v.union(
  v.literal("requests"),
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("ready"),
  v.literal("shipped"),
  v.literal("archive")
)

const taskPriorityValidator = v.union(
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
})

const taskSourceValidator = v.object({
  platform: v.union(v.literal("discord"), v.literal("slack"), v.literal("x")),
  url: v.string(),
  author: v.string(),
})

const taskInputValidator = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  status: taskStatusValidator,
  priority: taskPriorityValidator,
  labels: v.array(v.string()),
  source: v.optional(taskSourceValidator),
  createdAtLabel: v.optional(v.string()),
  attachments: v.optional(v.array(attachmentValidator)),
})

type CreateTaskInput = {
  title: string
  description?: string
  status: "requests" | "todo" | "in_progress" | "ready" | "shipped" | "archive"
  priority: "urgent" | "high" | "medium" | "low" | "none"
  labels: string[]
  source?: {
    platform: "discord" | "slack" | "x"
    url: string
    author: string
  }
  createdAtLabel?: string
  attachments?: {
    storageId: Id<"_storage">
    name: string
    type: string
    size: number
  }[]
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

async function insertTasksForWorkspace(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  taskInputs: CreateTaskInput[]
) {
  const workspace = await ctx.db.get(workspaceId)
  if (!workspace) throw new Error("Workspace not found")
  if (taskInputs.length === 0) return []

  const existingTasks = await getWorkspaceTasks(ctx, workspaceId)
  const baseTaskNumber = Math.max(
    workspace.taskCounter ?? 0,
    ...existingTasks.map((task) => task.taskNumber)
  )

  const orderByStatus = new Map<number, number>()
  for (const task of existingTasks) {
    orderByStatus.set(
      STATUS_ORDER[task.status],
      (orderByStatus.get(STATUS_ORDER[task.status]) ?? 0) + 1
    )
  }

  const createdTaskIds: Id<"tasks">[] = []

  for (const [index, taskInput] of taskInputs.entries()) {
    const nextTaskNumber = baseTaskNumber + index + 1
    const statusOrder = STATUS_ORDER[taskInput.status]
    const nextOrder = orderByStatus.get(statusOrder) ?? 0
    orderByStatus.set(statusOrder, nextOrder + 1)

    const taskId = await ctx.db.insert("tasks", {
      workspaceId,
      taskCode: `${workspace.prefix || "MED"}-${nextTaskNumber}`,
      taskNumber: nextTaskNumber,
      title: taskInput.title.trim(),
      description: taskInput.description?.trim() || undefined,
      status: taskInput.status,
      priority: taskInput.priority,
      labels: taskInput.labels,
      order: nextOrder,
      project: workspace.name,
      assignee: {
        name: "Abdul",
        avatar: "",
      },
      source: taskInput.source,
      createdAtLabel: taskInput.createdAtLabel,
      attachments: taskInput.attachments ?? undefined,
    })

    createdTaskIds.push(taskId)
  }

  await ctx.db.patch(workspaceId, {
    taskCounter: baseTaskNumber + taskInputs.length,
  })

  return (
    await Promise.all(createdTaskIds.map((taskId) => ctx.db.get(taskId)))
  ).filter(Boolean) as Doc<"tasks">[]
}

async function createTasksForWorkspace(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  taskInputs: CreateTaskInput[]
) {
  await requireTaskWriteAccess(ctx, workspaceId)
  return await insertTasksForWorkspace(ctx, workspaceId, taskInputs)
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
    ...taskInputValidator.fields,
  },
  handler: async (ctx, args) => {
    const createdTasks = await createTasksForWorkspace(ctx, args.workspaceId, [args])
    return createdTasks[0]
  },
})

export const createTasks = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    tasks: v.array(taskInputValidator),
  },
  handler: async (ctx, args) => {
    return await createTasksForWorkspace(ctx, args.workspaceId, args.tasks)
  },
})

export const createTasksFromDiscordFeedback = mutation({
  args: {
    botSecret: v.string(),
    workspaceId: v.id("workspaces"),
    tasks: v.array(taskInputValidator),
  },
  handler: async (ctx, args) => {
    const configuredSecret = process.env.DISCORD_PAIRING_SECRET
    if (!configuredSecret || args.botSecret !== configuredSecret) {
      throw new Error("Invalid Discord bot secret")
    }

    return await insertTasksForWorkspace(ctx, args.workspaceId, args.tasks)
  },
})

export const getTaskSnapshotForDiscord = query({
  args: {
    botSecret: v.string(),
    workspaceId: v.id("workspaces"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const configuredSecret = process.env.DISCORD_PAIRING_SECRET
    if (!configuredSecret || args.botSecret !== configuredSecret) {
      throw new Error("Invalid Discord bot secret")
    }

    const tasks = await getWorkspaceTasks(ctx, args.workspaceId)
    const limit = Math.min(args.limit ?? 50, 100)

    return tasks
      .filter((task) => task.status !== "archive")
      .slice(0, limit)
      .map((task) => ({
        taskId: task._id,
        taskCode: task.taskCode,
        title: task.title,
        description: task.description ?? null,
        status: task.status,
        priority: task.priority,
        labels: task.labels,
        sourceUrl: task.source?.url ?? null,
      }))
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
    labels: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId)
    if (!task) throw new Error("Task not found")

    await requireTaskWriteAccess(ctx, task.workspaceId)

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
    await requireTaskWriteAccess(ctx, args.workspaceId)

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

    await requireTaskWriteAccess(ctx, task.workspaceId)
    await ctx.db.delete(args.taskId)
  },
})

export const bulkUpdateTasks = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    taskIds: v.array(v.id("tasks")),
    status: v.optional(taskStatusValidator),
    priority: v.optional(taskPriorityValidator),
    labels: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireTaskWriteAccess(ctx, args.workspaceId)

    const updates: Partial<Doc<"tasks">> = {}
    if (args.status !== undefined) updates.status = args.status
    if (args.priority !== undefined) updates.priority = args.priority
    if (args.labels !== undefined) updates.labels = args.labels

    for (const taskId of args.taskIds) {
      const task = await ctx.db.get(taskId)
      if (!task || task.workspaceId !== args.workspaceId) {
        throw new Error("Task not found")
      }
      await ctx.db.patch(taskId, updates)
    }
  },
})

export const bulkDeleteTasks = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    taskIds: v.array(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    await requireTaskWriteAccess(ctx, args.workspaceId)

    for (const taskId of args.taskIds) {
      const task = await ctx.db.get(taskId)
      if (!task || task.workspaceId !== args.workspaceId) {
        throw new Error("Task not found")
      }
      await ctx.db.delete(taskId)
    }
  },
})

export const clearDemoTasks = mutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireTaskWriteAccess(ctx, args.workspaceId)

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
