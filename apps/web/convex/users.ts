import { v } from "convex/values"
import { query, type QueryCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { requireAdmin, isAdmin as isAdminCheck } from "./admins"

type UserSummary = {
  userId: string
  name: string | null
  email: string | null
  imageUrl: string | null
  isAdmin: boolean
  workspaceCount: number
  ownedWorkspaceCount: number
  firstSeenAt: number
  lastSeenAt: number
  hasEarlyAccess: boolean
}

async function buildUserIndex(ctx: QueryCtx) {
  const [members, admins, redemptions, workspaces] = await Promise.all([
    ctx.db.query("workspaceMembers").collect(),
    ctx.db.query("admins").collect(),
    ctx.db.query("earlyAccessRedemptions").collect(),
    ctx.db.query("workspaces").collect(),
  ])

  const index = new Map<string, UserSummary>()
  const ensure = (userId: string): UserSummary => {
    let entry = index.get(userId)
    if (!entry) {
      entry = {
        userId,
        name: null,
        email: null,
        imageUrl: null,
        isAdmin: false,
        workspaceCount: 0,
        ownedWorkspaceCount: 0,
        firstSeenAt: Number.POSITIVE_INFINITY,
        lastSeenAt: 0,
        hasEarlyAccess: false,
      }
      index.set(userId, entry)
    }
    return entry
  }

  for (const m of members) {
    const e = ensure(m.userId)
    e.name = m.name ?? e.name
    e.email = m.email ?? e.email
    e.imageUrl = m.imageUrl ?? e.imageUrl
    e.workspaceCount++
    if (m._creationTime < e.firstSeenAt) e.firstSeenAt = m._creationTime
    if (m._creationTime > e.lastSeenAt) e.lastSeenAt = m._creationTime
  }
  for (const w of workspaces) {
    const e = ensure(w.ownerId)
    e.ownedWorkspaceCount++
    if (w._creationTime < e.firstSeenAt) e.firstSeenAt = w._creationTime
    if (w._creationTime > e.lastSeenAt) e.lastSeenAt = w._creationTime
  }
  for (const a of admins) {
    const e = ensure(a.userId)
    e.isAdmin = true
    if (a.addedAt < e.firstSeenAt) e.firstSeenAt = a.addedAt
    if (a.addedAt > e.lastSeenAt) e.lastSeenAt = a.addedAt
  }
  for (const r of redemptions) {
    const e = ensure(r.userId)
    e.hasEarlyAccess = true
    if (r.email && !e.email) e.email = r.email
    if (r.name && !e.name) e.name = r.name
    if (r.redeemedAt < e.firstSeenAt) e.firstSeenAt = r.redeemedAt
    if (r.redeemedAt > e.lastSeenAt) e.lastSeenAt = r.redeemedAt
  }
  for (const e of index.values()) {
    if (!Number.isFinite(e.firstSeenAt)) e.firstSeenAt = 0
  }
  return index
}

export const adminListUsers = query({
  args: {
    search: v.optional(v.string()),
    sort: v.optional(
      v.union(
        v.literal("last_seen"),
        v.literal("first_seen"),
        v.literal("workspaces"),
        v.literal("name")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const index = await buildUserIndex(ctx)
    let rows = Array.from(index.values())

    const search = args.search?.trim().toLowerCase() ?? ""
    if (search) {
      rows = rows.filter(
        (r) =>
          r.userId.toLowerCase().includes(search) ||
          (r.email ?? "").toLowerCase().includes(search) ||
          (r.name ?? "").toLowerCase().includes(search)
      )
    }

    const sort = args.sort ?? "last_seen"
    rows.sort((a, b) => {
      switch (sort) {
        case "last_seen":
          return b.lastSeenAt - a.lastSeenAt
        case "first_seen":
          return b.firstSeenAt - a.firstSeenAt
        case "workspaces":
          return b.workspaceCount - a.workspaceCount
        case "name":
          return (a.name ?? a.email ?? a.userId).localeCompare(
            b.name ?? b.email ?? b.userId
          )
      }
    })

    const limit = Math.min(500, Math.max(1, args.limit ?? 200))
    return {
      total: rows.length,
      rows: rows.slice(0, limit),
    }
  },
})

export const adminGetUser = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const userId = args.userId

    const [members, adminRow, redemptions, ownedWorkspaces, keysByUser] =
      await Promise.all([
        ctx.db
          .query("workspaceMembers")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
        ctx.db
          .query("admins")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .unique(),
        ctx.db
          .query("earlyAccessRedemptions")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
        ctx.db
          .query("workspaces")
          .withIndex("by_owner", (q) => q.eq("ownerId", userId))
          .collect(),
        ctx.db
          .query("cliApiKeys")
          .withIndex("by_created_by", (q) => q.eq("createdByUserId", userId))
          .collect(),
      ])

    const memberships = await Promise.all(
      members.map(async (m) => {
        const ws = await ctx.db.get(m.workspaceId)
        return {
          _id: m._id,
          workspaceId: m.workspaceId,
          workspaceName: ws?.name ?? "(deleted)",
          workspacePrefix: ws?.prefix,
          role: m.role,
          joinedAt: m._creationTime,
          name: m.name,
          email: m.email,
          imageUrl: m.imageUrl,
        }
      })
    )

    const TASK_COUNT_CAP = 500
    const taskCounts = await Promise.all(
      ownedWorkspaces.map(async (w) => {
        const sample = await ctx.db
          .query("tasks")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", w._id))
          .take(TASK_COUNT_CAP + 1)
        return {
          workspaceId: w._id,
          count: Math.min(sample.length, TASK_COUNT_CAP),
          hasMore: sample.length > TASK_COUNT_CAP,
        }
      })
    )

    const keysByWorkspace = (
      await Promise.all(
        ownedWorkspaces.map((w) =>
          ctx.db
            .query("cliApiKeys")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", w._id))
            .collect()
        )
      )
    ).flat()
    const seenKeyIds = new Set<string>()
    const userKeys: typeof keysByUser = []
    for (const k of [...keysByUser, ...keysByWorkspace]) {
      if (seenKeyIds.has(k._id)) continue
      seenKeyIds.add(k._id)
      userKeys.push(k)
    }

    const name =
      members[0]?.name ??
      redemptions[0]?.name ??
      null
    const email =
      members[0]?.email ??
      redemptions[0]?.email ??
      null
    const imageUrl = members[0]?.imageUrl ?? null
    const firstSeenAt = Math.min(
      ...[
        ...members.map((m) => m._creationTime),
        ...ownedWorkspaces.map((w) => w._creationTime),
        ...redemptions.map((r) => r.redeemedAt),
        adminRow?.addedAt ?? Number.POSITIVE_INFINITY,
      ].filter((n) => Number.isFinite(n))
    )
    const lastSeenAt = Math.max(
      0,
      ...members.map((m) => m._creationTime),
      ...ownedWorkspaces.map((w) => w._creationTime),
      ...redemptions.map((r) => r.redeemedAt),
      adminRow?.addedAt ?? 0
    )

    return {
      userId,
      name,
      email,
      imageUrl,
      isAdmin: !!adminRow,
      adminNote: adminRow?.note,
      adminSince: adminRow?.addedAt ?? null,
      firstSeenAt: Number.isFinite(firstSeenAt) ? firstSeenAt : 0,
      lastSeenAt,
      memberships: memberships.sort((a, b) => b.joinedAt - a.joinedAt),
      ownedWorkspaces: ownedWorkspaces.map((w) => {
        const counted = taskCounts.find((t) => t.workspaceId === w._id)
        return {
          _id: w._id,
          name: w.name,
          prefix: w.prefix,
          createdAt: w._creationTime,
          taskCount: counted?.count ?? 0,
          taskCountCapped: counted?.hasMore ?? false,
        }
      }),
      redemptions: redemptions.map((r) => ({
        _id: r._id,
        code: r.code,
        redeemedAt: r.redeemedAt,
        scaleAttachedAt: r.scaleAttachedAt ?? null,
        scaleRemovedAt: r.scaleRemovedAt ?? null,
      })),
      cliApiKeys: userKeys.map((k) => ({
        _id: k._id,
        workspaceId: k.workspaceId,
        label: k.label,
        keyPrefix: k.keyPrefix,
        createdAt: k._creationTime,
        lastUsedAt: k.lastUsedAt ?? null,
        revokedAt: k.revokedAt ?? null,
      })),
    }
  },
})

