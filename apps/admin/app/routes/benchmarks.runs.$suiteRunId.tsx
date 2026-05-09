import { useState } from "react"
import { Link, useParams } from "react-router"
import { useMutation, useQuery } from "convex/react"
import { motion } from "motion/react"
import {
  ArrowLeft,
  CaretDown,
  CaretRight,
  Trophy,
  WarningCircle,
} from "@phosphor-icons/react"

import { api, type Id } from "~/lib/convex"
import { fadeUp, stagger } from "~/lib/utils"

const SUITE_LABELS = {
  discordScan: "Discord scan",
  feedbackExtract: "Feedback extract",
  taskGen: "Task gen",
} as const

const SUITE_DESCRIPTIONS = {
  discordScan: "Classify Discord messages as actionable feedback",
  feedbackExtract: "Pull task actions out of feedback threads",
  taskGen: "Generate tasks from a free-form prompt",
} as const

type SuiteKey = keyof typeof SUITE_LABELS

function formatMs(ms?: number | null) {
  if (ms === undefined || ms === null || Number.isNaN(ms)) return "—"
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function formatTps(tps?: number | null) {
  if (tps === undefined || tps === null || Number.isNaN(tps)) return "—"
  return `${tps.toFixed(0)} tok/s`
}

function formatPct(value: number) {
  return `${(value * 100).toFixed(0)}%`
}

function formatTime(ms?: number) {
  if (!ms) return "—"
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function statusPillClass(status: string) {
  if (status === "complete") return "bg-emerald-500/15 text-emerald-600"
  if (status === "running") return "bg-amber-500/15 text-amber-600"
  return "bg-destructive/15 text-destructive"
}

function shortenSlug(slug: string) {
  return slug.length > 32 ? `${slug.slice(0, 30)}…` : slug
}

export default function BenchmarkSuiteRunPage() {
  const { suiteRunId } = useParams<{ suiteRunId: string }>()
  const data = useQuery(
    api.benchmarks.getSuiteRun,
    suiteRunId
      ? { id: suiteRunId as Id<"benchmarkSuiteRuns"> }
      : "skip",
  )
  const runs = useQuery(
    api.benchmarks.listRunsForSuiteRun,
    suiteRunId
      ? { suiteRunId: suiteRunId as Id<"benchmarkSuiteRuns"> }
      : "skip",
  )
  const forceComplete = useMutation(api.benchmarks.forceCompleteSuiteRun)

  const [expandedSuites, setExpandedSuites] = useState<Set<SuiteKey>>(
    new Set(),
  )
  const [forcing, setForcing] = useState(false)

  function toggleSuite(suite: SuiteKey) {
    setExpandedSuites((prev) => {
      const next = new Set(prev)
      if (next.has(suite)) next.delete(suite)
      else next.add(suite)
      return next
    })
  }

  if (!suiteRunId) {
    return (
      <div className="px-4 py-6 text-[12px] text-muted-foreground md:px-8 md:py-10">
        Missing suite run id.
      </div>
    )
  }

  if (data === undefined) {
    return (
      <div className="px-4 py-6 text-[12px] text-muted-foreground md:px-8 md:py-10">
        Loading…
      </div>
    )
  }

  if (data === null) {
    return (
      <div className="px-4 py-6 text-[12px] text-muted-foreground md:px-8 md:py-10">
        Suite run not found.
      </div>
    )
  }

  const { suiteRun, aggregates } = data
  const winner = aggregates[0]
  const isStuck =
    suiteRun.status === "running" &&
    suiteRun.completedRunCount > 0 &&
    suiteRun.completedRunCount < suiteRun.expectedRunCount &&
    Date.now() - suiteRun.startedAt > 5 * 60_000

  async function handleForceComplete() {
    if (!suiteRunId) return
    if (
      !confirm(
        "Mark this suite run as complete? Use only if a worker crashed mid-run.",
      )
    )
      return
    setForcing(true)
    try {
      await forceComplete({ id: suiteRunId as Id<"benchmarkSuiteRuns"> })
    } finally {
      setForcing(false)
    }
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={stagger}
      className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10"
    >
      <motion.div variants={fadeUp} className="mb-4">
        <Link
          to="/benchmarks"
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={12} />
          <span>All benchmarks</span>
        </Link>
      </motion.div>

      <motion.div variants={fadeUp} className="mb-6">
        <h1 className="text-[15px] leading-tight font-semibold">
          Suite run · {formatTime(suiteRun.startedAt)}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          <span
            className={`inline-block px-1.5 py-0.5 text-[11px] font-medium ${statusPillClass(suiteRun.status)}`}
          >
            {suiteRun.status}
          </span>
          <span>
            {suiteRun.completedRunCount}/{suiteRun.expectedRunCount} fixtures
          </span>
          <span>·</span>
          <span>{suiteRun.models.length} models</span>
          {suiteRun.completedAt && (
            <>
              <span>·</span>
              <span>completed {formatTime(suiteRun.completedAt)}</span>
            </>
          )}
        </div>
      </motion.div>

      {isStuck && (
        <motion.div
          variants={fadeUp}
          className="mb-6 flex items-start gap-3 border border-amber-500/40 bg-amber-500/5 p-3 text-[12px]"
        >
          <WarningCircle
            size={14}
            weight="fill"
            className="mt-0.5 shrink-0 text-amber-600"
          />
          <div className="flex-1">
            <div className="font-medium text-amber-700">
              This run looks stuck.
            </div>
            <div className="mt-0.5 text-muted-foreground">
              {suiteRun.completedRunCount}/{suiteRun.expectedRunCount}{" "}
              fixtures landed and nothing has updated for a while. A worker
              may have crashed before its row was saved.
            </div>
          </div>
          <button
            type="button"
            onClick={handleForceComplete}
            disabled={forcing}
            className="shrink-0 bg-amber-500/20 px-2 py-1 text-[12px] font-medium text-amber-700 transition-colors hover:bg-amber-500/30 disabled:opacity-50"
          >
            {forcing ? "Marking…" : "Force complete"}
          </button>
        </motion.div>
      )}

      {winner && winner.runCount > 0 && (
        <motion.div
          variants={fadeUp}
          className="mb-6 border border-sidebar-border bg-sidebar/30 p-4"
        >
          <div className="flex items-center gap-2 text-[11px] tracking-wide text-muted-foreground uppercase">
            <Trophy size={12} weight="fill" />
            Best overall
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <div className="font-mono text-[15px] font-semibold">
              {winner.modelSlug}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {winner.provider ?? "any provider"}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <div className="text-[11px] text-muted-foreground">
                Composite score
              </div>
              <div className="text-[15px] font-semibold">
                {formatPct(winner.compositeScore)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">
                Avg latency
              </div>
              <div className="text-[15px] font-semibold">
                {formatMs(winner.avgTotalMs)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">
                Throughput
              </div>
              <div className="text-[15px] font-semibold">
                {formatTps(winner.avgTps)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">
                Quality
              </div>
              <div className="text-[15px] font-semibold">
                {formatPct(winner.qualityOverall)}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <motion.div variants={fadeUp} className="mb-8">
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-[12px] font-medium text-muted-foreground">
            Leaderboard
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Composite = {formatPct(data.weights.speed)} speed +{" "}
            {formatPct(data.weights.tps)} throughput +{" "}
            {formatPct(data.weights.quality)} quality
          </p>
        </div>
        <div className="overflow-x-auto border border-sidebar-border">
          <div className="min-w-[680px]">
            <div className="flex items-center gap-2 border-b border-sidebar-border bg-sidebar/50 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              <div className="w-6">#</div>
              <div className="flex-1">Model</div>
              <div className="w-24">Composite</div>
              <div className="w-24">Latency</div>
              <div className="w-24">Throughput</div>
              <div className="w-24">Quality</div>
              <div className="w-16">Errors</div>
            </div>
            {aggregates.length === 0 && (
              <div className="px-3 py-4 text-[12px] text-muted-foreground">
                No runs yet.
              </div>
            )}
            {aggregates.map((agg, idx) => (
              <div
                key={agg.modelSlug}
                className="flex items-center gap-2 border-b border-sidebar-border px-3 py-2 text-[12px] last:border-b-0"
              >
                <div className="w-6 font-medium">{idx + 1}</div>
                <div className="flex-1 truncate">
                  <div className="truncate font-mono text-[12px]">
                    {agg.modelSlug}
                  </div>
                  {agg.provider && (
                    <div className="truncate text-[11px] text-muted-foreground">
                      {agg.provider}
                    </div>
                  )}
                </div>
                <div className="w-24 font-medium">
                  {formatPct(agg.compositeScore)}
                </div>
                <div className="w-24 text-muted-foreground">
                  {formatMs(agg.avgTotalMs)}
                </div>
                <div className="w-24 text-muted-foreground">
                  {formatTps(agg.avgTps)}
                </div>
                <div className="w-24 text-muted-foreground">
                  {formatPct(agg.qualityOverall)}
                </div>
                <div
                  className={`w-16 ${agg.errorCount > 0 ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {agg.errorCount}
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {(["discordScan", "feedbackExtract", "taskGen"] as SuiteKey[]).map(
        (suite) => {
          const expanded = expandedSuites.has(suite)
          const suiteRows =
            runs?.filter((r) => r.suite === suite) ?? []
          const sortedRows = [...suiteRows].sort((a, b) => {
            if (a.fixtureId !== b.fixtureId)
              return a.fixtureId.localeCompare(b.fixtureId)
            return a.modelSlug.localeCompare(b.modelSlug)
          })

          // Per-model aggregates for this specific suite.
          const perModel = new Map<
            string,
            {
              modelSlug: string
              provider?: string
              quality: number
              latency: number
              throughput?: number
              errors: number
              count: number
            }
          >()
          for (const model of suiteRun.models) {
            const modelRows = suiteRows.filter(
              (r) => r.modelSlug === model.slug,
            )
            const okRows = modelRows.filter((r) => r.status === "ok")
            const tpsRows = okRows
              .map((r) => r.tps)
              .filter((v): v is number => v !== undefined)
            perModel.set(model.slug, {
              modelSlug: model.slug,
              provider: model.provider,
              quality:
                okRows.length === 0
                  ? 0
                  : okRows.reduce((sum, r) => sum + r.qualityScore, 0) /
                    okRows.length,
              latency:
                okRows.length === 0
                  ? 0
                  : okRows.reduce((sum, r) => sum + r.totalMs, 0) /
                    okRows.length,
              throughput:
                tpsRows.length === 0
                  ? undefined
                  : tpsRows.reduce((s, v) => s + v, 0) / tpsRows.length,
              errors: modelRows.length - okRows.length,
              count: modelRows.length,
            })
          }
          const perModelList = Array.from(perModel.values()).sort(
            (a, b) => b.quality - a.quality,
          )

          return (
            <motion.div key={suite} variants={fadeUp} className="mb-8">
              <div className="mb-2 flex items-end justify-between gap-2">
                <div>
                  <h2 className="text-[12px] font-medium text-foreground">
                    {SUITE_LABELS[suite]}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    {SUITE_DESCRIPTIONS[suite]}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSuite(suite)}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {expanded ? (
                    <CaretDown size={11} weight="bold" />
                  ) : (
                    <CaretRight size={11} weight="bold" />
                  )}
                  <span>
                    {expanded ? "Hide" : "Show"} {sortedRows.length} fixture
                    runs
                  </span>
                </button>
              </div>

              <div className="overflow-x-auto border border-sidebar-border">
                <div className="min-w-[600px]">
                  <div className="flex items-center gap-2 border-b border-sidebar-border bg-sidebar/50 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    <div className="flex-1">Model</div>
                    <div className="w-24">Quality</div>
                    <div className="w-24">Latency</div>
                    <div className="w-24">Throughput</div>
                    <div className="w-16">Errors</div>
                  </div>
                  {perModelList.length === 0 && (
                    <div className="px-3 py-4 text-[12px] text-muted-foreground">
                      No runs for this suite yet.
                    </div>
                  )}
                  {perModelList.map((row) => (
                    <div
                      key={row.modelSlug}
                      className="flex items-center gap-2 border-b border-sidebar-border px-3 py-2 text-[12px] last:border-b-0"
                    >
                      <div className="flex-1 truncate font-mono text-[12px]">
                        {row.modelSlug}
                      </div>
                      <div className="w-24 font-medium">
                        {formatPct(row.quality)}
                      </div>
                      <div className="w-24 text-muted-foreground">
                        {formatMs(row.latency)}
                      </div>
                      <div className="w-24 text-muted-foreground">
                        {formatTps(row.throughput)}
                      </div>
                      <div
                        className={`w-16 ${row.errors > 0 ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {row.errors}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {expanded && (
                <div className="mt-2 overflow-x-auto border border-sidebar-border">
                  <div className="min-w-[680px]">
                    <div className="flex items-center gap-2 border-b border-sidebar-border bg-sidebar/30 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      <div className="w-44">Model</div>
                      <div className="flex-1">Fixture</div>
                      <div className="w-20">Quality</div>
                      <div className="w-20">Total</div>
                      <div className="w-20">TTFT</div>
                      <div className="w-16">Status</div>
                    </div>
                    {runs === undefined && (
                      <div className="px-3 py-4 text-[12px] text-muted-foreground">
                        Loading…
                      </div>
                    )}
                    {runs !== undefined && sortedRows.length === 0 && (
                      <div className="px-3 py-4 text-[12px] text-muted-foreground">
                        No runs yet.
                      </div>
                    )}
                    {sortedRows.map((run) => (
                      <Link
                        key={run._id}
                        to={`/benchmarks/runs/${suiteRunId}/runs/${run._id}`}
                        className="flex items-center gap-2 border-b border-sidebar-border px-3 py-2 text-[12px] transition-colors last:border-b-0 hover:bg-sidebar-accent"
                      >
                        <div className="w-44 truncate font-mono text-[11.5px]">
                          {shortenSlug(run.modelSlug)}
                        </div>
                        <div className="flex-1 truncate text-muted-foreground">
                          {run.fixtureLabel}
                        </div>
                        <div className="w-20">
                          {formatPct(run.qualityScore)}
                        </div>
                        <div className="w-20 text-muted-foreground">
                          {formatMs(run.totalMs)}
                        </div>
                        <div className="w-20 text-muted-foreground">
                          {formatMs(run.ttftMs)}
                        </div>
                        <div className="w-16">
                          <span
                            className={`inline-block px-1.5 py-0.5 text-[11px] font-medium ${
                              run.status === "ok"
                                ? "bg-emerald-500/15 text-emerald-600"
                                : "bg-destructive/15 text-destructive"
                            }`}
                          >
                            {run.status}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )
        },
      )}
    </motion.div>
  )
}
