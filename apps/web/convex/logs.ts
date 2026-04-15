import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { internalMutation, query, type MutationCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { requireWorkspaceAccess } from "./permissions"

export const workspaceLogCategoryValidator = v.union(
  v.literal("tasks"),
  v.literal("webhooks"),
  v.literal("integrations"),
  v.literal("members")
)

export const workspaceLogTypeValidator = v.union(
  v.literal("task_created"),
  v.literal("task_moved"),
  v.literal("task_updated"),
  v.literal("task_deleted"),
  v.literal("tasks_generated_ai"),
  v.literal("request_accepted"),
  v.literal("request_denied"),
  v.literal("integration_connected"),
  v.literal("integration_disconnected"),
  v.literal("webhook_received"),
  v.literal("webhook_error"),
  v.literal("member_joined"),
  v.literal("member_removed"),
  v.literal("labels_saved"),
  v.literal("feedback_processed")
)

export const workspaceLogSourceValidator = v.union(
  v.literal("discord"),
  v.literal("slack"),
  v.literal("github"),
  v.literal("linear"),
  v.literal("x"),
  v.literal("cli"),
  v.literal("manual"),
  v.literal("ai")
)

const workspaceLogFilterValidator = v.union(
  v.literal("all"),
  v.literal("tasks"),
  v.literal("ai"),
  v.literal("webhooks"),
  v.literal("integrations"),
  v.literal("members")
)

type WorkspaceLogCategory =
  | "tasks"
  | "webhooks"
  | "integrations"
  | "members"

type WorkspaceLogInput = {
  workspaceId: Id<"workspaces">
  category: WorkspaceLogCategory
  type:
    | "task_created"
    | "task_moved"
    | "task_updated"
    | "task_deleted"
    | "tasks_generated_ai"
    | "request_accepted"
    | "request_denied"
    | "integration_connected"
    | "integration_disconnected"
    | "webhook_received"
    | "webhook_error"
    | "member_joined"
    | "member_removed"
    | "labels_saved"
    | "feedback_processed"
  message: string
  source?: "discord" | "slack" | "github" | "linear" | "x" | "cli" | "manual" | "ai"
  cost?: number
  timestamp?: number
}

type WorkspaceLogMetricsCounts = Record<WorkspaceLogCategory, number>

function emptyMetricsCounts(): WorkspaceLogMetricsCounts {
  return {
    tasks: 0,
    webhooks: 0,
    integrations: 0,
    members: 0,
  }
}

function startOfDay(timestamp: number) {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

async function applyMetricIncrements(
  ctx: Pick<MutationCtx, "db">,
  workspaceId: Id<"workspaces">,
  counts: WorkspaceLogMetricsCounts
) {
  const totalCount =
    counts.tasks + counts.webhooks + counts.integrations + counts.members
  if (totalCount === 0) {
    return
  }

  const existing = await ctx.db
    .query("workspaceLogMetrics")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .unique()

  if (!existing) {
    await ctx.db.insert("workspaceLogMetrics", {
      workspaceId,
      totalCount,
      taskCount: counts.tasks,
      webhookCount: counts.webhooks,
      integrationCount: counts.integrations,
      memberCount: counts.members,
    })
    return
  }

  await ctx.db.patch(existing._id, {
    totalCount: existing.totalCount + totalCount,
    taskCount: existing.taskCount + counts.tasks,
    webhookCount: existing.webhookCount + counts.webhooks,
    integrationCount: existing.integrationCount + counts.integrations,
    memberCount: existing.memberCount + counts.members,
  })
}

async function getWorkspaceCreationTimes(
  ctx: Pick<MutationCtx, "db">,
  workspaceIds: Id<"workspaces">[]
) {
  const creationTimes = new Map<Id<"workspaces">, number>()

  for (const workspaceId of workspaceIds) {
    const workspace = await ctx.db.get(workspaceId)
    if (!workspace) {
      throw new Error(`Cannot record log for missing workspace ${workspaceId}`)
    }
    creationTimes.set(workspaceId, workspace._creationTime)
  }

  return creationTimes
}

export async function insertWorkspaceLogs(
  ctx: Pick<MutationCtx, "db">,
  logs: WorkspaceLogInput[]
) {
  if (logs.length === 0) {
    return
  }

  const workspaceCreationTimes = await getWorkspaceCreationTimes(
    ctx,
    Array.from(new Set(logs.map((log) => log.workspaceId)))
  )
  const metricsByWorkspace = new Map<Id<"workspaces">, WorkspaceLogMetricsCounts>()

  for (const log of logs) {
    const timestamp = log.timestamp ?? Date.now()
    const workspaceCreatedAt = workspaceCreationTimes.get(log.workspaceId)
    if (workspaceCreatedAt === undefined) {
      throw new Error(`Missing workspace creation time for ${log.workspaceId}`)
    }
    if (timestamp < workspaceCreatedAt) {
      throw new Error(
        `Refusing to record log before workspace creation for ${log.workspaceId}`
      )
    }

    await ctx.db.insert("workspaceLogs", {
      workspaceId: log.workspaceId,
      category: log.category,
      type: log.type,
      message: log.message,
      source: log.source,
      cost: log.cost,
      timestamp,
    })

    const workspaceMetrics =
      metricsByWorkspace.get(log.workspaceId) ?? emptyMetricsCounts()
    workspaceMetrics[log.category] += 1
    metricsByWorkspace.set(log.workspaceId, workspaceMetrics)
  }

  for (const [workspaceId, counts] of metricsByWorkspace) {
    await applyMetricIncrements(ctx, workspaceId, counts)
  }
}

export async function insertWorkspaceLog(
  ctx: Pick<MutationCtx, "db">,
  log: WorkspaceLogInput
) {
  await insertWorkspaceLogs(ctx, [log])
}

export const recordWorkspaceLog = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    category: workspaceLogCategoryValidator,
    type: workspaceLogTypeValidator,
    message: v.string(),
    source: v.optional(workspaceLogSourceValidator),
    cost: v.optional(v.number()),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await insertWorkspaceLog(ctx, args)
  },
})

