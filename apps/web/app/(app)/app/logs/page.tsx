"use client"

import { useState, useEffect, type ReactNode } from "react"
import { motion } from "motion/react"
import {
  ClockCounterClockwise,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
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
  XLogo,
} from "@phosphor-icons/react"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"

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

// ── Mock data ────────────────────────────────────────────

const activityData = [
  { day: "Mon", tasks: 8, webhooks: 12, events: 5 },
  { day: "Tue", tasks: 12, webhooks: 8, events: 7 },
  { day: "Wed", tasks: 6, webhooks: 15, events: 3 },
  { day: "Thu", tasks: 14, webhooks: 10, events: 9 },
  { day: "Fri", tasks: 9, webhooks: 18, events: 6 },
  { day: "Sat", tasks: 3, webhooks: 5, events: 2 },
  { day: "Sun", tasks: 5, webhooks: 7, events: 4 },
]

const sourceDistribution = [
  { name: "Discord", value: 34, color: "var(--chart-1)" },
  { name: "GitHub", value: 28, color: "var(--chart-2)" },
  { name: "Linear", value: 18, color: "var(--chart-3)" },
  { name: "X", value: 12, color: "var(--chart-4)" },
  { name: "CLI", value: 8, color: "var(--chart-5)" },
]

const webhooksByPlatform = [
  { platform: "Discord", received: 45, processed: 42, errors: 3 },
  { platform: "GitHub", received: 38, processed: 37, errors: 1 },
  { platform: "Linear", received: 22, processed: 22, errors: 0 },
  { platform: "X", received: 15, processed: 12, errors: 3 },
]

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
  id: string
  type: EventType
  message: string
  timestamp: number
  source?: "discord" | "github" | "linear" | "x" | "cli" | "manual" | "ai"
  metadata?: Record<string, string | number>
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

const SOURCE_ICONS: Record<string, typeof DiscordLogo> = {
  discord: DiscordLogo,
  github: GithubLogo,
  x: XLogo,
}

const now = Date.now()
const HOUR = 3600000
const MIN = 60000

const mockEvents: LogEvent[] = [
  { id: "1", type: "task_created", message: 'Task MDN-47 "Fix auth token refresh" created', timestamp: now - 12 * MIN, source: "manual" },
  { id: "2", type: "webhook_received", message: "GitHub webhook: push event on median/app", timestamp: now - 25 * MIN, source: "github", metadata: { eventType: "push", action: "completed" } },
  { id: "3", type: "feedback_processed", message: "Processed 3 Discord messages, created 1 task", timestamp: now - 38 * MIN, source: "discord", metadata: { messageCount: "3", createdTasks: "1" } },
  { id: "4", type: "task_moved", message: 'MDN-42 moved from "In Progress" to "Ready"', timestamp: now - 1.2 * HOUR, source: "manual", metadata: { from: "in_progress", to: "ready" } },
  { id: "5", type: "tasks_generated_ai", message: "AI generated 5 tasks from prompt", timestamp: now - 1.5 * HOUR, source: "ai", metadata: { taskCount: "5", durationMs: "3200" } },
  { id: "6", type: "integration_connected", message: "Linear integration connected to team ENG", timestamp: now - 2 * HOUR, source: "linear" },
  { id: "7", type: "webhook_received", message: "Linear webhook: issue.updated", timestamp: now - 2.5 * HOUR, source: "linear", metadata: { eventType: "issue.updated" } },
  { id: "8", type: "request_accepted", message: 'Request MDN-39 "Add dark mode support" accepted', timestamp: now - 3 * HOUR, source: "discord" },
  { id: "9", type: "task_updated", message: "MDN-38 priority changed to urgent", timestamp: now - 3.5 * HOUR, source: "manual" },
  { id: "10", type: "webhook_error", message: "X webhook delivery failed: timeout", timestamp: now - 4 * HOUR, source: "x", metadata: { status: "error" } },
  { id: "11", type: "member_joined", message: "sarah@example.com joined as member", timestamp: now - 5 * HOUR },
  { id: "12", type: "request_denied", message: 'Request MDN-36 "Add emoji picker" denied', timestamp: now - 6 * HOUR, source: "x" },
  { id: "13", type: "labels_saved", message: "Labels updated: 4 labels saved", timestamp: now - 7 * HOUR },
  { id: "14", type: "webhook_received", message: "Discord webhook: message_create in #feedback", timestamp: now - 8 * HOUR, source: "discord" },
  { id: "15", type: "task_deleted", message: "MDN-31 deleted", timestamp: now - 9 * HOUR, source: "manual" },
  { id: "16", type: "task_created", message: 'Task MDN-46 "Improve onboarding flow" created', timestamp: now - 10 * HOUR, source: "github" },
  { id: "17", type: "integration_disconnected", message: "X integration disconnected", timestamp: now - 12 * HOUR, source: "x" },
  { id: "18", type: "webhook_received", message: "GitHub webhook: issues.opened on median/app", timestamp: now - 14 * HOUR, source: "github" },
  { id: "19", type: "feedback_processed", message: "Processed 7 X posts, created 2 tasks", timestamp: now - 16 * HOUR, source: "x", metadata: { messageCount: "7", createdTasks: "2" } },
  { id: "20", type: "task_moved", message: 'MDN-44 moved from "Todo" to "In Progress"', timestamp: now - 18 * HOUR, source: "manual" },
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

type FilterType = "all" | "tasks" | "webhooks" | "integrations" | "members"

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "tasks", label: "Tasks" },
  { value: "webhooks", label: "Webhooks" },
  { value: "integrations", label: "Integrations" },
  { value: "members", label: "Members" },
]

