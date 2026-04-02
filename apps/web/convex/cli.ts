import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { internal } from "./_generated/api"
import { STATUS_ORDER } from "../lib/task-board"
import { insertWorkspaceLog } from "./logs"
import {
  requireIdentity,
  requireWorkspaceAdminAccess,
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

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

async function requireCliApiKey(
  ctx: QueryCtx | MutationCtx,
  apiKey: string
) {
  const hash = await sha256(apiKey)
  const keyRecord = await ctx.db
    .query("cliApiKeys")
    .withIndex("by_key_hash", (q) => q.eq("keyHash", hash))
    .unique()

  if (!keyRecord || keyRecord.revokedAt) {
    throw new Error("Invalid or revoked API key")
  }

  return keyRecord
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

// ── Queries (called by CLI with API key) ─────────────────────────────

export const validateKey = query({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    const keyRecord = await requireCliApiKey(ctx, args.apiKey)
    const workspace = await ctx.db.get(keyRecord.workspaceId)
    if (!workspace) throw new Error("Workspace not found")

    return {
      workspaceId: workspace._id,
      workspaceName: workspace.name,
      workspacePrefix: workspace.prefix ?? "MED",
      labels: workspace.labels ?? [],
    }
  },
})

export const listTasks = query({
  args: {
    apiKey: v.string(),
    status: v.optional(taskStatusValidator),
    priority: v.optional(taskPriorityValidator),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const keyRecord = await requireCliApiKey(ctx, args.apiKey)
    const tasks = (await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", keyRecord.workspaceId)
      )
      .collect()) as Doc<"tasks">[]

    let filtered = sortTasks(tasks)

    if (args.status) {
      filtered = filtered.filter((t) => t.status === args.status)
    }
    if (args.priority) {
      filtered = filtered.filter((t) => t.priority === args.priority)
    }
    if (args.label) {
      filtered = filtered.filter((t) => t.labels.includes(args.label!))
    }

    return filtered.map((task) => ({
      _id: task._id,
      taskCode: task.taskCode,
      title: task.title,
      description: task.description ?? null,
      status: task.status,
      priority: task.priority,
      labels: task.labels,
      project: task.project,
      assignee: task.assignee ?? null,
      source: task.source ?? null,
      updatedAt: task.updatedAt ?? null,
      _creationTime: task._creationTime,
    }))
  },
})

export const getTaskByCode = query({
  args: {
    apiKey: v.string(),
    taskCode: v.string(),
  },
  handler: async (ctx, args) => {
    const keyRecord = await requireCliApiKey(ctx, args.apiKey)
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", keyRecord.workspaceId)
      )
      .collect()

    const task = tasks.find(
      (t) => t.taskCode.toLowerCase() === args.taskCode.toLowerCase()
    )
    if (!task) return null

    return {
      _id: task._id,
      taskCode: task.taskCode,
      title: task.title,
      description: task.description ?? null,
      status: task.status,
      priority: task.priority,
      labels: task.labels,
      project: task.project,
      assignee: task.assignee ?? null,
      source: task.source ?? null,
      updatedAt: task.updatedAt ?? null,
      _creationTime: task._creationTime,
    }
  },
})

// ── Mutations (called by CLI with API key) ───────────────────────────

export const createTask = mutation({
  args: {
    apiKey: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    status: taskStatusValidator,
    priority: taskPriorityValidator,
    labels: v.array(v.string()),
    agentName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const keyRecord = await requireCliApiKey(ctx, args.apiKey)
    const workspaceId = keyRecord.workspaceId
    const workspace = await ctx.db.get(workspaceId)
    if (!workspace) throw new Error("Workspace not found")

    // Update lastUsedAt
    await ctx.db.patch(keyRecord._id, { lastUsedAt: Date.now() })

    const now = Date.now()
    const existingTasks = (await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect()) as Doc<"tasks">[]

    const baseTaskNumber = Math.max(
      workspace.taskCounter ?? 0,
      ...existingTasks.map((task) => task.taskNumber)
    )

    const nextTaskNumber = baseTaskNumber + 1
    const orderByStatus = new Map<number, number>()
    for (const task of existingTasks) {
      orderByStatus.set(
        STATUS_ORDER[task.status],
        (orderByStatus.get(STATUS_ORDER[task.status]) ?? 0) + 1
      )
    }

    const statusOrder = STATUS_ORDER[args.status]
    const nextOrder = orderByStatus.get(statusOrder) ?? 0

    const taskId = await ctx.db.insert("tasks", {
      workspaceId,
      taskCode: `${workspace.prefix || "MED"}-${nextTaskNumber}`,
      taskNumber: nextTaskNumber,
      title: args.title.trim(),
      description: args.description?.trim() || undefined,
      status: args.status,
      priority: args.priority,
      labels: args.labels,
      order: nextOrder,
      project: workspace.name,
      updatedAt: now,
      source: {
        platform: "cli" as const,
        url: "",
        author: args.agentName || "cli",
      },
    })

    await ctx.db.patch(workspaceId, { taskCounter: nextTaskNumber })

    // Queue integration syncs
    await ctx.scheduler.runAfter(0, internal.linear.syncTaskToLinearIssue, {
      taskId,
    })
    await ctx.scheduler.runAfter(0, internal.github.syncTaskToGitHubIssue, {
      taskId,
    })

    const task = await ctx.db.get(taskId)
    if (task) {
      await insertWorkspaceLog(ctx, {
        workspaceId,
        category: "tasks",
        type: "task_created",
        message: `Task ${task.taskCode} "${task.title}" created`,
        source: "cli",
      })
    }

    return task
      ? {
          _id: task._id,
          taskCode: task.taskCode,
          title: task.title,
          status: task.status,
          priority: task.priority,
          labels: task.labels,
        }
      : null
  },
})

