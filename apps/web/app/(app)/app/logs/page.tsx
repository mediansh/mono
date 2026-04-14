"use client"

import { useState, useEffect, type ReactNode } from "react"
import { useConvex, usePaginatedQuery } from "convex/react"
import { motion } from "motion/react"
import {
  ClockCounterClockwise,
  ArrowUp,
  ArrowDown,
  Rocket,
  GitPullRequest,
  ChatCircleDots,
  Plugs,
  UserPlus,
  Tag,
  Trash,
  PencilSimple,
  SpinnerGap,
  Lightning,
  Robot,
  Users,
  GithubLogo,
  DiscordLogo,
  SlackLogo,
  XLogo,
} from "@phosphor-icons/react"
import { SiLinear } from "react-icons/si"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"

// ── Animation helpers ────────────────────────────────────

function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}
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

type EventType =
  | "task_created"
  | "task_moved"
  | "task_updated"
  | "task_deleted"
  | "tasks_generated_ai"
  | "request_accepted"
  | "request_denied"
  | "integration_connected"
  | "integration_disconnected"
  | "webhook_received"
  | "webhook_error"
  | "member_joined"
  | "member_removed"
  | "labels_saved"
  | "feedback_processed"

interface LogEvent {
  _id: string
  type: EventType
  message: string
  timestamp: number
  source?: "discord" | "slack" | "github" | "linear" | "x" | "cli" | "manual" | "ai"
  cost?: number
}

type LogsDashboard = {
  counts: {
    all: number
    tasks: number
    ai: number
    webhooks: number
    integrations: number
    members: number
  }
  activityData: Array<{ day: string; tasks: number; webhooks: number; events: number }>
  sourceDistribution: Array<{ name: string; value: number }>
  webhooksByPlatform: Array<{
    platform: string
    received: number
    processed: number
    errors: number
  }>
}

const EMPTY_DASHBOARD: LogsDashboard = {
  counts: {
    all: 0,
    tasks: 0,
    ai: 0,
    webhooks: 0,
    integrations: 0,
    members: 0,
  },
  activityData: [],
  sourceDistribution: [],
  webhooksByPlatform: [],
}

const EVENT_CONFIG: Record<
  EventType,
  { icon: typeof Rocket; label: string; color: string }
> = {
  task_created: { icon: Lightning, label: "Task Created", color: "text-emerald-500" },
  task_moved: { icon: ArrowUp, label: "Task Moved", color: "text-blue-500" },
  task_updated: { icon: PencilSimple, label: "Task Updated", color: "text-foreground" },
  task_deleted: { icon: Trash, label: "Task Deleted", color: "text-destructive" },
  tasks_generated_ai: { icon: Robot, label: "AI Generated", color: "text-purple-500" },
  request_accepted: { icon: ArrowUp, label: "Request Accepted", color: "text-emerald-500" },
  request_denied: { icon: ArrowDown, label: "Request Denied", color: "text-destructive" },
  integration_connected: { icon: Plugs, label: "Connected", color: "text-emerald-500" },
  integration_disconnected: { icon: Plugs, label: "Disconnected", color: "text-muted-foreground" },
  webhook_received: { icon: GitPullRequest, label: "Webhook", color: "text-blue-500" },
  webhook_error: { icon: SpinnerGap, label: "Webhook Error", color: "text-destructive" },
  member_joined: { icon: UserPlus, label: "Member Joined", color: "text-emerald-500" },
  member_removed: { icon: Users, label: "Member Removed", color: "text-muted-foreground" },
  labels_saved: { icon: Tag, label: "Labels Updated", color: "text-yellow-500" },
  feedback_processed: { icon: ChatCircleDots, label: "Feedback", color: "text-purple-500" },
}

const SOURCE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  discord: DiscordLogo,
  slack: SlackLogo,
  github: GithubLogo,
  x: XLogo,
  linear: SiLinear,
}

const HOUR = 3600000
const MIN = 60000

// ── Helpers ──────────────────────────────────────────────

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / MIN)
  const hours = Math.floor(diff / HOUR)
  const days = Math.floor(diff / (24 * HOUR))

  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

type FilterType = "all" | "tasks" | "ai" | "webhooks" | "integrations" | "members"

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "tasks", label: "Tasks" },
  { value: "ai", label: "AI" },
  { value: "webhooks", label: "Webhooks" },
  { value: "integrations", label: "Integrations" },
  { value: "members", label: "Members" },
]

const SOURCE_COLORS: Record<string, string> = {
  Discord: "var(--chart-1)",
  Slack: "var(--chart-2)",
  GitHub: "var(--chart-3)",
  Linear: "var(--chart-4)",
  X: "var(--chart-5)",
  CLI: "var(--chart-6)",
}

