"use client"

import { useState, useEffect, type ReactNode } from "react"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  FilterIcon,
} from "@hugeicons/core-free-icons"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
} from "recharts"

// ── Animation helpers ──

function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.04 } } }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const } },
}

// ── Types ──

type TimeRange = "24h" | "7d" | "30d" | "90d"
type SortField = "name" | "value"
type SortDirection = "asc" | "desc"

interface MetricCard {
  id: string
  title: string
  subtitle: string
  value: string
  data: { time: string; value: number; secondary?: number }[]
  color: string
  secondaryColor?: string
  href?: string
}

// ── Mock data generators ──

function generateTimeSeries(
  range: TimeRange,
  baseFn: (i: number, total: number) => number,
  secondaryFn?: (i: number, total: number) => number,
) {
  const points = range === "24h" ? 48 : range === "7d" ? 56 : range === "30d" ? 60 : 90
  const data: { time: string; value: number; secondary?: number }[] = []

  for (let i = 0; i < points; i++) {
    const value = Math.max(0, Math.round(baseFn(i, points)))
    const entry: { time: string; value: number; secondary?: number } = {
      time: formatTimeLabel(i, points, range),
      value,
    }
    if (secondaryFn) {
      entry.secondary = Math.max(0, Math.round(secondaryFn(i, points)))
    }
    data.push(entry)
  }
  return data
}

function formatTimeLabel(i: number, total: number, range: TimeRange): string {
  if (range === "24h") {
    const hoursAgo = Math.round(((total - i) / total) * 24)
    return hoursAgo === 0 ? "now" : `${hoursAgo}h`
  }
  if (range === "7d") {
    const daysAgo = Math.round(((total - i) / total) * 7)
    return daysAgo === 0 ? "today" : `${daysAgo}d`
  }
  if (range === "30d") {
    const daysAgo = Math.round(((total - i) / total) * 30)
    return daysAgo === 0 ? "today" : `${daysAgo}d`
  }
  const daysAgo = Math.round(((total - i) / total) * 90)
  return daysAgo === 0 ? "today" : `${daysAgo}d`
}

function buildMetrics(range: TimeRange): MetricCard[] {
  return [
    {
      id: "discord-messages",
      title: "Discord Messages",
      subtitle: "Messages Sent",
      value: range === "24h" ? "342" : range === "7d" ? "2.4K" : range === "30d" ? "9.8K" : "28.1K",
      color: "var(--chart-1)",
      secondaryColor: "var(--chart-2)",
      data: generateTimeSeries(
        range,
        (i, t) => 30 + Math.sin(i / 4) * 15 + Math.random() * 20,
        (i) => 2 + Math.random() * 3,
      ),
    },
    {
      id: "discord-feedback",
      title: "Discord Feedback",
      subtitle: "Feedback Messages",
      value: range === "24h" ? "28" : range === "7d" ? "184" : range === "30d" ? "712" : "2.1K",
      color: "var(--chart-1)",
      secondaryColor: "var(--chart-2)",
      data: generateTimeSeries(
        range,
        (i, t) => 5 + Math.sin(i / 3) * 3 + Math.random() * 4,
        (i) => 1 + Math.random() * 2,
      ),
    },
    {
      id: "feedback-rate",
      title: "Feedback Rate",
      subtitle: "Percentage",
      value: range === "24h" ? "8.2%" : range === "7d" ? "7.6%" : range === "30d" ? "7.3%" : "7.5%",
      color: "var(--chart-3)",
      data: generateTimeSeries(range, (i) => 5 + Math.sin(i / 5) * 3 + Math.random() * 2),
    },
    {
      id: "tasks-per-day",
      title: "Tasks Created",
      subtitle: "Tasks / Day",
      value: range === "24h" ? "14" : range === "7d" ? "89" : range === "30d" ? "342" : "1.1K",
      color: "var(--chart-1)",
      secondaryColor: "var(--chart-2)",
      data: generateTimeSeries(
        range,
        (i, t) => 10 + Math.sin(i / 6) * 5 + Math.random() * 8,
        (i) => 1 + Math.random() * 2,
      ),
    },
    {
      id: "task-acceptance",
      title: "Task Acceptance",
      subtitle: "Acceptance Rate",
      value: range === "24h" ? "78%" : range === "7d" ? "82%" : range === "30d" ? "80%" : "79%",
      color: "var(--chart-3)",
      data: generateTimeSeries(range, (i) => 70 + Math.sin(i / 4) * 10 + Math.random() * 5),
    },
    {
      id: "tasks-completed",
      title: "Tasks Completed",
      subtitle: "Completed / Day",
      value: range === "24h" ? "11" : range === "7d" ? "68" : range === "30d" ? "274" : "856",
      color: "var(--chart-1)",
      secondaryColor: "var(--chart-2)",
      data: generateTimeSeries(
        range,
        (i, t) => 8 + Math.sin(i / 5) * 4 + Math.random() * 6,
        (i) => 1 + Math.random() * 1.5,
      ),
    },
    {
      id: "x-mentions",
      title: "X Mentions & Replies",
      subtitle: "Interactions / Day",
      value: range === "24h" ? "23" : range === "7d" ? "156" : range === "30d" ? "589" : "1.8K",
      color: "var(--chart-1)",
      secondaryColor: "var(--chart-2)",
      data: generateTimeSeries(
        range,
        (i, t) => 15 + Math.sin(i / 3) * 8 + Math.random() * 10,
        (i) => 2 + Math.random() * 3,
      ),
    },
    {
      id: "x-feedback-rate",
      title: "X Feedback Rate",
      subtitle: "Percentage",
      value: range === "24h" ? "12.4%" : range === "7d" ? "11.8%" : range === "30d" ? "11.2%" : "10.9%",
      color: "var(--chart-3)",
      data: generateTimeSeries(range, (i) => 8 + Math.sin(i / 4) * 4 + Math.random() * 3),
    },
    {
      id: "ai-costs",
      title: "AI Costs",
      subtitle: "Cost / Day",
      value: range === "24h" ? "$4.82" : range === "7d" ? "$31.40" : range === "30d" ? "$128.50" : "$412.00",
      color: "var(--chart-4)",
      data: generateTimeSeries(range, (i, t) => 3 + Math.sin(i / 6) * 2 + Math.random() * 3),
    },
    {
      id: "ai-tokens",
      title: "AI Tokens",
      subtitle: "Tokens / Day",
      value: range === "24h" ? "248K" : range === "7d" ? "1.6M" : range === "30d" ? "6.8M" : "21.2M",
      color: "var(--chart-4)",
      secondaryColor: "var(--chart-2)",
      data: generateTimeSeries(
        range,
        (i, t) => 180 + Math.sin(i / 5) * 60 + Math.random() * 40,
        (i) => 10 + Math.random() * 15,
      ),
    },
  ]
}

