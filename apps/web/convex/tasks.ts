import { v } from "convex/values"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { internal } from "./_generated/api"
import { STATUS_ORDER, isDemoTaskSet } from "../lib/task-board"
import { insertWorkspaceLog, insertWorkspaceLogs } from "./logs"
import { requireTaskWriteAccess, requireWorkspaceAccess } from "./permissions"

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
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  displayWidth: v.optional(v.number()),
})

const taskSourceValidator = v.object({
  platform: v.union(
    v.literal("discord"),
    v.literal("slack"),
    v.literal("x"),
    v.literal("linear"),
    v.literal("github"),
    v.literal("cli")
  ),
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
    platform: "discord" | "slack" | "x" | "linear" | "github" | "cli"
    url: string
    author: string
  }
  createdAtLabel?: string
  attachments?: {
    storageId: Id<"_storage">
    name: string
    type: string
    size: number
    width?: number
    height?: number
    displayWidth?: number
  }[]
}

type FeedbackTaskUpdateInput = {
  taskCode: string
  title: string
  description?: string
  priority?: "urgent" | "high" | "medium" | "low" | "none"
  labels: string[]
}

type FeedbackTaskOperationInput =
  | {
      action: "create"
      task: CreateTaskInput
    }
  | ({
      action: "update"
    } & FeedbackTaskUpdateInput)

type WorkspaceTaskLog = {
  workspaceId: Id<"workspaces">
  category: "tasks"
  type: "task_moved" | "task_updated" | "task_deleted"
  message: string
  source?: "discord" | "github" | "linear" | "x" | "cli" | "manual"
}

const TASK_STATUS_LABELS = {
  requests: "Requests",
  todo: "Todo",
  in_progress: "In Progress",
  ready: "Ready",
  shipped: "Shipped",
  archive: "Archive",
} as const

const TASK_PRIORITY_ORDER = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
} as const

function getWorkspaceLogSource(
  platform?: "discord" | "slack" | "x" | "linear" | "github" | "cli"
) {
  if (
    platform === "discord" ||
    platform === "github" ||
    platform === "linear" ||
    platform === "x" ||
    platform === "cli"
  ) {
    return platform
  }

  return "manual"
}