function formatCurrency(amount: number) {
  return `$${amount.toFixed(amount < 0.01 ? 4 : 2)}`
}

// ── Custom tooltip ───────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-[4px] border border-border bg-card px-2.5 py-1.5 shadow-sm">
      <p className="mb-1 text-[11px] font-medium text-foreground">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <div className="size-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span>{entry.name}:</span>
          <span className="font-medium text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main component ───────────────────────────────────────

function LogsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="h-4 w-16 rounded-[4px] bg-muted/40" />
        <div className="mt-2 h-3 w-56 rounded-[4px] bg-muted/30" />
      </div>

      {/* Charts row */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="col-span-1 rounded-[4px] ring-1 ring-border p-4 md:col-span-2">
          <div className="mb-3 h-3.5 w-28 rounded-[4px] bg-muted/40" />
          <div className="h-[180px] rounded-[4px] bg-muted/20" />
        </div>
        <div className="rounded-[4px] ring-1 ring-border p-4">
          <div className="mb-3 h-3.5 w-24 rounded-[4px] bg-muted/40" />
          <div className="h-[180px] rounded-[4px] bg-muted/20" />
        </div>
      </div>

      {/* Webhook chart */}
      <div className="mb-6 rounded-[4px] ring-1 ring-border p-4">
        <div className="mb-3 h-3.5 w-32 rounded-[4px] bg-muted/40" />
        <div className="h-[160px] rounded-[4px] bg-muted/20" />
      </div>

      {/* Event feed */}
      <div className="mb-3 flex items-center justify-between">
        <div className="h-3.5 w-24 rounded-[4px] bg-muted/40" />
        <div className="h-6 w-60 rounded-[4px] bg-muted/30" />
      </div>
      <div className="rounded-[4px] ring-1 ring-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5 border-b border-border px-3 py-1.5 last:border-0">
            <div className="size-5 rounded-[3px] bg-muted/40" />
            <div className="h-3 w-16 rounded-[3px] bg-muted/30" />
            <div className="h-3 flex-1 rounded-[3px] bg-muted/20" />
            <div className="h-3 w-10 rounded-[3px] bg-muted/30" />
          </div>
        ))}
      </div>
    </div>
  )
}

const PAGE_SIZE = 20

