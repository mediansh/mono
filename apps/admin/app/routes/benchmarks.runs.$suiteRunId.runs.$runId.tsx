import { Link, useParams } from "react-router"
import { useQuery } from "convex/react"
import { motion } from "motion/react"
import { ArrowLeft } from "@phosphor-icons/react"

import { api, type Id } from "~/lib/convex"
import { fadeUp, stagger } from "~/lib/utils"

const SUITE_LABELS = {
  discordScan: "Discord scan",
  feedbackExtract: "Feedback extract",
  taskGen: "Task gen",
} as const

function formatMs(ms?: number | null) {
  if (ms === undefined || ms === null || Number.isNaN(ms)) return "—"
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function formatTps(tps?: number | null) {
  if (tps === undefined || tps === null || Number.isNaN(tps)) return "—"
  return tps.toFixed(1)
}

function formatPct(value: number) {
  return `${(value * 100).toFixed(0)}%`
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-sidebar-border bg-sidebar/30 p-3">
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 text-[14px] font-semibold">{value}</div>
    </div>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="max-h-[420px] overflow-auto border border-sidebar-border bg-sidebar/30 p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap">
      {children}
    </pre>
  )
}

export default function BenchmarkRunInspectorPage() {
  const { suiteRunId, runId } = useParams<{
    suiteRunId: string
    runId: string
  }>()

  const data = useQuery(
    api.benchmarks.getRun,
    runId ? { id: runId as Id<"benchmarkRuns"> } : "skip",
  )

  if (!suiteRunId || !runId) {
    return (
      <div className="px-4 py-6 text-[12px] text-muted-foreground md:px-8 md:py-10">
        Missing run id.
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
        Run not found.
      </div>
    )
  }

  const { run } = data

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={stagger}
      className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10"
    >
      <motion.div variants={fadeUp} className="mb-4">
        <Link
          to={`/benchmarks/runs/${suiteRunId}`}
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={12} />
          <span>Back to suite run</span>
        </Link>
      </motion.div>

      <motion.div variants={fadeUp} className="mb-6">
        <h1 className="text-[15px] leading-tight font-semibold">
          {SUITE_LABELS[run.suite]} · {run.fixtureLabel}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          <span className="font-mono">{run.modelSlug}</span>
          {run.provider && <span>· {run.provider}</span>}
          <span>·</span>
          <span
            className={`inline-block px-1.5 py-0.5 text-[11px] font-medium ${
              run.status === "ok"
                ? "bg-emerald-500/15 text-emerald-600"
                : "bg-destructive/15 text-destructive"
            }`}
          >
            {run.status}
          </span>
          {run.correct !== undefined && (
            <>
              <span>·</span>
              <span
                className={
                  run.correct ? "text-emerald-600" : "text-destructive"
                }
              >
                {run.correct ? "correct" : "incorrect"}
              </span>
            </>
          )}
        </div>
      </motion.div>

      <motion.div
        variants={fadeUp}
        className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      >
        <MetricCell label="Quality" value={formatPct(run.qualityScore)} />
        <MetricCell label="Total" value={formatMs(run.totalMs)} />
        <MetricCell label="TTFT" value={formatMs(run.ttftMs)} />
        <MetricCell label="TPS" value={formatTps(run.tps)} />
        <MetricCell
          label="In tokens"
          value={
            run.inputTokens !== undefined ? String(run.inputTokens) : "—"
          }
        />
        <MetricCell
          label="Out tokens"
          value={
            run.outputTokens !== undefined ? String(run.outputTokens) : "—"
          }
        />
      </motion.div>

      {run.errorMessage && (
        <motion.div
          variants={fadeUp}
          className="mb-6 border border-destructive/40 bg-destructive/5 p-3 text-[12px] text-destructive"
        >
          {run.errorMessage}
        </motion.div>
      )}

      {run.parseError && (
        <motion.div
          variants={fadeUp}
          className="mb-6 border border-amber-500/40 bg-amber-500/5 p-3 text-[12px] text-amber-700"
        >
          Schema error: {run.parseError}
        </motion.div>
      )}

      <motion.div variants={fadeUp} className="mb-6">
        <h2 className="mb-2 text-[12px] font-medium text-muted-foreground">
          Score breakdown
        </h2>
        <CodeBlock>{prettyJson(run.scoreBreakdown ?? {})}</CodeBlock>
      </motion.div>

      <motion.div variants={fadeUp} className="mb-6">
        <h2 className="mb-2 text-[12px] font-medium text-muted-foreground">
          System prompt
        </h2>
        <CodeBlock>{run.systemPrompt}</CodeBlock>
      </motion.div>

      <motion.div variants={fadeUp} className="mb-6">
        <h2 className="mb-2 text-[12px] font-medium text-muted-foreground">
          User prompt
        </h2>
        <CodeBlock>{run.userPrompt}</CodeBlock>
      </motion.div>

      <motion.div variants={fadeUp} className="mb-6">
        <h2 className="mb-2 text-[12px] font-medium text-muted-foreground">
          Raw output
        </h2>
        <CodeBlock>{run.rawOutput ?? ""}</CodeBlock>
      </motion.div>

      {run.parsed !== undefined && (
        <motion.div variants={fadeUp} className="mb-6">
          <h2 className="mb-2 text-[12px] font-medium text-muted-foreground">
            Parsed JSON
          </h2>
          <CodeBlock>{prettyJson(run.parsed)}</CodeBlock>
        </motion.div>
      )}

      {run.expected !== undefined && run.expected !== null && (
        <motion.div variants={fadeUp} className="mb-6">
          <h2 className="mb-2 text-[12px] font-medium text-muted-foreground">
            Expected
          </h2>
          <CodeBlock>{prettyJson(run.expected)}</CodeBlock>
        </motion.div>
      )}
    </motion.div>
  )
}