function normalizeTitleFingerprint(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

function sortTasks<
  T extends { status: keyof typeof STATUS_ORDER; order: number },
>(tasks: T[]) {
  return tasks.sort((a, b) => {
    const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if (statusDiff !== 0) return statusDiff
    return a.order - b.order
  })
}

async function getWorkspaceTasks(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">
) {
  const tasks = (await ctx.db
    .query("tasks")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect()) as Doc<"tasks">[]

  return sortTasks(tasks)
}

async function logTaskCreated(ctx: MutationCtx, task: Doc<"tasks">) {
  await insertWorkspaceLog(ctx, {
    workspaceId: task.workspaceId,
    category: "tasks",
    type: "task_created",
    message: `Task ${task.taskCode} "${task.title}" created`,
    source: getWorkspaceLogSource(task.source?.platform),
  })
}

async function logTaskMoved(
  ctx: MutationCtx,
  task: Doc<"tasks">,
  nextStatus: Doc<"tasks">["status"]
) {
  await insertWorkspaceLog(ctx, {
    workspaceId: task.workspaceId,
    category: "tasks",
    type: "task_moved",
    message: `${task.taskCode} moved from "${TASK_STATUS_LABELS[task.status]}" to "${TASK_STATUS_LABELS[nextStatus]}"`,
    source: getWorkspaceLogSource(task.source?.platform),
  })
}

async function logTaskUpdated(ctx: MutationCtx, task: Doc<"tasks">) {
  await insertWorkspaceLog(ctx, {
    workspaceId: task.workspaceId,
    category: "tasks",
    type: "task_updated",
    message: `${task.taskCode} updated`,
    source: getWorkspaceLogSource(task.source?.platform),
  })
}

async function logTaskDeleted(ctx: MutationCtx, task: Doc<"tasks">) {
  await insertWorkspaceLog(ctx, {
    workspaceId: task.workspaceId,
    category: "tasks",
    type: "task_deleted",
    message: `${task.taskCode} deleted`,
    source: getWorkspaceLogSource(task.source?.platform),
  })
}

async function logFeedbackProcessed(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  createdTasks: Doc<"tasks">[],
  updatedTaskCount = 0,
  sourcePlatform?: "discord" | "slack" | "x" | "linear" | "github" | "cli",
  cost?: number
) {
  if (createdTasks.length === 0 && updatedTaskCount === 0) {
    return
  }

  let message = ""
  if (createdTasks.length > 0 && updatedTaskCount > 0) {
    message = `Processed feedback and ${createdTasks.length === 1 ? "created 1 task" : `created ${createdTasks.length} tasks`} and ${updatedTaskCount === 1 ? "updated 1 task" : `updated ${updatedTaskCount} tasks`}`
  } else if (createdTasks.length > 0) {
    message =
      createdTasks.length === 1
        ? "Processed feedback and created 1 task"
        : `Processed feedback and created ${createdTasks.length} tasks`
  } else {
    message =
      updatedTaskCount === 1
        ? "Processed feedback and updated 1 task"
        : `Processed feedback and updated ${updatedTaskCount} tasks`
  }

  await insertWorkspaceLog(ctx, {
    workspaceId,
    category: "tasks",
    type: "feedback_processed",
    message,
    source: getWorkspaceLogSource(
      sourcePlatform ?? createdTasks[0]?.source?.platform
    ),
    cost,
  })
}

async function insertTasksForWorkspace(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  taskInputs: CreateTaskInput[]
) {
  const workspace = await ctx.db.get(workspaceId)
  if (!workspace) throw new Error("Workspace not found")
  if (taskInputs.length === 0) return []
  const now = Date.now()

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
      updatedAt: now,
      assignee: {
        name: "Abdul",
        avatar: "",
      },
      source: taskInput.source,
      sources: taskInput.source ? [taskInput.source] : undefined,
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

async function recordDeletedTaskSource(ctx: MutationCtx, task: Doc<"tasks">) {
  const source = task.source
  if (!source?.url) {
    return
  }

  const titleFingerprint = normalizeTitleFingerprint(task.title)
  const existing = await ctx.db
    .query("deletedTaskSources")
    .withIndex("by_workspace_source_title", (q) =>
      q
        .eq("workspaceId", task.workspaceId)
        .eq("platform", source.platform)
        .eq("sourceUrl", source.url)
        .eq("titleFingerprint", titleFingerprint)
    )
    .unique()

  if (existing) {
    await ctx.db.patch(existing._id, {
      deletedAt: Date.now(),
    })
    return
  }

  await ctx.db.insert("deletedTaskSources", {
    workspaceId: task.workspaceId,
    platform: source.platform,
    sourceUrl: source.url,
    titleFingerprint,
    deletedAt: Date.now(),
  })
}

async function recordLinkedPlatformDeletions(
  ctx: MutationCtx,
  task: Doc<"tasks">
) {
  const titleFingerprint = normalizeTitleFingerprint(task.title)
  const now = Date.now()

  const linearLink = await ctx.db
    .query("linearTaskLinks")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .unique()

  if (linearLink?.linearIssueUrl) {
    const existing = await ctx.db
      .query("deletedTaskSources")
      .withIndex("by_workspace_source", (q) =>
        q
          .eq("workspaceId", task.workspaceId)
          .eq("platform", "linear")
          .eq("sourceUrl", linearLink.linearIssueUrl!)
      )
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, { deletedAt: now })
    } else {
      await ctx.db.insert("deletedTaskSources", {
        workspaceId: task.workspaceId,
        platform: "linear",
        sourceUrl: linearLink.linearIssueUrl!,
        titleFingerprint,
        deletedAt: now,
      })
    }
  }

  const githubLink = await ctx.db
    .query("githubTaskLinks")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .unique()

  if (githubLink?.githubIssueUrl) {
    const existing = await ctx.db
      .query("deletedTaskSources")
      .withIndex("by_workspace_source", (q) =>
        q
          .eq("workspaceId", task.workspaceId)
          .eq("platform", "github")
          .eq("sourceUrl", githubLink.githubIssueUrl)
      )
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, { deletedAt: now })
    } else {
      await ctx.db.insert("deletedTaskSources", {
        workspaceId: task.workspaceId,
        platform: "github",
        sourceUrl: githubLink.githubIssueUrl,
        titleFingerprint,
        deletedAt: now,
      })
    }
  }
}

