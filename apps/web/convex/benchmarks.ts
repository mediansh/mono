// Public + internal Convex surface for the admin benchmark feature.
//
// - CRUD on the benchmarkable model list (admin-only).
// - Trigger a suite run that fans out one action per (model, suite) pair;
//   each action iterates that suite's fixtures and inserts a benchmarkRuns
//   row per fixture.
// - Aggregated leaderboard query that normalizes speed / TPS / quality
//   across the models in a single suite-run before applying SCORING_WEIGHTS.

import { v } from "convex/values"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server"
import { requireAdmin } from "./admins"
import {
  ALL_SUITES,
  DISCORD_SCAN_FIXTURES,
  FEEDBACK_EXTRACT_FIXTURES,
  TASK_GEN_FIXTURES,
  fixtureCountForSuite,
  type Suite,
} from "./benchmarks/fixtures"
import { buildOpenRouterModel } from "./benchmarks/lib"
import {
  SCORING_WEIGHTS,
  runDiscordScan,
  runFeedbackExtract,
  runTaskGen,
  type SuiteRunPayload,
} from "./benchmarks/suites"

const SUITE_LITERALS = v.union(
  v.literal("discordScan"),
  v.literal("feedbackExtract"),
  v.literal("taskGen")
)

// ---------- Models CRUD ----------

export const listModels = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)
    const rows = await ctx.db.query("benchmarkModels").take(200)
    return rows.sort((a, b) => b.createdAt - a.createdAt)
  },
})

export const addModel = mutation({
  args: {
    slug: v.string(),
    provider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx)

    const slug = args.slug.trim()
    if (!slug) {
      throw new Error("Model slug is required.")
    }

    const provider = args.provider?.trim() || undefined

    const existing = await ctx.db
      .query("benchmarkModels")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique()
    if (existing) {
      throw new Error(`Model "${slug}" is already registered.`)
    }

    return await ctx.db.insert("benchmarkModels", {
      slug,
      provider,
      createdAt: Date.now(),
      createdBy: identity.subject,
    })
  },
})

export const removeModel = mutation({
  args: { id: v.id("benchmarkModels") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const row = await ctx.db.get(args.id)
    if (!row) return
    await ctx.db.delete(args.id)
  },
})

// ---------- Suite-run history ----------

export const listSuiteRuns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100)
    return await ctx.db
      .query("benchmarkSuiteRuns")
      .withIndex("by_started")
      .order("desc")
      .take(limit)
  },
})

// ---------- Aggregated leaderboard ----------

type ModelAggregate = {
  modelSlug: string
  provider?: string
  runCount: number
  errorCount: number
  schemaValidCount: number
  avgTotalMs: number
  avgTtftMs?: number
  avgTps?: number
  qualityBySuite: Partial<Record<Suite, number>>
  qualityOverall: number
  speedScore: number
  tpsScore: number
  qualityScore: number
  compositeScore: number
}

