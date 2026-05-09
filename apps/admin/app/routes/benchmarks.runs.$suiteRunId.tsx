import { Link, useParams } from "react-router"
import { useQuery } from "convex/react"
import { motion } from "motion/react"
import { ArrowLeft, Trophy } from "@phosphor-icons/react"

import { api, type Id } from "~/lib/convex"
import { fadeUp, stagger } from "~/lib/utils"

const SUITE_LABELS = {
  discordScan: "Discord scan",
  feedbackExtract: "Feedback extract",
  taskGen: "Task gen",
} as const

type SuiteKey = keyof typeof SUITE_LABELS

function formatMs(ms?: number) {
  if (ms === undefined || ms === null || Number.isNaN(ms)) return "—"
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function formatTps(tps?: number) {
  if (tps === undefined || tps === null || Number.isNaN(tps)) return "—"
  return tps.toFixed(1)
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
            Progress: {suiteRun.completedRunCount}/{suiteRun.expectedRunCount}
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

      <motion.div variants={fadeUp} className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
          <Trophy size={13} weight="fill" />
          Leaderboard
          <span className="text-[11px]">
            (speed {formatPct(data.weights.speed)} · TPS{" "}
            {formatPct(data.weights.tps)} · quality{" "}
            {formatPct(data.weights.quality)})
          </span>
        </div>
        <div className="overflow-x-auto border border-sidebar-border">
          <div className="min-w-[760px]">
            <div className="flex items-center gap-2 border-b border-sidebar-border bg-sidebar/50 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              <div className="w-6">#</div>
              <div className="flex-1">Model</div>
              <div className="w-20">Composite</div>
              <div className="w-20">Speed</div>
              <div className="w-20">Avg total</div>
              <div className="w-20">Avg TTFT</div>
              <div className="w-20">TPS</div>
              <div className="w-20">Discord</div>
              <div className="w-20">Extract</div>
              <div className="w-20">TaskGen</div>
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
                <div className="w-20 font-medium">
                  {formatPct(agg.compositeScore)}
                </div>
                <div className="w-20 text-muted-foreground">
                  {formatPct(agg.speedScore)}
                </div>
                <div className="w-20 text-muted-foreground">
                  {formatMs(agg.avgTotalMs)}
                </div>
                <div className="w-20 text-muted-foreground">
                  {formatMs(agg.avgTtftMs)}
                </div>
                <div className="w-20 text-muted-foreground">
                  {formatTps(agg.avgTps)}
                </div>
                <div className="w-20 text-muted-foreground">
                  {agg.qualityBySuite.discordScan !== undefined
                    ? formatPct(agg.qualityBySuite.discordScan)
                    : "—"}
                </div>
                <div className="w-20 text-muted-foreground">
                  {agg.qualityBySuite.feedbackExtract !== undefined
                    ? formatPct(agg.qualityBySuite.feedbackExtract)
                    : "—"}
                </div>
                <div className="w-20 text-muted-foreground">
                  {agg.qualityBySuite.taskGen !== undefined
                    ? formatPct(agg.qualityBySuite.taskGen)
                    : "—"}
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
          const suiteRows =
            runs?.filter((r) => r.suite === suite).sort((a, b) => {
              if (a.fixtureId !== b.fixtureId)
                return a.fixtureId.localeCompare(b.fixtureId)
              return a.modelSlug.localeCompare(b.modelSlug)
            }) ?? []
          return (
            <motion.div key={suite} variants={fadeUp} className="mb-8">
              <h2 className="mb-2 text-[12px] font-medium text-muted-foreground">
                {SUITE_LABELS[suite]} runs
              </h2>
              <div className="overflow-x-auto border border-sidebar-border">
                <div className="min-w-[760px]">
                  <div className="flex items-center gap-2 border-b border-sidebar-border bg-sidebar/50 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    <div className="w-40">Model</div>
                    <div className="flex-1">Fixture</div>
                    <div className="w-20">Quality</div>
                    <div className="w-20">Total</div>
                    <div className="w-20">TTFT</div>
                    <div className="w-20">TPS</div>
                    <div className="w-16">Status</div>
                  </div>
                  {runs === undefined && (
                    <div className="px-3 py-4 text-[12px] text-muted-foreground">
                      Loading…
                    </div>
                  )}
                  {runs !== undefined && suiteRows.length === 0 && (
                    <div className="px-3 py-4 text-[12px] text-muted-foreground">
                      No runs for this suite yet.
                    </div>
                  )}
                  {suiteRows.map((run) => (
                    <Link
                      key={run._id}
                      to={`/benchmarks/runs/${suiteRunId}/runs/${run._id}`}
                      className="flex items-center gap-2 border-b border-sidebar-border px-3 py-2 text-[12px] transition-colors last:border-b-0 hover:bg-sidebar-accent"
                    >
                      <div className="w-40 truncate font-mono text-[12px]">
                        {run.modelSlug}
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
                      <div className="w-20 text-muted-foreground">
                        {formatTps(run.tps)}
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
            </motion.div>
          )
        },
      )}
    </motion.div>
  )
}