async function isTaskSourceSuppressed(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  taskInput: CreateTaskInput,
  matchMode: "url" | "exact"
) {
  if (!taskInput.source?.url) {
    return false
  }

  const suppressions = await ctx.db
    .query("deletedTaskSources")
    .withIndex("by_workspace_source", (q) =>
      q
        .eq("workspaceId", workspaceId)
        .eq("platform", taskInput.source!.platform)
        .eq("sourceUrl", taskInput.source!.url)
    )
    .collect()

  if (suppressions.length === 0) {
    return false
  }

  if (matchMode === "url") {
    return true
  }

  const titleFingerprint = normalizeTitleFingerprint(taskInput.title)
  return suppressions.some(
    (suppression) => suppression.titleFingerprint === titleFingerprint
  )
}

async function filterSuppressedTaskInputs(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  taskInputs: CreateTaskInput[],
  matchMode: "url" | "exact"
) {
  const filtered: CreateTaskInput[] = []

  for (const taskInput of taskInputs) {
    if (
      !(await isTaskSourceSuppressed(ctx, workspaceId, taskInput, matchMode))
    ) {
      filtered.push(taskInput)
    }
  }

  return filtered
}

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

function getHigherPriority(
  currentPriority: Doc<"tasks">["priority"],
  nextPriority: Doc<"tasks">["priority"]
) {
  return TASK_PRIORITY_ORDER[nextPriority] >
    TASK_PRIORITY_ORDER[currentPriority]
    ? nextPriority
    : currentPriority
}

function mergeLabels(currentLabels: string[], nextLabels: string[]) {
  return Array.from(new Set([...currentLabels, ...nextLabels]))
}

async function applyFeedbackTaskOperations(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  operations: FeedbackTaskOperationInput[],
  sourcePlatform?: "discord" | "slack" | "x" | "linear" | "github" | "cli",
  cost?: number
) {
  const createInputs = operations
    .filter(
      (
        operation
      ): operation is Extract<
        FeedbackTaskOperationInput,
        { action: "create" }
      > => operation.action === "create"
    )
    .map((operation) => operation.task)
  const filteredCreateInputs = await filterSuppressedTaskInputs(
    ctx,
    workspaceId,
    createInputs,
    "exact"
  )
  const createdTasks = await insertTasksForWorkspace(
    ctx,
    workspaceId,
    filteredCreateInputs
  )

  const workspaceTasks = await getWorkspaceTasks(ctx, workspaceId)
  const taskByCode = new Map(
    workspaceTasks.map((task) => [task.taskCode, task] as const)
  )

  const updatedTaskIds: Id<"tasks">[] = []

  for (const operation of operations) {
    if (operation.action !== "update") {
      continue
    }

    const task = taskByCode.get(operation.taskCode)
    if (!task) {
      continue
    }

    const nextTitle = operation.title.trim()
    const nextDescription = operation.description?.trim() || undefined
    const nextPriority = operation.priority
      ? getHigherPriority(task.priority, operation.priority)
      : task.priority
    const nextLabels = mergeLabels(task.labels, operation.labels)

    const hasChanges =
      nextTitle !== task.title ||
      nextDescription !== (task.description ?? undefined) ||
      nextPriority !== task.priority ||
      nextLabels.length !== task.labels.length ||
      nextLabels.some((label, index) => label !== task.labels[index])

    if (!hasChanges) {
      continue
    }

    await ctx.db.patch(task._id, {
      title: nextTitle,
      description: nextDescription,
      priority: nextPriority,
      labels: nextLabels,
      updatedAt: Date.now(),
    })

    await logTaskUpdated(ctx, task)
    await queueLinearSync(ctx, task._id)
    await queueGitHubSync(ctx, task._id)

    updatedTaskIds.push(task._id)
  }

  await logFeedbackProcessed(
    ctx,
    workspaceId,
    createdTasks,
    updatedTaskIds.length,
    sourcePlatform,
    cost
  )

  for (const task of createdTasks) {
    await queueLinearSync(ctx, task._id)
    await queueGitHubSync(ctx, task._id)
  }

  return {
    createdTaskIds: createdTasks.map((task) => task._id),
    updatedTaskIds,
  }
}