export const recordWorkspaceLogs = internalMutation({
  args: {
    logs: v.array(
      v.object({
        workspaceId: v.id("workspaces"),
        category: workspaceLogCategoryValidator,
        type: workspaceLogTypeValidator,
        message: v.string(),
        source: v.optional(workspaceLogSourceValidator),
        cost: v.optional(v.number()),
        timestamp: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await insertWorkspaceLogs(ctx, args.logs)
  },
})

const AI_LOG_TYPES = new Set(["tasks_generated_ai", "feedback_processed"])

export const listWorkspaceLogs = query({
  args: {
    workspaceId: v.id("workspaces"),
    filter: workspaceLogFilterValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { membership } = await requireWorkspaceAccess(ctx, args.workspaceId)
    const visibleSince = membership._creationTime

    if (args.filter === "all") {
      return await ctx.db
        .query("workspaceLogs")
        .withIndex("by_workspace_timestamp", (q) =>
          q.eq("workspaceId", args.workspaceId).gte("timestamp", visibleSince)
        )
        .order("desc")
        .paginate(args.paginationOpts)
    }

    if (args.filter === "ai") {
      return await ctx.db
        .query("workspaceLogs")
        .withIndex("by_workspace_category_timestamp", (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("category", "tasks")
            .gte("timestamp", visibleSince)
        )
        .filter((q) =>
          q.or(
            q.eq(q.field("type"), "tasks_generated_ai"),
            q.eq(q.field("type"), "feedback_processed")
          )
        )
        .order("desc")
        .paginate(args.paginationOpts)
    }

    const category = args.filter as WorkspaceLogCategory

    return await ctx.db
      .query("workspaceLogs")
      .withIndex("by_workspace_category_timestamp", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("category", category)
          .gte("timestamp", visibleSince)
      )
      .order("desc")
      .paginate(args.paginationOpts)
  },
})

export const getWorkspaceLogDashboard = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireWorkspaceAccess(ctx, args.workspaceId)
    const visibleSince = membership._creationTime

    const todayStart = startOfDay(Date.now())
    const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000
    const recentWindowStart = Math.max(weekStart, visibleSince)
    const recentLogs = await ctx.db
      .query("workspaceLogs")
      .withIndex("by_workspace_timestamp", (q) =>
        q.eq("workspaceId", args.workspaceId).gte("timestamp", recentWindowStart)
      )
      .collect()
    const visibleLogs = await ctx.db
      .query("workspaceLogs")
      .withIndex("by_workspace_timestamp", (q) =>
        q.eq("workspaceId", args.workspaceId).gte("timestamp", visibleSince)
      )
      .collect()

    const activityBuckets = new Map<number, { tasks: number; webhooks: number; events: number }>()
    for (let offset = 0; offset < 7; offset += 1) {
      activityBuckets.set(weekStart + offset * 24 * 60 * 60 * 1000, {
        tasks: 0,
        webhooks: 0,
        events: 0,
      })
    }

    const sourceCounts = {
      discord: 0,
      slack: 0,
      github: 0,
      linear: 0,
      x: 0,
      cli: 0,
    }

    const webhookCounts = {
      discord: { processed: 0, errors: 0 },
      slack: { processed: 0, errors: 0 },
      github: { processed: 0, errors: 0 },
      linear: { processed: 0, errors: 0 },
      x: { processed: 0, errors: 0 },
    }

    const visibleCounts = {
      all: 0,
      tasks: 0,
      ai: 0,
      webhooks: 0,
      integrations: 0,
      members: 0,
    }

    for (const log of visibleLogs) {
      visibleCounts.all += 1
      if (log.category === "tasks") {
        visibleCounts.tasks += 1
      }
      if (log.category === "webhooks") {
        visibleCounts.webhooks += 1
      }
      if (log.category === "integrations") {
        visibleCounts.integrations += 1
      }
      if (log.category === "members") {
        visibleCounts.members += 1
      }
      if (AI_LOG_TYPES.has(log.type)) {
        visibleCounts.ai += 1
      }

      if (log.source && log.source in sourceCounts) {
        sourceCounts[log.source as keyof typeof sourceCounts] += 1
      }

      if (
        log.category === "webhooks" &&
        log.source &&
        log.source in webhookCounts
      ) {
        if (log.type === "webhook_error") {
          webhookCounts[log.source as keyof typeof webhookCounts].errors += 1
        } else {
          webhookCounts[log.source as keyof typeof webhookCounts].processed += 1
        }
      }
    }

    for (const log of recentLogs) {
      const bucketStart = startOfDay(log.timestamp)
      const bucket = activityBuckets.get(bucketStart)
      if (!bucket) {
        continue
      }

      bucket.events += 1
      if (log.category === "tasks") {
        bucket.tasks += 1
      }
      if (log.category === "webhooks") {
        bucket.webhooks += 1
      }
    }

    return {
      counts: {
        all: visibleCounts.all,
        tasks: visibleCounts.tasks,
        ai: visibleCounts.ai,
        webhooks: visibleCounts.webhooks,
        integrations: visibleCounts.integrations,
        members: visibleCounts.members,
      },
      activityData: Array.from(activityBuckets.entries()).map(([timestamp, counts]) => ({
        day: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(
          new Date(timestamp)
        ),
        tasks: counts.tasks,
        webhooks: counts.webhooks,
        events: counts.events,
      })),
      sourceDistribution: [
        { name: "Discord", value: sourceCounts.discord },
        { name: "Slack", value: sourceCounts.slack },
        { name: "GitHub", value: sourceCounts.github },
        { name: "Linear", value: sourceCounts.linear },
        { name: "X", value: sourceCounts.x },
        { name: "CLI", value: sourceCounts.cli },
      ],
      webhooksByPlatform: [
        {
          platform: "Discord",
          received: webhookCounts.discord.processed + webhookCounts.discord.errors,
          processed: webhookCounts.discord.processed,
          errors: webhookCounts.discord.errors,
        },
        {
          platform: "Slack",
          received: webhookCounts.slack.processed + webhookCounts.slack.errors,
          processed: webhookCounts.slack.processed,
          errors: webhookCounts.slack.errors,
        },
        {
          platform: "GitHub",
          received: webhookCounts.github.processed + webhookCounts.github.errors,
          processed: webhookCounts.github.processed,
          errors: webhookCounts.github.errors,
        },
        {
          platform: "Linear",
          received: webhookCounts.linear.processed + webhookCounts.linear.errors,
          processed: webhookCounts.linear.processed,
          errors: webhookCounts.linear.errors,
        },
        {
          platform: "X",
          received: webhookCounts.x.processed + webhookCounts.x.errors,
          processed: webhookCounts.x.processed,
          errors: webhookCounts.x.errors,
        },
      ],
    }
  },
})