const FILTER_MAP: Record<FilterType, EventType[]> = {
  all: [],
  tasks: ["task_created", "task_moved", "task_updated", "task_deleted", "tasks_generated_ai", "request_accepted", "request_denied", "feedback_processed"],
  webhooks: ["webhook_received", "webhook_error"],
  integrations: ["integration_connected", "integration_disconnected"],
  members: ["member_joined", "member_removed", "labels_saved"],
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

const PAGE_SIZE = 20

export default function LogsPage() {
  const [filter, setFilter] = useState<FilterType>("all")
  const [page, setPage] = useState(0)

  useEffect(() => {
    document.title = "Logs — Median"
  }, [])

  // Reset to first page when filter changes
  useEffect(() => {
    setPage(0)
  }, [filter])

  const filteredEvents =
    filter === "all"
      ? mockEvents
      : mockEvents.filter((e) => FILTER_MAP[filter].includes(e.type))

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE))
  const paginatedEvents = filteredEvents.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

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
        <motion.div variants={fadeUp} className="mb-6 grid grid-cols-3 gap-3">
          {/* Activity over time */}
          <div className="col-span-2 rounded-[4px] ring-1 ring-border p-4">
            <h3 className="mb-3 text-[13px] font-medium">Activity this week</h3>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <RechartsTooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="tasks" name="Tasks" stroke="var(--chart-1)" fill="url(#gradTasks)" strokeWidth={1.5} dot={false} />
                  <Area type="monotone" dataKey="webhooks" name="Webhooks" stroke="var(--chart-3)" fill="url(#gradWebhooks)" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <div className="size-1.5 rounded-full" style={{ backgroundColor: "var(--chart-1)" }} />
                Tasks
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <div className="size-1.5 rounded-full" style={{ backgroundColor: "var(--chart-3)" }} />
                Webhooks
              </div>
            </div>
          </div>

          {/* Source distribution */}
          <div className="rounded-[4px] ring-1 ring-border p-4">
            <h3 className="mb-3 text-[13px] font-medium">Events by source</h3>
            <div className="h-[140px]">
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
                    {sourceDistribution.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {sourceDistribution.map((s) => (
                <div key={s.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <div className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                  <span className="font-medium text-foreground">{s.value}</span>
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
              <BarChart data={webhooksByPlatform} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="platform" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <RechartsTooltip content={<ChartTooltip />} />
                <Bar dataKey="processed" name="Processed" fill="var(--chart-3)" radius={[2, 2, 0, 0]} barSize={18} />
                <Bar dataKey="errors" name="Errors" fill="var(--chart-5)" radius={[2, 2, 0, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <div className="size-1.5 rounded-full" style={{ backgroundColor: "var(--chart-3)" }} />
              Processed
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <div className="size-1.5 rounded-full" style={{ backgroundColor: "var(--chart-5)" }} />
              Errors
            </div>
          </div>
        </motion.div>

        {/* Event feed */}
        <motion.div variants={fadeUp}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-medium">Recent activity</h3>
            <div className="flex items-center gap-1 rounded-[4px] ring-1 ring-border p-0.5">
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
            {filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <ClockCounterClockwise size={24} className="text-muted-foreground/40" />
                <p className="mt-2 text-[13px] text-muted-foreground">No events match this filter</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {paginatedEvents.map((event) => {
                  const config = EVENT_CONFIG[event.type]
                  const Icon = config.icon
                  const SourceIcon = event.source ? SOURCE_ICONS[event.source] : null

                  return (
                    <div
                      key={event.id}
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
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatRelativeTime(event.timestamp)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          {filteredEvents.length > PAGE_SIZE && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredEvents.length)} of {filteredEvents.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex size-7 items-center justify-center rounded-[4px] ring-1 ring-border text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ArrowLeft size={12} />
                </button>
                <span className="px-2 text-[11px] text-muted-foreground">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="flex size-7 items-center justify-center rounded-[4px] ring-1 ring-border text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </Stagger>
  )
}