export const updateTaskStatus = mutation({
  args: {
    apiKey: v.string(),
    taskCode: v.string(),
    status: taskStatusValidator,
    agentName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const keyRecord = await requireCliApiKey(ctx, args.apiKey)
    const workspaceId = keyRecord.workspaceId

    // Update lastUsedAt
    await ctx.db.patch(keyRecord._id, { lastUsedAt: Date.now() })

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect()

    const task = tasks.find(
      (t) => t.taskCode.toLowerCase() === args.taskCode.toLowerCase()
    )
    if (!task) throw new Error(`Task ${args.taskCode} not found`)

    const updates: Partial<Doc<"tasks">> = {
      status: args.status,
      updatedAt: Date.now(),
    }

    // If an agent is updating, set source to track it
    if (args.agentName && !task.source) {
      const cliSource = {
        platform: "cli" as const,
        url: "",
        author: args.agentName,
      }
      updates.source = cliSource
      const existing = task.sources ?? []
      if (!existing.some((s) => s.platform === "cli" && s.author === args.agentName)) {
        updates.sources = [...existing, cliSource]
      }
    }

    await ctx.db.patch(task._id, updates)
    if (args.status !== task.status) {
      await insertWorkspaceLog(ctx, {
        workspaceId,
        category: "tasks",
        type: "task_moved",
        message: `${task.taskCode} moved from "${task.status}" to "${args.status}"`,
        source: "cli",
      })
    }

    // Queue integration syncs
    await ctx.scheduler.runAfter(0, internal.linear.syncTaskToLinearIssue, {
      taskId: task._id,
    })
    await ctx.scheduler.runAfter(0, internal.github.syncTaskToGitHubIssue, {
      taskId: task._id,
    })

    return {
      taskCode: task.taskCode,
      title: task.title,
      previousStatus: task.status,
      newStatus: args.status,
    }
  },
})

// ── Dashboard functions (Clerk auth) ─────────────────────────────────

function generateRandomSecret(): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  const keyLength = 40
  const randomBytes = new Uint8Array(keyLength)
  crypto.getRandomValues(randomBytes)
  return Array.from(randomBytes)
    .map((b) => chars[b % chars.length])
    .join("")
}

function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

// Key format: mdn_<base64url(convexUrl)>.<secret>
// The CLI extracts the URL from the key. The server hashes the full key.
function generateApiKeyWithUrl(convexUrl: string): string {
  const encodedUrl = toBase64Url(convexUrl)
  const secret = generateRandomSecret()
  return `mdn_${encodedUrl}.${secret}`
}

export const generateApiKey = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAdminAccess(ctx, args.workspaceId)

    // Convex server functions have CONVEX_SITE_URL (.convex.site) but
    // ConvexHttpClient needs the .convex.cloud URL. Derive it.
    const siteUrl = process.env.CONVEX_SITE_URL ?? ""
    const convexUrl = siteUrl.replace(".convex.site", ".convex.cloud")
    const plainKey = generateApiKeyWithUrl(convexUrl)
    const keyHash = await sha256(plainKey)
    const keyPrefix = plainKey.slice(0, 16) + "..."

    await ctx.db.insert("cliApiKeys", {
      workspaceId: args.workspaceId,
      keyHash,
      keyPrefix,
      label: args.label.trim(),
      createdByUserId: (await requireIdentity(ctx)).subject,
    })

    return { key: plainKey, keyPrefix }
  },
})

export const listApiKeys = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAdminAccess(ctx, args.workspaceId)

    const keys = await ctx.db
      .query("cliApiKeys")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId)
      )
      .collect()

    return keys
      .filter((k) => !k.revokedAt)
      .map((k) => ({
        _id: k._id,
        keyPrefix: k.keyPrefix,
        label: k.label,
        createdAt: k._creationTime,
        lastUsedAt: k.lastUsedAt ?? null,
      }))
  },
})

export const revokeApiKey = mutation({
  args: {
    keyId: v.id("cliApiKeys"),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId)
    if (!key) throw new Error("API key not found")

    await requireWorkspaceAdminAccess(ctx, key.workspaceId)
    await ctx.db.patch(args.keyId, { revokedAt: Date.now() })
  },
})
