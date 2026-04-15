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
} from "@phosphor-icons/react"
import { FaXTwitter, FaDiscord, FaGithub, FaSlack } from "react-icons/fa6"
import { FaTerminal } from "react-icons/fa6"
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
  discord: FaDiscord,
  slack: FaSlack,
  github: FaGithub,
  x: FaXTwitter,
  linear: SiLinear,
  cli: FaTerminal,
}

const HOUR = 3600000
const MIN = 60000

// ── Mock data (used when no real workspace activity exists yet) ──

const MOCK_ACTIVITY: Array<{ day: string; tasks: number; webhooks: number; events: number }> = [
  { day: "Mon", tasks: 12, webhooks: 18, events: 42 },
  { day: "Tue", tasks: 24, webhooks: 31, events: 78 },
  { day: "Wed", tasks: 38, webhooks: 27, events: 95 },
  { day: "Thu", tasks: 29, webhooks: 44, events: 88 },
  { day: "Fri", tasks: 51, webhooks: 38, events: 120 },
  { day: "Sat", tasks: 8, webhooks: 12, events: 22 },
  { day: "Sun", tasks: 14, webhooks: 9, events: 28 },
]

const MOCK_SOURCE_DISTRIBUTION: Array<{ name: string; value: number }> = [
  { name: "Discord", value: 142 },
  { name: "Slack", value: 89 },
  { name: "GitHub", value: 67 },
  { name: "Linear", value: 54 },
  { name: "X", value: 23 },
  { name: "CLI", value: 31 },
]

const MOCK_WEBHOOKS_BY_PLATFORM: Array<{
  platform: string
  received: number
  processed: number
  errors: number
}> = [
  { platform: "Discord", received: 58, processed: 55, errors: 3 },
  { platform: "Slack", received: 42, processed: 41, errors: 1 },
  { platform: "GitHub", received: 37, processed: 35, errors: 2 },
  { platform: "Linear", received: 21, processed: 21, errors: 0 },
  { platform: "X", received: 12, processed: 11, errors: 1 },
]

const MOCK_EVENTS: LogEvent[] = [
  {
    _id: "mock-1",
    type: "task_created",
    message: "Add OAuth login flow to onboarding",
    timestamp: Date.now() - 3 * MIN,
    source: "manual",
  },
  {
    _id: "mock-2",
    type: "tasks_generated_ai",
    message: "Generated 4 tasks from AI prompt: \"Set up billing portal\"",
    timestamp: Date.now() - 11 * MIN,
    source: "ai",
    cost: 0.0142,
  },
  {
    _id: "mock-3",
    type: "webhook_received",
    message: "GitHub: pull_request opened in mediansh/web",
    timestamp: Date.now() - 24 * MIN,
    source: "github",
  },
  {
    _id: "mock-4",
    type: "task_moved",
    message: "Moved \"Fix mobile sidebar\" to In progress",
    timestamp: Date.now() - 42 * MIN,
    source: "manual",
  },
  {
    _id: "mock-5",
    type: "request_accepted",
    message: "Approved feature request from @harrison",
    timestamp: Date.now() - 1 * HOUR,
    source: "discord",
  },
  {
    _id: "mock-6",
    type: "webhook_received",
    message: "Linear: issue MED-218 status changed to Done",
    timestamp: Date.now() - 2 * HOUR,
    source: "linear",
  },
  {
    _id: "mock-7",
    type: "feedback_processed",
    message: "Processed 3 new feedback items from #product channel",
    timestamp: Date.now() - 3 * HOUR,
    source: "slack",
    cost: 0.0089,
  },
  {
    _id: "mock-8",
    type: "task_updated",
    message: "Updated description on \"Refactor billing webhook handler\"",
    timestamp: Date.now() - 4 * HOUR,
    source: "cli",
  },
  {
    _id: "mock-9",
    type: "labels_saved",
    message: "Updated 2 workspace labels (added: design, removed: misc)",
    timestamp: Date.now() - 6 * HOUR,
    source: "manual",
  },
  {
    _id: "mock-10",
    type: "member_joined",
    message: "Sarah Chen joined the workspace",
    timestamp: Date.now() - 8 * HOUR,
  },
  {
    _id: "mock-11",
    type: "integration_connected",
    message: "Connected GitHub integration to mediansh org",
    timestamp: Date.now() - 11 * HOUR,
    source: "github",
  },
  {
    _id: "mock-12",
    type: "webhook_error",
    message: "X: signature verification failed (retrying)",
    timestamp: Date.now() - 14 * HOUR,
    source: "x",
  },
  {
    _id: "mock-13",
    type: "task_deleted",
    message: "Deleted task \"Old onboarding draft\"",
    timestamp: Date.now() - 18 * HOUR,
    source: "manual",
  },
  {
    _id: "mock-14",
    type: "tasks_generated_ai",
    message: "Generated 7 tasks from AI prompt: \"Plan Q2 marketing site refresh\"",
    timestamp: Date.now() - 22 * HOUR,
    source: "ai",
    cost: 0.0231,
  },
  {
    _id: "mock-15",
    type: "request_denied",
    message: "Denied access request from external user",
    timestamp: Date.now() - 26 * HOUR,
  },
]

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

// CSS variables follow the active theme (light/dark) and stay
// consistent with the area + bar charts that already reference them.
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

  const realEvents = results as LogEvent[]
  // Mock events act as an empty-state demo for the integration icons.
  // Only render them when the workspace has no real activity AND the
  // user is on the unfiltered view, so they don't pollute filtered
  // results or hide the "No events match this filter" empty state.
  const events =
    realEvents.length > 0
      ? realEvents
      : filter === "all"
        ? MOCK_EVENTS
        : realEvents

  const realActivityHasData = dashboard?.activityData.some(
    (d) => d.tasks > 0 || d.webhooks > 0 || d.events > 0
  )
  const activityData = realActivityHasData
    ? dashboard!.activityData
    : MOCK_ACTIVITY

  const realSourceHasData = dashboard?.sourceDistribution.some(
    (d) => d.value > 0
  )
  const sourceDistribution = (
    realSourceHasData ? dashboard!.sourceDistribution : MOCK_SOURCE_DISTRIBUTION
  ).map((entry: { name: string; value: number }) => ({
    ...entry,
    color: SOURCE_COLORS[entry.name] ?? "var(--chart-1)",
  }))

  const realWebhooksHaveData = dashboard?.webhooksByPlatform.some(
    (d) => d.received > 0 || d.processed > 0 || d.errors > 0
  )
  const webhooksByPlatform = realWebhooksHaveData
    ? dashboard!.webhooksByPlatform
    : MOCK_WEBHOOKS_BY_PLATFORM

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
                <defs>
                  <pattern
                    id="barCursorStripes"
                    patternUnits="userSpaceOnUse"
                    width="6"
                    height="6"
                    patternTransform="rotate(45)"
                  >
                    <rect width="6" height="6" fill="rgba(155,157,158,0.06)" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(155,157,158,0.16)" strokeWidth="2" />
                  </pattern>
                </defs>
                <XAxis dataKey="platform" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <RechartsTooltip
                  content={<ChartTooltip />}
                  cursor={{ fill: "url(#barCursorStripes)" }}
                />
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
