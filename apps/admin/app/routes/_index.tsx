import { useState } from "react"
import { useQuery } from "convex/react"
import { motion } from "motion/react"
import {
  WarningCircle,
  ChartLineUp,
  Timer,
  Stack,
  Pulse,
  ArrowClockwise,
} from "@phosphor-icons/react"

import { api } from "~/lib/convex"
import { fadeUp, stagger } from "~/lib/utils"

const WINDOW_OPTIONS = [
  { label: "1h", ms: 60 * 60 * 1000 },
  { label: "24h", ms: 24 * 60 * 60 * 1000 },
  { label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
] as const

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatPct(n: number) {
  return `${(n * 100).toFixed(n > 0 && n < 0.01 ? 2 : 1)}%`
}

function formatDuration(ms: number | null) {
  if (ms === null) return "—"
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}

function formatRelative(ms: number | null) {
  if (!ms) return "—"
  const diff = Date.now() - ms
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

export default function AdminOverviewPage() {
  const [windowMs, setWindowMs] = useState<number>(24 * 60 * 60 * 1000)
  const metrics = useQuery(api.moduleRuns.adminMetrics, { windowMs })
  const failures = useQuery(api.moduleRuns.adminRecentFailures, {
    windowMs,
    limit: 20,
  })

  const failing = metrics
    ? metrics.modules.filter((m) => m.failure > 0).length
    : 0

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={stagger}
      className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10"
    >
      <motion.div
        variants={fadeUp}
        className="mb-6 flex flex-wrap items-start justify-between gap-3"
      >
        <div>
          <h1 className="flex items-center gap-2 text-[15px] font-semibold leading-tight">
            <Pulse size={15} weight="fill" />
            Observability
          </h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Module runs, failure rates, and recent errors across message
            processing.
          </p>
        </div>
        <WindowPicker windowMs={windowMs} onChange={setWindowMs} />
      </motion.div>

      <motion.div
        variants={fadeUp}
        className="mb-5 grid grid-cols-2 gap-0 border border-sidebar-border bg-sidebar/30 sm:grid-cols-4"
      >
        <Stat
          icon={<Stack size={14} />}
          label="Total runs"
          value={metrics ? formatCount(metrics.total) : "—"}
        />
        <Stat
          icon={<ChartLineUp size={14} />}
          label="Success"
          value={metrics ? formatCount(metrics.success) : "—"}
          tone="success"
        />
        <Stat
          icon={<WarningCircle size={14} />}
          label="Failures"
          value={metrics ? formatCount(metrics.failure) : "—"}
          tone={metrics && metrics.failure > 0 ? "danger" : "default"}
        />
        <Stat
          icon={<Timer size={14} />}
          label="Failure rate"
          value={metrics ? formatPct(metrics.failureRate) : "—"}
          tone={
            metrics && metrics.failureRate > 0.1
              ? "danger"
              : metrics && metrics.failureRate > 0.02
                ? "warn"
                : "default"
          }
          hint={
            metrics
              ? `${failing} module${failing === 1 ? "" : "s"} with failures`
              : undefined
          }
          last
        />
      </motion.div>

      <motion.section variants={fadeUp} className="mb-6">
        <h2 className="mb-2 text-[12px] font-medium text-muted-foreground">
          Modules
        </h2>
        <div className="overflow-x-auto border border-sidebar-border">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[1.6fr_80px_80px_80px_100px_80px_100px] gap-2 border-b border-sidebar-border bg-sidebar/50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <div>Module</div>
              <div className="text-right">Runs</div>
              <div className="text-right">OK</div>
              <div className="text-right">Fail</div>
              <div className="text-right">Fail %</div>
              <div className="text-right">Avg</div>
              <div className="text-right">p95</div>
            </div>
            {metrics === undefined && (
              <div className="px-3 py-4 text-[12px] text-muted-foreground">
                Loading…
              </div>
            )}
            {metrics?.modules.length === 0 && (
              <div className="px-3 py-6 text-[12px] text-muted-foreground">
                No runs in this window yet.
              </div>
            )}
            {metrics?.modules.map((m) => (
              <div
                key={m.module}
                className="grid grid-cols-[1.6fr_80px_80px_80px_100px_80px_100px] items-center gap-2 border-b border-sidebar-border px-3 py-2 text-[12px] last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-1.5 ${
                        m.total === 0
                          ? "bg-muted-foreground/30"
                          : m.failureRate > 0.1
                            ? "bg-red-500"
                            : m.failureRate > 0
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                      }`}
                    />
                    <span className="truncate font-medium">{m.label}</span>
                  </div>
                  <div className="mt-0.5 pl-3.5 text-[10px] text-muted-foreground">
                    last {formatRelative(m.lastFinishedAt)}
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  {formatCount(m.total)}
                </div>
                <div className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatCount(m.success)}
                </div>
                <div
                  className={`text-right tabular-nums ${
                    m.failure > 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {formatCount(m.failure)}
                </div>
                <div
                  className={`text-right tabular-nums ${
                    m.failureRate > 0.1
                      ? "text-red-600 dark:text-red-400"
                      : m.failureRate > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground"
                  }`}
                >
                  {m.total > 0 ? formatPct(m.failureRate) : "—"}
                </div>
                <div className="text-right tabular-nums text-muted-foreground">
                  {formatDuration(m.avgDurationMs)}
                </div>
                <div className="text-right tabular-nums text-muted-foreground">
                  {formatDuration(m.p95DurationMs)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section variants={fadeUp}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[12px] font-medium text-muted-foreground">
            Recent failures
          </h2>
          {failures && failures.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {failures.length} in window
            </span>
          )}
        </div>
        <div className="border border-sidebar-border">
          {failures === undefined && (
            <div className="px-3 py-4 text-[12px] text-muted-foreground">
              Loading…
            </div>
          )}
          {failures?.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-4 text-[12px] text-muted-foreground">
              <span className="size-1.5 bg-emerald-500" />
              No failures in this window.
            </div>
          )}
          {failures?.map((f) => (
            <div
              key={f._id}
              className="flex gap-3 border-b border-sidebar-border px-3 py-2.5 last:border-b-0"
            >
              <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center bg-red-500/10 text-red-600 ring-1 ring-red-500/30 dark:text-red-400">
                <WarningCircle size={12} weight="fill" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-[12px] font-medium">
                    {f.moduleLabel}
                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                      · {f.operation}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <ArrowClockwise size={10} />
                    <span>{formatDuration(f.durationMs ?? null)}</span>
                    <span>·</span>
                    <span>{formatRelative(f.finishedAt)}</span>
                  </div>
                </div>
                <div className="mt-1 break-words font-mono text-[11px] text-red-600 dark:text-red-400">
                  {f.error}
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.section>
    </motion.div>
  )
}

function WindowPicker({
  windowMs,
  onChange,
}: {
  windowMs: number
  onChange: (ms: number) => void
}) {
  return (
    <div className="flex border border-sidebar-border bg-sidebar/30">
      {WINDOW_OPTIONS.map((opt) => {
        const active = windowMs === opt.ms
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => onChange(opt.ms)}
            className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  tone = "default",
  hint,
  last,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone?: "default" | "success" | "warn" | "danger"
  hint?: string
  last?: boolean
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "danger"
          ? "text-red-600 dark:text-red-400"
          : "text-foreground"

  return (
    <div
      className={`flex flex-col gap-1 px-4 py-3 ${
        last ? "" : "border-r border-sidebar-border"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-[18px] font-semibold leading-tight ${toneClass}`}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  )
}