async function queueGitHubIssueClosure(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  taskId: Id<"tasks">
) {
  const link = await ctx.db
    .query("githubTaskLinks")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .unique()

  if (!link) return

  await ctx.scheduler.runAfter(0, internal.github.closeLinkedGitHubIssue, {
    workspaceId,
    githubRepositoryFullName: link.githubRepositoryFullName,
    githubIssueNumber: link.githubIssueNumber,
  })
}

async function queueLinearIssueDeletion(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  taskId: Id<"tasks">
) {
  const link = await ctx.db
    .query("linearTaskLinks")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .unique()

  if (!link) return

  await ctx.scheduler.runAfter(0, internal.linear.deleteLinearIssue, {
    workspaceId,
    linearIssueId: link.linearIssueId,
  })
}

async function clearLinearTaskLink(ctx: MutationCtx, taskId: Id<"tasks">) {
  const link = await ctx.db
    .query("linearTaskLinks")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .unique()

  if (link) {
    await ctx.db.delete(link._id)
  }
}

async function clearGitHubTaskLink(ctx: MutationCtx, taskId: Id<"tasks">) {
  await ctx.runMutation(internal.github.deleteGitHubTaskLinkByTaskId, {
    taskId,
  })
}

export const listByWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId)
    const tasks = await getWorkspaceTasks(ctx, args.workspaceId)

    const [linearLinks, githubLinks] = await Promise.all([
      ctx.db
        .query("linearTaskLinks")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect(),
      ctx.db
        .query("githubTaskLinks")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect(),
    ])

    const linearByTask = new Map(linearLinks.map((l) => [l.taskId, l]))
    const githubByTask = new Map(githubLinks.map((l) => [l.taskId, l]))

    return await Promise.all(
      tasks.map(async (task) => {
        const base = task.sources?.length
          ? [...task.sources]
          : task.source
            ? [task.source]
            : []

        const linearLink = linearByTask.get(task._id)
        if (linearLink && !base.some((s) => s.platform === "linear")) {
          base.push({
            platform: "linear" as const,
            url: linearLink.linearIssueUrl ?? "",
            author: linearLink.linearIssueIdentifier,
          })
        }

        const githubLink = githubByTask.get(task._id)
        if (githubLink && !base.some((s) => s.platform === "github")) {
          base.push({
            platform: "github" as const,
            url: githubLink.githubIssueUrl,
            author: `${githubLink.githubRepositoryFullName}#${githubLink.githubIssueNumber}`,
          })
        }

        const attachments = task.attachments
          ? await Promise.all(
              task.attachments.map(async (attachment) => ({
                ...attachment,
                url: await ctx.storage.getUrl(attachment.storageId),
              }))
            )
          : undefined

        return {
          ...task,
          attachments,
          sources: base.length > 0 ? base : undefined,
        }
      })
    )
  },
})

export const resolveAttachmentUrls = query({
  args: {
    workspaceId: v.id("workspaces"),
    storageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId)

    const entries = await Promise.all(
      args.storageIds.map(async (storageId) => ({
        storageId,
        url: await ctx.storage.getUrl(storageId),
      }))
    )

    return Object.fromEntries(
      entries.map(({ storageId, url }) => [String(storageId), url])
    )
  },
})

export const createTask = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    ...taskInputValidator.fields,
  },
  handler: async (ctx, args) => {
    const createdTasks = await createTasksForWorkspace(ctx, args.workspaceId, [
      args,
    ])
    if (createdTasks[0]) {
      await logTaskCreated(ctx, createdTasks[0])
      await queueLinearSync(ctx, createdTasks[0]._id)
      await queueGitHubSync(ctx, createdTasks[0]._id)
    }
    return createdTasks[0]
  },
})

