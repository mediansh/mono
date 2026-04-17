import { v } from "convex/values"
import {
  internalMutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { requireAdmin } from "./admins"

const MODULES = [
  "discord_feedback",
  "slack_feedback",
  "x_feedback",
] as const

export const MODULE_LABELS: Record<string, string> = {
  discord_feedback: "Discord feedback",
  slack_feedback: "Slack feedback",
  x_feedback: "X feedback",
}

export const KNOWN_MODULES = MODULES

type RunStatus = "success" | "failure" | "skipped"

type RecordRunArgs = {
  module: string
  operation: string
  status: RunStatus
  durationMs?: number
  error?: string | null
  workspaceId?: Id<"workspaces">
  metadata?: {
    integrationId?: string
    itemsProcessed?: number
    itemsSkipped?: number
    reason?: string
  }
  startedAt?: number
}

export async function recordRunDirect(ctx: MutationCtx, args: RecordRunArgs) {
  const finishedAt = Date.now()
  const startedAt = args.startedAt ?? finishedAt
  const computedDuration = Math.max(0, finishedAt - startedAt)
  const error = args.error
    ? args.error.length > 500
      ? args.error.slice(0, 500)
      : args.error
    : undefined
  await ctx.db.insert("moduleRuns", {
    module: args.module,
    operation: args.operation,
    status: args.status,
    durationMs: args.durationMs ?? computedDuration,
    error,
    workspaceId: args.workspaceId,
    metadata: args.metadata,
    startedAt,
    finishedAt,
  })
}

export const recordRun = internalMutation({
  args: {
    module: v.string(),
    operation: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("failure"),
      v.literal("skipped")
    ),
    durationMs: v.optional(v.number()),
    error: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    metadata: v.optional(
      v.object({
        integrationId: v.optional(v.string()),
        itemsProcessed: v.optional(v.number()),
        itemsSkipped: v.optional(v.number()),
        reason: v.optional(v.string()),
      })
    ),
    startedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await recordRunDirect(ctx, {
      module: args.module,
      operation: args.operation,
      status: args.status,
      durationMs: args.durationMs,
      error: args.error,
      workspaceId: args.workspaceId,
      metadata: args.metadata,
      startedAt: args.startedAt,
    })
  },
})

async function collectSince(ctx: QueryCtx, sinceMs: number) {
  return await ctx.db
    .query("moduleRuns")
    .withIndex("by_finished", (q) => q.gte("finishedAt", sinceMs))
    .collect()
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length))
  )
  return sorted[idx] ?? null
}

export const adminMetrics = query({
  args: {
    windowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const windowMs = args.windowMs ?? 24 * 60 * 60 * 1000
    const since = Date.now() - windowMs
    const runs = await collectSince(ctx, since)

    const byModule = new Map<
      string,
      {
        module: string
        total: number
        success: number
        failure: number
        skipped: number
        durations: number[]
        lastFinishedAt: number
      }
    >()

    for (const mod of MODULES) {
      byModule.set(mod, {
        module: mod,
        total: 0,
        success: 0,
        failure: 0,
        skipped: 0,
        durations: [],
        lastFinishedAt: 0,
      })
    }

    let total = 0
    let success = 0
    let failure = 0
    let skipped = 0

    for (const run of runs) {
      total++
      if (run.status === "success") success++
      else if (run.status === "failure") failure++
      else skipped++

      const bucket =
        byModule.get(run.module) ??
        byModule
          .set(run.module, {
            module: run.module,
            total: 0,
            success: 0,
            failure: 0,
            skipped: 0,
            durations: [],
            lastFinishedAt: 0,
          })
          .get(run.module)!

      bucket.total++
      if (run.status === "success") bucket.success++
      else if (run.status === "failure") bucket.failure++
      else bucket.skipped++
      if (typeof run.durationMs === "number") bucket.durations.push(run.durationMs)
      if (run.finishedAt > bucket.lastFinishedAt) bucket.lastFinishedAt = run.finishedAt
    }

    const modules = Array.from(byModule.values())
      .filter((m) => m.total > 0 || MODULES.includes(m.module as (typeof MODULES)[number]))
      .map((m) => ({
        module: m.module,
        label: MODULE_LABELS[m.module] ?? m.module,
        total: m.total,
        success: m.success,
        failure: m.failure,
        skipped: m.skipped,
        failureRate: m.total > 0 ? m.failure / m.total : 0,
        avgDurationMs:
          m.durations.length > 0
            ? Math.round(
                m.durations.reduce((a, b) => a + b, 0) / m.durations.length
              )
            : null,
        p95DurationMs: percentile(m.durations, 95),
        lastFinishedAt: m.lastFinishedAt || null,
      }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))

    return {
      windowMs,
      total,
      success,
      failure,
      skipped,
      failureRate: total > 0 ? failure / total : 0,
      modules,
    }
  },
})

