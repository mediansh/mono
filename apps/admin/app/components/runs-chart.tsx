import { useMemo } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type TooltipEntry = {
  name?: string | number
  dataKey?: string | number
  value?: number | string
  color?: string
}
type TooltipBag = {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
}

type Bucket = {
  timestamp: number
  success: number
  failure: number
  skipped: number
  total: number
  failureRate: number
  byModule: Record<string, { success: number; failure: number; total: number }>
}

type ModuleMeta = { module: string; label: string }

type Props = {
  buckets: Bucket[] | undefined
  bucketMs: number
  windowMs: number
  modules: ModuleMeta[]
  mode: "runs" | "failures" | "rate" | "per-module"
  height?: number
  emptyLabel?: string
}

const LINE_COLORS = ["#0066cc", "#cc6600", "#009966", "#9933cc", "#cc0066"]

function formatTick(ts: number, windowMs: number) {
  const date = new Date(ts)
  if (windowMs <= 60 * 60 * 1000) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  if (windowMs <= 24 * 60 * 60 * 1000) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" })
}

export function RunsChart({
  buckets,
  bucketMs: _bucketMs,
  windowMs,
  modules,
  mode,
  height = 180,
  emptyLabel = "No data",
}: Props) {
  const data = useMemo(() => {
    if (!buckets) return []
    return buckets.map((b) => {
      const row: Record<string, number> = { timestamp: b.timestamp }
      if (mode === "runs" || mode === "failures") {
        row.total = b.total
        row.failure = b.failure
        row.success = b.success
      }
      if (mode === "rate") {
        row.failureRate = Math.round(b.failureRate * 10000) / 100
      }
      if (mode === "per-module") {
        for (const m of modules) {
          row[m.module] = b.byModule?.[m.module]?.total ?? 0
        }
      }
      return row
    })
  }, [buckets, mode, modules])

  if (buckets === undefined) {
    return (
      <div
        className="flex items-center justify-center text-[11px] text-muted-foreground"
        style={{ height }}
      >
        Loading…
      </div>
    )
  }

  const hasAnyData = data.some((d) =>
    Object.entries(d).some(([k, v]) => k !== "timestamp" && Number(v) > 0),
  )
  if (!hasAnyData) {
    return (
      <div
        className="flex items-center justify-center text-[11px] text-muted-foreground"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    )
  }

  const tickFormatter = (v: number) => formatTick(v, windowMs)

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
        >
          <CartesianGrid
            stroke="var(--sidebar-border)"
            strokeDasharray="2 4"
            vertical={false}
          />
          <XAxis
            dataKey="timestamp"
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickFormatter={tickFormatter}
            tickLine={false}
            axisLine={{ stroke: "var(--sidebar-border)" }}
            minTickGap={40}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--sidebar-border)" }}
            width={32}
            allowDecimals={false}
            tickFormatter={(v) => (mode === "rate" ? `${v}%` : `${v}`)}
          />
          <Tooltip
            content={(props) => (
              <ChartTooltip
                {...(props as unknown as TooltipBag)}
                mode={mode}
                windowMs={windowMs}
              />
            )}
          />
          {mode === "runs" && (
            <>
              <Line
                type="monotone"
                dataKey="total"
                name="Total"
                stroke="var(--foreground)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="failure"
                name="Failures"
                stroke="#cc3333"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </>
          )}
          {mode === "failures" && (
            <Line
              type="monotone"
              dataKey="failure"
              name="Failures"
              stroke="#cc3333"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          )}
          {mode === "rate" && (
            <Line
              type="monotone"
              dataKey="failureRate"
              name="Failure rate"
              stroke="#cc6600"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          )}
          {mode === "per-module" &&
            modules.map((m, i) => (
              <Line
                key={m.module}
                type="monotone"
                dataKey={m.module}
                name={m.label}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function ChartTooltip({
  active,
  payload,
  label,
  mode,
  windowMs,
}: TooltipBag & { mode: Props["mode"]; windowMs: number }) {
  if (!active || !payload || payload.length === 0) return null
  const ts = typeof label === "number" ? label : Number(label)
  return (
    <div className="border border-sidebar-border bg-background px-2 py-1.5 text-[11px] shadow-lg">
      <div className="mb-1 font-medium">
        {Number.isFinite(ts) ? formatTick(ts, windowMs) : ""}
      </div>
      {payload.map((p: TooltipEntry) => (
        <div
          key={String(p.dataKey)}
          className="flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-1.5">
            <span
              className="size-1.5"
              style={{ backgroundColor: p.color ?? "#666" }}
            />
            <span className="text-muted-foreground">{String(p.name)}</span>
          </div>
          <span className="font-mono tabular-nums">
            {mode === "rate" ? `${p.value}%` : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}