function meanOrUndefined(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

function meanOr0(values: number[]): number {
  return meanOrUndefined(values) ?? 0
}

// Map a value to [0,1] where higher is better. For latency we invert so
// that lower ms produces a higher score.
function normalize(values: number[], higherIsBetter: boolean): number[] {
  if (values.length === 0) return values
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return values.map(() => 1)
  if (higherIsBetter) {
    return values.map((v) => (v - min) / (max - min))
  }
  return values.map((v) => 1 - (v - min) / (max - min))
}

async function loadRunsForSuiteRun(
  ctx: QueryCtx,
  suiteRunId: Id<"benchmarkSuiteRuns">
): Promise<Doc<"benchmarkRuns">[]> {
  const out: Doc<"benchmarkRuns">[] = []
  for await (const row of ctx.db
    .query("benchmarkRuns")
    .withIndex("by_suiteRun", (q) => q.eq("suiteRunId", suiteRunId))) {
    out.push(row)
  }
  return out
}

export const getSuiteRun = query({
  args: { id: v.id("benchmarkSuiteRuns") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const suiteRun = await ctx.db.get(args.id)
    if (!suiteRun) return null

    const runs = await loadRunsForSuiteRun(ctx, args.id)

    // Group by model.
    const byModel = new Map<string, Doc<"benchmarkRuns">[]>()
    for (const run of runs) {
      const list = byModel.get(run.modelSlug) ?? []
      list.push(run)
      byModel.set(run.modelSlug, list)
    }

    const rawAggregates: Array<
      Omit<ModelAggregate, "speedScore" | "tpsScore" | "compositeScore">
    > = []

    for (const model of suiteRun.models) {
      const modelRuns = byModel.get(model.slug) ?? []
      const okRuns = modelRuns.filter((r) => r.status === "ok")
      const errorCount = modelRuns.length - okRuns.length

      const totalMs = okRuns.map((r) => r.totalMs)
      const ttftMs = okRuns
        .map((r) => r.ttftMs)
        .filter((v): v is number => v !== undefined)
      const tps = okRuns
        .map((r) => r.tps)
        .filter((v): v is number => v !== undefined)

      const qualityBySuite: Partial<Record<Suite, number>> = {}
      for (const suite of ALL_SUITES) {
        const suiteRuns = okRuns.filter((r) => r.suite === suite)
        if (suiteRuns.length > 0) {
          qualityBySuite[suite] = meanOr0(
            suiteRuns.map((r) => r.qualityScore)
          )
        }
      }

      const qualityValues = Object.values(qualityBySuite)
      const qualityOverall = meanOr0(qualityValues)

      rawAggregates.push({
        modelSlug: model.slug,
        provider: model.provider,
        runCount: modelRuns.length,
        errorCount,
        schemaValidCount: okRuns.filter((r) => r.schemaValid).length,
        avgTotalMs: meanOr0(totalMs),
        avgTtftMs: meanOrUndefined(ttftMs),
        avgTps: meanOrUndefined(tps),
        qualityBySuite,
        qualityOverall,
        qualityScore: qualityOverall,
      })
    }

    // Normalize speed/tps across models in this run, then apply weights.
    const speedScores = normalize(
      rawAggregates.map((a) => a.avgTotalMs),
      false
    )
    const tpsScores = normalize(
      rawAggregates.map((a) => a.avgTps ?? 0),
      true
    )

    const aggregates: ModelAggregate[] = rawAggregates.map((agg, idx) => {
      const speedScore = speedScores[idx] ?? 0
      const tpsScore = tpsScores[idx] ?? 0
      const compositeScore =
        SCORING_WEIGHTS.speed * speedScore +
        SCORING_WEIGHTS.tps * tpsScore +
        SCORING_WEIGHTS.quality * agg.qualityOverall
      return { ...agg, speedScore, tpsScore, compositeScore }
    })

    aggregates.sort((a, b) => b.compositeScore - a.compositeScore)

    return {
      suiteRun,
      runCount: runs.length,
      aggregates,
      weights: SCORING_WEIGHTS,
    }
  },
})

export const listRunsForSuiteRun = query({
  args: {
    suiteRunId: v.id("benchmarkSuiteRuns"),
    suite: v.optional(SUITE_LITERALS),
    modelSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const runs = await loadRunsForSuiteRun(ctx, args.suiteRunId)
    return runs
      .filter((r) => (args.suite ? r.suite === args.suite : true))
      .filter((r) => (args.modelSlug ? r.modelSlug === args.modelSlug : true))
      .sort((a, b) => {
        if (a.modelSlug !== b.modelSlug)
          return a.modelSlug.localeCompare(b.modelSlug)
        if (a.suite !== b.suite) return a.suite.localeCompare(b.suite)
        return a.fixtureId.localeCompare(b.fixtureId)
      })
  },
})

export const getRun = query({
  args: { id: v.id("benchmarkRuns") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const run = await ctx.db.get(args.id)
    if (!run) return null
    const suiteRun = await ctx.db.get(run.suiteRunId)
    return { run, suiteRun }
  },
})

// ---------- Trigger + worker ----------

export const createSuiteRunRow = internalMutation({
  args: {
    triggeredBy: v.string(),
    models: v.array(
      v.object({
        slug: v.string(),
        provider: v.optional(v.string()),
      })
    ),
    expectedRunCount: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("benchmarkSuiteRuns", {
      status: "running",
      triggeredBy: args.triggeredBy,
      startedAt: Date.now(),
      expectedRunCount: args.expectedRunCount,
      completedRunCount: 0,
      models: args.models,
      suites: [...ALL_SUITES],
    })
  },
})

export const triggerSuiteRun = action({
  args: {},
  handler: async (ctx): Promise<{ suiteRunId: Id<"benchmarkSuiteRuns"> }> => {
    const identity = await ctx.runQuery(
      internal.admins.requireAdminIdentity,
      {}
    )

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured.")
    }

    const models = await ctx.runQuery(internal.benchmarks.listModelsInternal, {})
    if (models.length === 0) {
      throw new Error("Add at least one model before running a benchmark.")
    }

    const fixtureCount = ALL_SUITES.reduce(
      (sum, suite) => sum + fixtureCountForSuite(suite),
      0
    )
    const expectedRunCount = models.length * fixtureCount

    const suiteRunId: Id<"benchmarkSuiteRuns"> = await ctx.runMutation(
      internal.benchmarks.createSuiteRunRow,
      {
        triggeredBy: identity.subject,
        models: models.map((m) => ({ slug: m.slug, provider: m.provider })),
        expectedRunCount,
      }
    )

    for (const model of models) {
      for (const suite of ALL_SUITES) {
        await ctx.scheduler.runAfter(0, internal.benchmarks.runSingle, {
          suiteRunId,
          modelSlug: model.slug,
          provider: model.provider,
          suite,
        })
      }
    }

    return { suiteRunId }
  },
})