export const createTasks = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    tasks: v.array(taskInputValidator),
    cost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const createdTasks = await createTasksForWorkspace(
      ctx,
      args.workspaceId,
      args.tasks
    )
    if (createdTasks.length > 0) {
      await insertWorkspaceLog(ctx, {
        workspaceId: args.workspaceId,
        category: "tasks",
        type: "tasks_generated_ai",
        message:
          createdTasks.length === 1
            ? "AI generated 1 task from prompt"
            : `AI generated ${createdTasks.length} tasks from prompt`,
        source: "ai",
        cost: args.cost,
      })
    }
    for (const task of createdTasks) {
      await queueLinearSync(ctx, task._id)
      await queueGitHubSync(ctx, task._id)
    }
    return createdTasks
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

    const filteredTasks = await filterSuppressedTaskInputs(
      ctx,
      args.workspaceId,
      args.tasks,
      "exact"
    )
    const createdTasks = await insertTasksForWorkspace(
      ctx,
      args.workspaceId,
      filteredTasks
    )
    await logFeedbackProcessed(ctx, args.workspaceId, createdTasks)
    for (const task of createdTasks) {
      await queueLinearSync(ctx, task._id)
      await queueGitHubSync(ctx, task._id)
    }
    return createdTasks
  },
})

export const createTasksFromDiscordFeedbackInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    operations: v.array(
      v.union(
        v.object({
          action: v.literal("create"),
          task: taskInputValidator,
        }),
        v.object({
          action: v.literal("update"),
          taskCode: v.string(),
          title: v.string(),
          description: v.optional(v.string()),
          priority: v.optional(taskPriorityValidator),
          labels: v.array(v.string()),
        })
      )
    ),
    cost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await applyFeedbackTaskOperations(
      ctx,
      args.workspaceId,
      args.operations,
      "discord",
      args.cost
    )
  },
})

export const createTasksFromFeedbackInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    operations: v.array(
      v.union(
        v.object({
          action: v.literal("create"),
          task: taskInputValidator,
        }),
        v.object({
          action: v.literal("update"),
          taskCode: v.string(),
          title: v.string(),
          description: v.optional(v.string()),
          priority: v.optional(taskPriorityValidator),
          labels: v.array(v.string()),
        })
      )
    ),
    cost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await applyFeedbackTaskOperations(
      ctx,
      args.workspaceId,
      args.operations,
      "x",
      args.cost
    )
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

export const getTaskSnapshotForDiscordInternal = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
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

export const getTaskSnapshotForFeedbackInternal = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
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

function shouldRespondInChannel(
  integration: {
    respondForMe?: boolean
    respondForMeMode?: "off" | "all" | "specific"
    respondForMeChannelIds?: string[]
  },
  channelIds: string[]
): boolean {
  const mode = integration.respondForMeMode
  if (mode === "off") return false
  if (mode === "all") return true
  if (mode === "specific")
    return channelIds.some((channelId) =>
      (integration.respondForMeChannelIds ?? []).includes(channelId)
    )
  // Legacy fallback
  return integration.respondForMe ?? false
}

function parseDiscordPermalink(
  url: string
): { guildId: string; channelId: string; messageId: string } | null {
  const match = url.match(/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/)
  if (!match?.[1] || !match[2] || !match[3]) return null
  return { guildId: match[1], channelId: match[2], messageId: match[3] }
}

async function getDiscordNotificationContext(
  ctx: MutationCtx,
  sourceUrl: string
) {
  const parsed = parseDiscordPermalink(sourceUrl)
  if (!parsed) {
    return null
  }

  const integration = await ctx.db
    .query("discordWorkspaceIntegrations")
    .withIndex("by_guild", (q) => q.eq("guildId", parsed.guildId))
    .first()

  if (!integration) {
    return null
  }

  const sourceMessage = await ctx.db
    .query("discordMessages")
    .withIndex("by_discord_message", (q) =>
      q
        .eq("guildId", parsed.guildId)
        .eq("channelId", parsed.channelId)
        .eq("messageId", parsed.messageId)
    )
    .unique()

  return {
    integration,
    parsed,
    respondChannelIds: Array.from(
      new Set(
        [
          parsed.channelId,
          sourceMessage?.parentChannelId ?? "",
          sourceMessage?.forumChannelId ?? "",
        ].filter(Boolean)
      )
    ),
  }
}