export default function LogsPage() {
  const convex = useConvex()
  const { currentWorkspace } = useWorkspace()
  const [filter, setFilter] = useState<FilterType>("all")
  const [dashboard, setDashboard] = useState<LogsDashboard | undefined>()

  useEffect(() => {
    document.title = "Logs — Median"
  }, [])
  useEffect(() => {
    if (!currentWorkspace) {
      setDashboard(undefined)
      return
    }

    let cancelled = false
    setDashboard(undefined)

    void convex
      .query(api.logs.getWorkspaceLogDashboard, {
        workspaceId: currentWorkspace._id,
      })
      .then((result) => {
        if (!cancelled) {
          setDashboard(result as LogsDashboard)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDashboard(EMPTY_DASHBOARD)
        }
      })

    return () => {
      cancelled = true
    }
  }, [convex, currentWorkspace])

  const { results, status, loadMore } = usePaginatedQuery(
    api.logs.listWorkspaceLogs,
    currentWorkspace
      ? {
          workspaceId: currentWorkspace._id,
          filter,
        }
      : "skip",
    { initialNumItems: PAGE_SIZE }
  )

  if (dashboard === undefined || status === "LoadingFirstPage") {
    return <LogsSkeleton />
  }

  const events = results as LogEvent[]
  const activityData =
    dashboard?.activityData.length
      ? dashboard.activityData
      : [
      { day: "Mon", tasks: 0, webhooks: 0, events: 0 },
      { day: "Tue", tasks: 0, webhooks: 0, events: 0 },
      { day: "Wed", tasks: 0, webhooks: 0, events: 0 },
      { day: "Thu", tasks: 0, webhooks: 0, events: 0 },
      { day: "Fri", tasks: 0, webhooks: 0, events: 0 },
      { day: "Sat", tasks: 0, webhooks: 0, events: 0 },
      { day: "Sun", tasks: 0, webhooks: 0, events: 0 },
    ]
  const sourceDistribution =
    dashboard?.sourceDistribution.length
      ? dashboard.sourceDistribution.map((entry: { name: string; value: number }) => ({
          ...entry,
          color: SOURCE_COLORS[entry.name] ?? "var(--chart-1)",
        }))
      : Object.entries(SOURCE_COLORS).map(([name, color]) => ({
          name,
          value: 0,
          color,
        }))
  const webhooksByPlatform =
    dashboard?.webhooksByPlatform.length
      ? dashboard.webhooksByPlatform
      : [
      { platform: "Discord", received: 0, processed: 0, errors: 0 },
      { platform: "Slack", received: 0, processed: 0, errors: 0 },
      { platform: "GitHub", received: 0, processed: 0, errors: 0 },
      { platform: "Linear", received: 0, processed: 0, errors: 0 },
      { platform: "X", received: 0, processed: 0, errors: 0 },
    ]

  return (
    <Stagger className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-6 py-6">
        {/* Header */}
        <motion.div variants={fadeUp} className="mb-6">
          <div className="flex items-center gap-2">
            <ClockCounterClockwise size={16} weight="bold" className="text-foreground" />
            <h2 className="text-[14px] font-semibold">Logs</h2>
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Activity feed and event history for your workspace.
          </p>
        </motion.div>

        {/* Charts row */}
        <motion.div variants={fadeUp} className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          {/* Activity over time */}
          <div className="col-span-1 rounded-[4px] ring-1 ring-border p-4 md:col-span-2">
            <h3 className="mb-3 text-[13px] font-medium">Activity this week</h3>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityData} margin={{ top: 4, right: 4, left: 4, bottom: 16 }}>
                  <defs>
                    <linearGradient id="gradTasks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradWebhooks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <RechartsTooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="tasks" name="Tasks" stroke="var(--chart-1)" fill="url(#gradTasks)" strokeWidth={1.5} dot={false} />
                  <Area type="monotone" dataKey="webhooks" name="Webhooks" stroke="var(--chart-3)" fill="url(#gradWebhooks)" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Source distribution */}
          <div className="rounded-[4px] ring-1 ring-border p-4">
            <h3 className="mb-3 text-[13px] font-medium">Events by source</h3>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sourceDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={58}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {sourceDistribution.map((entry: { name: string; value: number; color: string }) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
              {sourceDistribution.map((s: { name: string; value: number; color: string }) => (
                <div key={s.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <div className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Webhook health */}
        <motion.div variants={fadeUp} className="mb-6 rounded-[4px] ring-1 ring-border p-4">
          <h3 className="mb-3 text-[13px] font-medium">Webhook deliveries</h3>
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={webhooksByPlatform} margin={{ top: 4, right: 4, left: 4, bottom: 16 }} barGap={2}>
                <XAxis dataKey="platform" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <RechartsTooltip content={<ChartTooltip />} />
                <Bar dataKey="processed" name="Processed" fill="var(--chart-3)" radius={[2, 2, 0, 0]} barSize={18} />
                <Bar dataKey="errors" name="Errors" fill="var(--chart-5)" radius={[2, 2, 0, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Event feed */}
        <motion.div variants={fadeUp}>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-[13px] font-medium">Recent activity</h3>
            <div className="flex items-center gap-1 overflow-x-auto rounded-[4px] ring-1 ring-border p-0.5 scrollbar-hide">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={`rounded-[3px] px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    filter === opt.value
                      ? "bg-background text-foreground ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[4px] ring-1 ring-border">
            {events.length === 0 && status === "Exhausted" ? (
              <div className="flex flex-col items-center justify-center py-12">
                <ClockCounterClockwise size={24} className="text-muted-foreground/40" />
                <p className="mt-2 text-[13px] text-muted-foreground">No events match this filter</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {events.map((event) => {
                  const config = EVENT_CONFIG[event.type]
                  const Icon = config.icon
                  const SourceIcon = event.source ? SOURCE_ICONS[event.source] : null

                  return (
                    <div
                      key={event._id}
                      className="group flex items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-muted/30"
                    >
                      <div className={`flex size-5 shrink-0 items-center justify-center rounded-[3px] bg-muted/50 ${config.color}`}>
                        <Icon size={11} weight="bold" />
                      </div>
                      <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{config.label}</span>
                      {SourceIcon && (
                        <SourceIcon size={11} className="shrink-0 text-muted-foreground/60" />
                      )}
                      <p className="min-w-0 flex-1 truncate text-[12px] text-foreground">{event.message}</p>
                      {event.cost !== undefined && event.cost > 0 && (
                        <span className="shrink-0 text-[11px] tabular-nums font-medium text-muted-foreground">
                          {formatCurrency(event.cost)}
                        </span>
                      )}
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatRelativeTime(event.timestamp)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {status === "CanLoadMore" && (
            <div className="mt-3 flex justify-center">
              <button
                onClick={() => loadMore(PAGE_SIZE)}
                className="flex h-7 items-center rounded-[4px] px-3 text-[12px] font-medium text-muted-foreground ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground"
              >
                Load more
              </button>
            </div>
          )}

          {status === "LoadingMore" && (
            <div className="mt-3 flex justify-center">
              <span className="text-[12px] text-muted-foreground">Loading...</span>
            </div>
          )}
        </motion.div>
      </div>
    </Stagger>
  )
}