// Internal mirror of listModels — usable from actions without an auth check.
// The trigger action gates access via requireAdminIdentity beforehand.
export const listModelsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("benchmarkModels").take(200)
  },
})

export const insertRun = internalMutation({
  args: {
    suiteRunId: v.id("benchmarkSuiteRuns"),
    modelSlug: v.string(),
    provider: v.optional(v.string()),
    suite: SUITE_LITERALS,
    fixtureId: v.string(),
    fixtureLabel: v.string(),
    systemPrompt: v.string(),
    userPrompt: v.string(),
    rawOutput: v.optional(v.string()),
    parsed: v.optional(v.any()),
    schemaValid: v.boolean(),
    parseError: v.optional(v.string()),
    ttftMs: v.optional(v.number()),
    totalMs: v.number(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    tps: v.optional(v.number()),
    expected: v.optional(v.any()),
    correct: v.optional(v.boolean()),
    qualityScore: v.number(),
    scoreBreakdown: v.optional(v.any()),
    status: v.union(v.literal("ok"), v.literal("error")),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("benchmarkRuns", args)

    const suiteRun = await ctx.db.get(args.suiteRunId)
    if (!suiteRun) return

    const completedRunCount = suiteRun.completedRunCount + 1
    const isComplete = completedRunCount >= suiteRun.expectedRunCount

    await ctx.db.patch(args.suiteRunId, {
      completedRunCount,
      status: isComplete ? "complete" : suiteRun.status,
      completedAt: isComplete ? Date.now() : suiteRun.completedAt,
    })
  },
})

export const runSingle = internalAction({
  args: {
    suiteRunId: v.id("benchmarkSuiteRuns"),
    modelSlug: v.string(),
    provider: v.optional(v.string()),
    suite: SUITE_LITERALS,
  },
  handler: async (ctx, args): Promise<null> => {
    const model = buildOpenRouterModel(args.modelSlug, args.provider ?? null)

    const fixtures =
      args.suite === "discordScan"
        ? DISCORD_SCAN_FIXTURES
        : args.suite === "feedbackExtract"
          ? FEEDBACK_EXTRACT_FIXTURES
          : TASK_GEN_FIXTURES

    for (const fixture of fixtures) {
      let result: {
        payload: SuiteRunPayload
        systemPrompt: string
        userPrompt: string
      }

      try {
        if (args.suite === "discordScan") {
          result = await runDiscordScan({
            model,
            fixture: fixture as (typeof DISCORD_SCAN_FIXTURES)[number],
          })
        } else if (args.suite === "feedbackExtract") {
          result = await runFeedbackExtract({
            model,
            fixture: fixture as (typeof FEEDBACK_EXTRACT_FIXTURES)[number],
          })
        } else {
          result = await runTaskGen({
            model,
            fixture: fixture as (typeof TASK_GEN_FIXTURES)[number],
          })
        }
      } catch (error) {
        result = {
          payload: {
            rawOutput: "",
            schemaValid: false,
            totalMs: 0,
            qualityScore: 0,
            scoreBreakdown: {},
            status: "error",
            errorMessage:
              error instanceof Error ? error.message : String(error),
          },
          systemPrompt: "",
          userPrompt: "",
        }
      }

      await ctx.runMutation(internal.benchmarks.insertRun, {
        suiteRunId: args.suiteRunId,
        modelSlug: args.modelSlug,
        provider: args.provider,
        suite: args.suite,
        fixtureId: fixture.id,
        fixtureLabel: fixture.label,
        systemPrompt: result.systemPrompt,
        userPrompt: result.userPrompt,
        rawOutput: result.payload.rawOutput,
        parsed: result.payload.parsed,
        schemaValid: result.payload.schemaValid,
        parseError: result.payload.parseError,
        ttftMs: result.payload.ttftMs,
        totalMs: result.payload.totalMs,
        inputTokens: result.payload.inputTokens,
        outputTokens: result.payload.outputTokens,
        tps: result.payload.tps,
        expected: result.payload.expected,
        correct: result.payload.correct,
        qualityScore: result.payload.qualityScore,
        scoreBreakdown: result.payload.scoreBreakdown,
        status: result.payload.status,
        errorMessage: result.payload.errorMessage,
      })
    }

    return null
  },
})