function pickBucketMs(windowMs: number): number {
  if (windowMs <= 60 * 60 * 1000) return 5 * 60 * 1000
  if (windowMs <= 24 * 60 * 60 * 1000) return 60 * 60 * 1000
  if (windowMs <= 7 * 24 * 60 * 60 * 1000) return 6 * 60 * 60 * 1000
  return 24 * 60 * 60 * 1000
}

const LOG_CATEGORIES = [
  "tasks",
  "webhooks",
  "integrations",
  "members",
] as const

export const adminGetUserActivitySeries = query({
  args: {
    userId: v.string(),
    windowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const windowMs = args.windowMs ?? 7 * 24 * 60 * 60 * 1000
    const bucketMs = pickBucketMs(windowMs)
    const now = Date.now()
    const since = now - windowMs

    const ownedWorkspaces = await ctx.db
      .query("workspaces")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
      .collect()

    const logsPerWorkspace = await Promise.all(
      ownedWorkspaces.map((w) =>
        ctx.db
          .query("workspaceLogs")
          .withIndex("by_workspace_timestamp", (q) =>
            q.eq("workspaceId", w._id).gte("timestamp", since)
          )
          .collect()
      )
    )

    const logs = logsPerWorkspace.flat()
    const alignedStart = Math.floor(since / bucketMs) * bucketMs
    const bucketCount = Math.ceil((now - alignedStart) / bucketMs)

    type Bucket = {
      timestamp: number
      total: number
      byCategory: Record<string, number>
    }
    const buckets: Bucket[] = []
    for (let i = 0; i < bucketCount; i++) {
      const byCategory: Record<string, number> = {}
      for (const c of LOG_CATEGORIES) byCategory[c] = 0
      buckets.push({
        timestamp: alignedStart + i * bucketMs,
        total: 0,
        byCategory,
      })
    }

    const byType: Record<string, number> = {}

    for (const log of logs) {
      const idx = Math.floor((log.timestamp - alignedStart) / bucketMs)
      if (idx < 0 || idx >= buckets.length) continue
      const b = buckets[idx]!
      b.total++
      b.byCategory[log.category] = (b.byCategory[log.category] ?? 0) + 1
      byType[log.type] = (byType[log.type] ?? 0) + 1
    }

    return {
      windowMs,
      bucketMs,
      buckets,
      totalLogs: logs.length,
      byType,
      categories: [...LOG_CATEGORIES],
      ownedWorkspaceCount: ownedWorkspaces.length,
    }
  },
})

export const adminIsCurrentUserSelf = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return false
    if (!(await isAdminCheck(ctx, identity.subject))) return false
    return identity.subject === args.userId
  },
})

export type { Doc, Id }