function pickBucketMs(windowMs: number): number {
  if (windowMs <= 60 * 60 * 1000) return 5 * 60 * 1000 // 1h → 5m buckets
  if (windowMs <= 24 * 60 * 60 * 1000) return 60 * 60 * 1000 // 24h → 1h buckets
  if (windowMs <= 7 * 24 * 60 * 60 * 1000) return 6 * 60 * 60 * 1000 // 7d → 6h
  return 24 * 60 * 60 * 1000
}

export const adminRunsSeries = query({
  args: {
    windowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const windowMs = args.windowMs ?? 24 * 60 * 60 * 1000
    const bucketMs = pickBucketMs(windowMs)
    const now = Date.now()
    const since = now - windowMs
    const alignedStart = Math.floor(since / bucketMs) * bucketMs
    const bucketCount = Math.ceil((now - alignedStart) / bucketMs)

    const runs = await collectSince(ctx, since)

    type Bucket = {
      timestamp: number
      success: number
      failure: number
      skipped: number
      total: number
      modules: Record<string, { success: number; failure: number; total: number }>
    }

    const buckets: Bucket[] = []
    for (let i = 0; i < bucketCount; i++) {
      const modules: Record<
        string,
        { success: number; failure: number; total: number }
      > = {}
      for (const mod of MODULES) {
        modules[mod] = { success: 0, failure: 0, total: 0 }
      }
      buckets.push({
        timestamp: alignedStart + i * bucketMs,
        success: 0,
        failure: 0,
        skipped: 0,
        total: 0,
        modules,
      })
    }

    for (const run of runs) {
      const idx = Math.floor((run.finishedAt - alignedStart) / bucketMs)
      if (idx < 0 || idx >= buckets.length) continue
      const b = buckets[idx]!
      b.total++
      if (run.status === "success") b.success++
      else if (run.status === "failure") b.failure++
      else b.skipped++

      const byModule = (b.modules[run.module] ??= {
        success: 0,
        failure: 0,
        total: 0,
      })
      byModule.total++
      if (run.status === "success") byModule.success++
      else if (run.status === "failure") byModule.failure++
    }

    return {
      windowMs,
      bucketMs,
      buckets: buckets.map((b) => ({
        timestamp: b.timestamp,
        success: b.success,
        failure: b.failure,
        skipped: b.skipped,
        total: b.total,
        failureRate: b.total > 0 ? b.failure / b.total : 0,
        byModule: b.modules,
      })),
      modules: [...MODULES].map((m) => ({
        module: m,
        label: MODULE_LABELS[m] ?? m,
      })),
    }
  },
})

export const adminRecentFailures = query({
  args: {
    limit: v.optional(v.number()),
    windowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const limit = Math.min(50, Math.max(1, args.limit ?? 20))
    const windowMs = args.windowMs ?? 24 * 60 * 60 * 1000
    const since = Date.now() - windowMs
    const rows = await ctx.db
      .query("moduleRuns")
      .withIndex("by_status_finished", (q) =>
        q.eq("status", "failure").gte("finishedAt", since)
      )
      .order("desc")
      .take(limit)
    return rows.map((r) => ({
      _id: r._id,
      module: r.module,
      moduleLabel: MODULE_LABELS[r.module] ?? r.module,
      operation: r.operation,
      error: r.error ?? "(no error message)",
      durationMs: r.durationMs,
      finishedAt: r.finishedAt,
      workspaceId: r.workspaceId,
    }))
  },
})