async function queueDiscordNotificationForStatusChange(
  ctx: MutationCtx,
  task: Doc<"tasks">,
  taskId: Id<"tasks">,
  nextStatus: Doc<"tasks">["status"]
) {
  if (task.source?.platform !== "discord" || !task.source.url) {
    return
  }

  const notificationContext = await getDiscordNotificationContext(
    ctx,
    task.source.url
  )
  if (!notificationContext) {
    return
  }

  const { integration, parsed, respondChannelIds } = notificationContext
  if (!shouldRespondInChannel(integration, respondChannelIds)) {
    return
  }

  if (nextStatus === "shipped" && task.status !== "shipped") {
    await ctx.db.insert("discordPendingNotifications", {
      workspaceId: task.workspaceId,
      integrationId: integration._id,
      taskId,
      type: "request_shipped",
      channelId: parsed.channelId,
      replyToMessageId: parsed.messageId,
      taskTitle: task.title,
      taskCode: task.taskCode,
      status: "pending",
      createdAt: Date.now(),
    })
  }

  if (
    task.status === "requests" &&
    (nextStatus === "todo" ||
      nextStatus === "in_progress" ||
      nextStatus === "ready")
  ) {
    await ctx.db.insert("discordPendingNotifications", {
      workspaceId: task.workspaceId,
      integrationId: integration._id,
      taskId,
      type: "request_received",
      channelId: parsed.channelId,
      replyToMessageId: parsed.messageId,
      taskTitle: task.title,
      taskCode: task.taskCode,
      status: "pending",
      createdAt: Date.now(),
    })
  }
}

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
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId)
    if (!task) throw new Error("Task not found")

    await requireTaskWriteAccess(ctx, task.workspaceId)

    const updates: Partial<Doc<"tasks">> = {}
    if (args.title !== undefined) updates.title = args.title.trim()
    if (args.description !== undefined)
      updates.description = args.description.trim() || undefined
    if (args.status !== undefined) updates.status = args.status
    if (args.priority !== undefined) updates.priority = args.priority
    if (args.labels !== undefined) updates.labels = args.labels
    if (args.attachments !== undefined) {
      updates.attachments =
        args.attachments.length > 0 ? args.attachments : undefined
    }
    if (
      args.title !== undefined ||
      args.description !== undefined ||
      args.status !== undefined ||
      args.priority !== undefined ||
      args.labels !== undefined ||
      args.attachments !== undefined
    ) {
      updates.updatedAt = Date.now()
    }

    await ctx.db.patch(args.taskId, updates)
    if (
      args.title !== undefined ||
      args.description !== undefined ||
      args.status !== undefined ||
      args.priority !== undefined
    ) {
      await queueLinearSync(ctx, args.taskId)
      await queueGitHubSync(ctx, args.taskId)
    }

    // Queue Discord notifications for status transitions on tasks with a Discord source
    if (args.status !== undefined && args.status !== task.status) {
      await logTaskMoved(ctx, task, args.status)
      await queueDiscordNotificationForStatusChange(
        ctx,
        task,
        args.taskId,
        args.status
      )
    } else if (
      args.title !== undefined ||
      args.description !== undefined ||
      args.priority !== undefined ||
      args.labels !== undefined ||
      args.attachments !== undefined
    ) {
      await logTaskUpdated(ctx, task)
    }
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

    // Read all tasks first for validation and to detect status transitions
    const tasksBeforeUpdate = new Map<string, Doc<"tasks">>()
    const taskMoveLogs: WorkspaceTaskLog[] = []
    for (const change of args.changes) {
      const task = await ctx.db.get(change.taskId)
      if (!task || task.workspaceId !== args.workspaceId) {
        throw new Error("Task not found")
      }
      tasksBeforeUpdate.set(change.taskId, task)
    }

    for (const change of args.changes) {
      await ctx.db.patch(change.taskId, {
        status: change.status,
        order: change.order,
        updatedAt: Date.now(),
      })

      const taskBeforeUpdate = tasksBeforeUpdate.get(change.taskId)
      if (taskBeforeUpdate && change.status !== taskBeforeUpdate.status) {
        taskMoveLogs.push({
          workspaceId: taskBeforeUpdate.workspaceId,
          category: "tasks",
          type: "task_moved",
          message: `${taskBeforeUpdate.taskCode} moved from "${TASK_STATUS_LABELS[taskBeforeUpdate.status]}" to "${TASK_STATUS_LABELS[change.status]}"`,
          source: getWorkspaceLogSource(taskBeforeUpdate.source?.platform),
        })
        await queueLinearSync(ctx, change.taskId)
        await queueGitHubSync(ctx, change.taskId)
      }
    }

    await insertWorkspaceLogs(ctx, taskMoveLogs)

    // Queue Discord notifications for status transitions
    for (const change of args.changes) {
      const task = tasksBeforeUpdate.get(change.taskId)
      if (!task || change.status === task.status) {
        continue
      }

      await queueDiscordNotificationForStatusChange(
        ctx,
        task,
        change.taskId,
        change.status
      )
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
    await recordDeletedTaskSource(ctx, task)
    await recordLinkedPlatformDeletions(ctx, task)
    await queueGitHubIssueClosure(ctx, task.workspaceId, args.taskId)
    await queueLinearIssueDeletion(ctx, task.workspaceId, args.taskId)
    await clearLinearTaskLink(ctx, args.taskId)
    await clearGitHubTaskLink(ctx, args.taskId)
    await ctx.db.delete(args.taskId)
    await logTaskDeleted(ctx, task)
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
    const taskLogs: WorkspaceTaskLog[] = []
    if (args.status !== undefined) updates.status = args.status
    if (args.priority !== undefined) updates.priority = args.priority
    if (args.labels !== undefined) updates.labels = args.labels
    if (
      args.status !== undefined ||
      args.priority !== undefined ||
      args.labels !== undefined
    ) {
      updates.updatedAt = Date.now()
    }

    for (const taskId of args.taskIds) {
      const task = await ctx.db.get(taskId)
      if (!task || task.workspaceId !== args.workspaceId) {
        throw new Error("Task not found")
      }
      await ctx.db.patch(taskId, updates)
      if (args.status !== undefined || args.priority !== undefined) {
        await queueLinearSync(ctx, taskId)
        await queueGitHubSync(ctx, taskId)
      }

      if (args.status !== undefined && args.status !== task.status) {
        taskLogs.push({
          workspaceId: task.workspaceId,
          category: "tasks",
          type: "task_moved",
          message: `${task.taskCode} moved from "${TASK_STATUS_LABELS[task.status]}" to "${TASK_STATUS_LABELS[args.status]}"`,
          source: getWorkspaceLogSource(task.source?.platform),
        })
      } else if (args.priority !== undefined || args.labels !== undefined) {
        taskLogs.push({
          workspaceId: task.workspaceId,
          category: "tasks",
          type: "task_updated",
          message: `${task.taskCode} updated`,
          source: getWorkspaceLogSource(task.source?.platform),
        })
      }

      // Queue Discord notifications for status transitions
      if (args.status !== undefined && args.status !== task.status) {
        await queueDiscordNotificationForStatusChange(
          ctx,
          task,
          taskId,
          args.status
        )
      }
    }

    await insertWorkspaceLogs(ctx, taskLogs)
  },
})

