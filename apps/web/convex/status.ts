import { httpAction, internalQuery, type QueryCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import { MODULE_LABELS } from "./moduleRuns"

export type ComponentHealth = "operational" | "degraded" | "outage"

const RECENT_WINDOW_MS = 60 * 60 * 1000
const OUTAGE_SINCE_LAST_SUCCESS_MS = 30 * 60 * 1000
const STUCK_RUNNING_MS = 10 * 60 * 1000

const FEEDBACK_MODULES = [
  {
    module: "discord_feedback",
    table: "discordWorkspaceIntegrations" as const,
  },
  {
    module: "slack_feedback",
    table: "slackWorkspaceIntegrations" as const,
  },
  { module: "x_feedback", table: "xWorkspaceIntegrations" as const },
]

type ComponentSnapshot = {
  key: string
  label: string
  status: ComponentHealth
  reason: string
  runsLastHour: number
  successesLastHour: number
  failuresLastHour: number
  failureRate: number
  lastRunAt: number | null
  lastRunStatus: "success" | "failure" | "skipped" | null
  lastSuccessAt: number | null
  lastFailureAt: number | null
  lastError: string | null
  stuckIntegrations: number
  activeIntegrations: number
}

function rank(status: ComponentHealth): number {
  if (status === "outage") return 2
  if (status === "degraded") return 1
  return 0
}

function worst(a: ComponentHealth, b: ComponentHealth): ComponentHealth {
  return rank(a) >= rank(b) ? a : b
}

async function countStuckIntegrations(
  ctx: QueryCtx,
  table: (typeof FEEDBACK_MODULES)[number]["table"],
  now: number
) {
  const rows = await ctx.db.query(table).collect()
  let active = 0
  let stuck = 0
  for (const row of rows) {
    const state = row.feedbackProcessingState
    if (state === "running" || state === "scheduled") active++
    if (
      state === "running" &&
      typeof row.feedbackProcessingStartedAt === "number" &&
      now - row.feedbackProcessingStartedAt > STUCK_RUNNING_MS
    ) {
      stuck++
    }
  }
  return { active, stuck, total: rows.length }
}

async function buildComponentSnapshot(
  ctx: QueryCtx,
  spec: (typeof FEEDBACK_MODULES)[number],
  now: number
): Promise<ComponentSnapshot> {
  const since = now - RECENT_WINDOW_MS

  const recentRuns = await ctx.db
    .query("moduleRuns")
    .withIndex("by_module_finished", (q) =>
      q.eq("module", spec.module).gte("finishedAt", since)
    )
    .collect()

  let successesLastHour = 0
  let failuresLastHour = 0
  for (const run of recentRuns) {
    if (run.status === "success") successesLastHour++
    else if (run.status === "failure") failuresLastHour++
  }
  const runsLastHour = successesLastHour + failuresLastHour
  const failureRate = runsLastHour > 0 ? failuresLastHour / runsLastHour : 0

  const [lastOverall] = await ctx.db
    .query("moduleRuns")
    .withIndex("by_module_finished", (q) => q.eq("module", spec.module))
    .order("desc")
    .take(1)
  const lastRunAt = lastOverall?.finishedAt ?? null
  const lastRunStatus = lastOverall?.status ?? null

  const lastSuccessAt = await findLastByStatus(ctx, spec.module, "success")
  const lastFailureRun = await findLastByStatusWithDoc(
    ctx,
    spec.module,
    "failure"
  )
  const lastFailureAt = lastFailureRun?.finishedAt ?? null
  const lastError = lastFailureRun?.error ?? null

  const integrations = await countStuckIntegrations(ctx, spec.table, now)

  let status: ComponentHealth = "operational"
  let reason = "All recent runs succeeded."

  if (integrations.stuck > 0) {
    status = "degraded"
    reason = `${integrations.stuck} integration(s) stuck in "running" for over ${Math.round(STUCK_RUNNING_MS / 60_000)}m.`
  }

  if (lastRunStatus === "failure") {
    const sinceLastSuccess =
      lastSuccessAt === null ? Number.POSITIVE_INFINITY : now - lastSuccessAt
    if (sinceLastSuccess > OUTAGE_SINCE_LAST_SUCCESS_MS) {
      status = "outage"
      reason =
        lastSuccessAt === null
          ? "Most recent run failed and no recorded successes."
          : `Most recent run failed; no successes in ${Math.round(sinceLastSuccess / 60_000)}m.`
    } else {
      status = worst(status, "degraded")
      if (rank(status) < rank("degraded") || status === "degraded") {
        reason = "Most recent run failed; prior successes within last hour."
      }
    }
  }

  if (runsLastHour >= 3 && failureRate >= 0.5) {
    status = "outage"
    reason = `Failure rate ${Math.round(failureRate * 100)}% over last hour (${failuresLastHour}/${runsLastHour}).`
  } else if (runsLastHour >= 3 && failureRate >= 0.2) {
    const nextStatus = worst(status, "degraded")
    if (rank(nextStatus) > rank(status)) {
      reason = `Failure rate ${Math.round(failureRate * 100)}% over last hour.`
    }
    status = nextStatus
  }

  if (runsLastHour === 0 && integrations.active === 0) {
    if (status === "operational") {
      reason = "No runs in the last hour (no active integrations)."
    }
  }

  return {
    key: spec.module,
    label: MODULE_LABELS[spec.module] ?? spec.module,
    status,
    reason,
    runsLastHour,
    successesLastHour,
    failuresLastHour,
    failureRate,
    lastRunAt,
    lastRunStatus,
    lastSuccessAt,
    lastFailureAt,
    lastError,
    stuckIntegrations: integrations.stuck,
    activeIntegrations: integrations.active,
  }
}

async function findLastByStatusWithDoc(
  ctx: QueryCtx,
  module: string,
  status: "success" | "failure"
) {
  const [row] = await ctx.db
    .query("moduleRuns")
    .withIndex("by_module_status_finished", (q) =>
      q.eq("module", module).eq("status", status)
    )
    .order("desc")
    .take(1)
  return row ?? null
}

async function findLastByStatus(
  ctx: QueryCtx,
  module: string,
  status: "success" | "failure"
): Promise<number | null> {
  const row = await findLastByStatusWithDoc(ctx, module, status)
  return row?.finishedAt ?? null
}

export const getStatusSnapshot = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const components = await Promise.all(
      FEEDBACK_MODULES.map((spec) => buildComponentSnapshot(ctx, spec, now))
    )

    const overall: ComponentHealth = components.reduce<ComponentHealth>(
      (acc, c) => worst(acc, c.status),
      "operational"
    )

    return {
      status: overall,
      checkedAt: now,
      windowMs: RECENT_WINDOW_MS,
      components,
    }
  },
})