// ── Custom tooltip ──

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-[4px] bg-popover px-2 py-1.5 text-[11px] ring-1 ring-border shadow-sm">
      <p className="text-muted-foreground">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="font-medium" style={{ color: entry.color }}>
          {entry.name === "secondary" ? "Errors" : "Value"}: {Math.round(entry.value)}
        </p>
      ))}
    </div>
  )
}

// ── Metric card component ──

function MetricCardComponent({ metric }: { metric: MetricCard }) {
  return (
    <motion.div
      variants={fadeUp}
      className="group flex flex-col rounded-[4px] bg-card ring-1 ring-border transition-colors hover:ring-border/80"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
        <h3 className="text-[13px] font-semibold text-foreground">{metric.title}</h3>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={14}
          className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>

      {/* Metric value */}
      <div className="px-4 pb-2">
        <p className="text-[11px] text-muted-foreground">{metric.subtitle}</p>
        <p className="text-[22px] font-semibold tracking-tight text-foreground leading-tight">
          {metric.value}
        </p>
      </div>

      {/* Chart */}
      <div className="h-[100px] w-full px-1 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={metric.data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${metric.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={metric.color} stopOpacity={0.08} />
                <stop offset="100%" stopColor={metric.color} stopOpacity={0} />
              </linearGradient>
              {metric.secondaryColor && (
                <linearGradient id={`grad-sec-${metric.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={metric.secondaryColor} stopOpacity={0.08} />
                  <stop offset="100%" stopColor={metric.secondaryColor} stopOpacity={0} />
                </linearGradient>
              )}
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              strokeOpacity={0.5}
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={30}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v)
              }
            />
            <RechartsTooltip content={<ChartTooltip />} />
            {metric.secondaryColor && (
              <Area
                type="monotone"
                dataKey="secondary"
                stroke={metric.secondaryColor}
                strokeWidth={1.5}
                fill={`url(#grad-sec-${metric.id})`}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            )}
            <Area
              type="monotone"
              dataKey="value"
              stroke={metric.color}
              strokeWidth={1.5}
              fill={`url(#grad-${metric.id})`}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  )
}

// ── Time range selector ──

const timeRanges: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
]

// ── Sort options ──

const sortOptions: { value: SortField; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "value", label: "Value" },
]

// ── Page ──

export default function ObservabilityPage() {
  const [range, setRange] = useState<TimeRange>("24h")
  const [sortField, setSortField] = useState<SortField>("name")
  const [sortDir, setSortDir] = useState<SortDirection>("asc")
  const [filterOpen, setFilterOpen] = useState(false)
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(
    new Set(["discord", "tasks", "x", "ai"]),
  )

  useEffect(() => {
    document.title = "Observability — Median"
  }, [])

  const metrics = buildMetrics(range)

  // Filter
  const categoryMap: Record<string, string[]> = {
    discord: ["discord-messages", "discord-feedback", "feedback-rate"],
    tasks: ["tasks-per-day", "task-acceptance", "tasks-completed"],
    x: ["x-mentions", "x-feedback-rate"],
    ai: ["ai-costs", "ai-tokens"],
  }

  const visibleIds = new Set(
    Array.from(visibleCategories).flatMap((cat) => categoryMap[cat] ?? []),
  )

  let filtered = metrics.filter((m) => visibleIds.has(m.id))

  // Sort
  if (sortField === "name") {
    filtered.sort((a, b) =>
      sortDir === "asc" ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title),
    )
  } else {
    filtered.sort((a, b) => {
      const aNum = parseFloat(a.value.replace(/[^0-9.]/g, "")) || 0
      const bNum = parseFloat(b.value.replace(/[^0-9.]/g, "")) || 0
      return sortDir === "asc" ? aNum - bNum : bNum - aNum
    })
  }

  function toggleCategory(cat: string) {
    setVisibleCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) {
        if (next.size > 1) next.delete(cat)
      } else {
        next.add(cat)
      }
      return next
    })
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  return (
    <Stagger className="mx-auto w-full max-w-5xl px-6 py-6">
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-center justify-between">
        <div>
          <h1 className="text-[14px] font-semibold tracking-tight">Observability</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Monitor your workspace activity and AI usage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter toggle */}
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className={`flex h-7 items-center gap-1.5 rounded-[4px] px-2.5 text-[12px] font-medium ring-1 transition-colors ${
              filterOpen
                ? "bg-foreground text-background ring-foreground"
                : "text-muted-foreground ring-border hover:text-foreground hover:ring-foreground/30"
            }`}
          >
            <HugeiconsIcon icon={FilterIcon} size={13} />
            Filter
          </button>

          {/* Sort */}
          <div className="flex h-7 items-center rounded-[4px] ring-1 ring-border">
            {sortOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => toggleSort(opt.value)}
                className={`flex h-full items-center gap-1 px-2.5 text-[12px] font-medium transition-colors first:rounded-l-[4px] last:rounded-r-[4px] ${
                  sortField === opt.value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
                {sortField === opt.value && (
                  <span className="text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
            ))}
          </div>

          {/* Time range */}
          <div className="flex h-7 items-center rounded-[4px] ring-1 ring-border">
            {timeRanges.map((tr) => (
              <button
                key={tr.value}
                onClick={() => setRange(tr.value)}
                className={`flex h-full items-center px-2.5 text-[12px] font-medium transition-colors first:rounded-l-[4px] last:rounded-r-[4px] ${
                  range === tr.value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tr.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Filter bar */}
      {filterOpen && (
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mt-3 flex items-center gap-1.5"
        >
          {Object.keys(categoryMap).map((cat) => {
            const active = visibleCategories.has(cat)
            return (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`flex h-7 items-center rounded-[4px] px-2.5 text-[12px] font-medium capitalize ring-1 transition-colors ${
                  active
                    ? "bg-foreground text-background ring-foreground"
                    : "text-muted-foreground ring-border hover:text-foreground hover:ring-foreground/30"
                }`}
              >
                {cat}
              </button>
            )
          })}
        </motion.div>
      )}

      {/* Grid */}
      <motion.div variants={fadeUp} className="mt-4 grid grid-cols-2 gap-3">
        {filtered.map((metric) => (
          <MetricCardComponent key={metric.id} metric={metric} />
        ))}
      </motion.div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <motion.div
          variants={fadeUp}
          className="mt-8 flex flex-col items-center justify-center text-center"
        >
          <p className="text-[13px] text-muted-foreground">
            No metrics visible. Adjust your filters to see data.
          </p>
        </motion.div>
      )}
    </Stagger>
  )
}