export const bulkDeleteTasks = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    taskIds: v.array(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    await requireTaskWriteAccess(ctx, args.workspaceId)

    const deletedTaskLogs: WorkspaceTaskLog[] = []
    for (const taskId of args.taskIds) {
      const task = await ctx.db.get(taskId)
      if (!task || task.workspaceId !== args.workspaceId) {
        throw new Error("Task not found")
      }
      await recordDeletedTaskSource(ctx, task)
      await recordLinkedPlatformDeletions(ctx, task)
      await queueGitHubIssueClosure(ctx, args.workspaceId, taskId)
      await queueLinearIssueDeletion(ctx, args.workspaceId, taskId)
      await clearLinearTaskLink(ctx, taskId)
      await clearGitHubTaskLink(ctx, taskId)
      await ctx.db.delete(taskId)
      deletedTaskLogs.push({
        workspaceId: task.workspaceId,
        category: "tasks",
        type: "task_deleted",
        message: `${task.taskCode} deleted`,
        source: getWorkspaceLogSource(task.source?.platform),
      })
    }

    await insertWorkspaceLogs(ctx, deletedTaskLogs)
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
      await queueGitHubIssueClosure(ctx, args.workspaceId, task._id)
      await queueLinearIssueDeletion(ctx, args.workspaceId, task._id)
      await clearLinearTaskLink(ctx, task._id)
      await clearGitHubTaskLink(ctx, task._id)
      await ctx.db.delete(task._id)
    }

    await ctx.db.patch(args.workspaceId, { taskCounter: 0 })
    return true
  },
})