const CORS_HEADERS: HeadersInit = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type, accept",
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      ...CORS_HEADERS,
    },
  })
}

function httpStatusFor(status: ComponentHealth): number {
  if (status === "outage") return 503
  return 200
}

function formatSnapshot(snapshot: {
  status: ComponentHealth
  checkedAt: number
  windowMs: number
  components: ComponentSnapshot[]
}) {
  return {
    status: snapshot.status,
    checked_at: new Date(snapshot.checkedAt).toISOString(),
    window_seconds: Math.round(snapshot.windowMs / 1000),
    summary: summarize(snapshot),
    components: snapshot.components.map((c) => ({
      key: c.key,
      label: c.label,
      status: c.status,
      // `reason` is derived from aggregate counts and timing only — see
      // buildComponentSnapshot. Raw error strings from workpool failures
      // are intentionally NOT surfaced on this unauthenticated endpoint;
      // admins see them on the Observability dashboard via
      // api.moduleRuns.adminRecentFailures.
      reason: c.reason,
      last_run_at: c.lastRunAt
        ? new Date(c.lastRunAt).toISOString()
        : null,
      last_run_status: c.lastRunStatus,
      last_success_at: c.lastSuccessAt
        ? new Date(c.lastSuccessAt).toISOString()
        : null,
      last_failure_at: c.lastFailureAt
        ? new Date(c.lastFailureAt).toISOString()
        : null,
      runs_last_hour: c.runsLastHour,
      successes_last_hour: c.successesLastHour,
      failures_last_hour: c.failuresLastHour,
      failure_rate_last_hour: Math.round(c.failureRate * 10000) / 10000,
      active_integrations: c.activeIntegrations,
      stuck_integrations: c.stuckIntegrations,
    })),
  }
}

function summarize(snapshot: {
  status: ComponentHealth
  components: ComponentSnapshot[]
}): string {
  if (snapshot.status === "operational") {
    return "All systems operational."
  }
  const bad = snapshot.components.filter((c) => c.status !== "operational")
  const grouped = bad.map((c) => `${c.label} (${c.status})`).join(", ")
  return snapshot.status === "outage"
    ? `Outage: ${grouped}.`
    : `Degraded: ${grouped}.`
}

export const statusEndpoint = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  const url = new URL(request.url)
  const componentKey = url.searchParams.get("component")

  try {
    const snapshot = await ctx.runQuery(internal.status.getStatusSnapshot, {})

    if (componentKey) {
      const match = snapshot.components.find((c) => c.key === componentKey)
      if (!match) {
        return jsonResponse(
          { error: `Unknown component '${componentKey}'` },
          404
        )
      }
      const body = formatSnapshot({
        ...snapshot,
        status: match.status,
        components: [match],
      })
      return jsonResponse(body, httpStatusFor(match.status))
    }

    return jsonResponse(formatSnapshot(snapshot), httpStatusFor(snapshot.status))
  } catch (error) {
    // Log the full error server-side for operators, but never echo it
    // back on this unauthenticated endpoint.
    console.error("[status] snapshot query failed:", error)
    return jsonResponse(
      {
        status: "outage" satisfies ComponentHealth,
        checked_at: new Date().toISOString(),
        error: "Status check failed",
      },
      500
    )
  }
})
