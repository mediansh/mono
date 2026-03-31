"use client"

import { useState, useEffect, type ReactNode } from "react"
import { motion } from "motion/react"
import {
  CreditCard,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  Lightning,
  Robot,
  ChatCircleDots,
  Plugs,
  Check,
  ArrowUpRight,
  Warning,
  Crown,
} from "@phosphor-icons/react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
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

// ── Types ────────────────────────────────────────────────

interface Plan {
  name: string
  price: number
  tokenBudget: number
  eventLimit: number
  features: string[]
  highlighted?: boolean
}

interface UsageRecord {
  id: string
  type: "ai_generation" | "event_ingested" | "overage_charge" | "ai_tool_call"
  description: string
  tokens?: number
  cost?: number
  timestamp: number
}

// ── Mock data ────────────────────────────────────────────

const CURRENT_PLAN = "plus"

const PLANS: Plan[] = [
  {
    name: "Starter",
    price: 8,
    tokenBudget: 8,
    eventLimit: 1500,
    features: [
      "$8 AI token budget / month",
      "Up to 1,500 events ingested",
      "Overages auto-charged",
    ],
  },
  {
    name: "Plus",
    price: 20,
    tokenBudget: 20,
    eventLimit: 5000,
    highlighted: true,
    features: [
      "$20 AI token budget / month",
      "Up to 5,000 events ingested",
      "Overages auto-charged",
    ],
  },
  {
    name: "Scale",
    price: 40,
    tokenBudget: 45,
    eventLimit: 20000,
    features: [
      "$45 AI token budget / month",
      "Up to 20,000 events ingested",
      "Priority support",
      "Overages auto-charged",
    ],
  },
]

function generateTokenData() {
  const days: { day: string; input: number; output: number }[] = []
  let cumulativeInput = 0
  let cumulativeOutput = 0
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const currentDay = now.getDate()

  for (let i = 1; i <= currentDay; i++) {
    cumulativeInput += Math.floor(Math.random() * 28000) + 8000
    cumulativeOutput += Math.floor(Math.random() * 42000) + 14000
    days.push({
      day: i === 1 || i % 5 === 0 || i === currentDay ? `${i}` : "",
      input: cumulativeInput,
      output: cumulativeOutput,
    })
  }

  return { days, totalInput: cumulativeInput, totalOutput: cumulativeOutput, daysInMonth }
}

function generateEventData() {
  const days: { day: string; events: number }[] = []
  let cumulative = 0
  const now = new Date()
  const currentDay = now.getDate()

  for (let i = 1; i <= currentDay; i++) {
    cumulative += Math.floor(Math.random() * 120) + 30
    days.push({
      day: i === 1 || i % 5 === 0 || i === currentDay ? `${i}` : "",
      events: cumulative,
    })
  }

  return { days, total: cumulative }
}

const TOKEN_DATA = generateTokenData()
const EVENT_DATA = generateEventData()

const MOCK_USAGE_RECORDS: UsageRecord[] = [
  { id: "1", type: "ai_generation", description: "Task breakdown generated for 'Redesign onboarding flow'", tokens: 3420, cost: 0.0041, timestamp: Date.now() - 180000 },
  { id: "2", type: "event_ingested", description: "Discord message synced from #product-feedback", timestamp: Date.now() - 720000 },
  { id: "3", type: "ai_tool_call", description: "AI summary generated for Linear issue MDN-142", tokens: 1850, cost: 0.0022, timestamp: Date.now() - 1800000 },
  { id: "4", type: "event_ingested", description: "GitHub PR #87 webhook received", timestamp: Date.now() - 3600000 },
  { id: "5", type: "ai_generation", description: "Sprint retrospective insights generated", tokens: 5200, cost: 0.0062, timestamp: Date.now() - 7200000 },
  { id: "6", type: "event_ingested", description: "Linear issue created via sync", timestamp: Date.now() - 10800000 },
  { id: "7", type: "overage_charge", description: "Token budget overage — 12,400 tokens over limit", tokens: 12400, cost: 0.015, timestamp: Date.now() - 14400000 },
  { id: "8", type: "ai_tool_call", description: "Feedback sentiment analysis on 8 Discord messages", tokens: 2100, cost: 0.0025, timestamp: Date.now() - 18000000 },
  { id: "9", type: "event_ingested", description: "Discord message synced from #bug-reports", timestamp: Date.now() - 21600000 },
  { id: "10", type: "ai_generation", description: "Task prioritization suggestions generated", tokens: 4300, cost: 0.0052, timestamp: Date.now() - 25200000 },
  { id: "11", type: "event_ingested", description: "GitHub issue #203 webhook received", timestamp: Date.now() - 28800000 },
  { id: "12", type: "event_ingested", description: "Linear cycle update synced", timestamp: Date.now() - 32400000 },
  { id: "13", type: "ai_generation", description: "Meeting notes summarized from transcript", tokens: 6800, cost: 0.0082, timestamp: Date.now() - 36000000 },
  { id: "14", type: "overage_charge", description: "Event ingestion overage — 340 events over limit", cost: 0.034, timestamp: Date.now() - 39600000 },
  { id: "15", type: "event_ingested", description: "X mention tracked: @median_app feature request", timestamp: Date.now() - 43200000 },
  { id: "16", type: "ai_tool_call", description: "Auto-label assignment for 5 new tasks", tokens: 980, cost: 0.0012, timestamp: Date.now() - 46800000 },
  { id: "17", type: "event_ingested", description: "Discord message synced from #general", timestamp: Date.now() - 50400000 },
  { id: "18", type: "ai_generation", description: "Weekly digest generated for workspace", tokens: 7200, cost: 0.0086, timestamp: Date.now() - 54000000 },
  { id: "19", type: "event_ingested", description: "GitHub commit pushed to main branch", timestamp: Date.now() - 57600000 },
  { id: "20", type: "event_ingested", description: "Linear issue status changed: In Progress", timestamp: Date.now() - 61200000 },
  { id: "21", type: "ai_tool_call", description: "Code review summary for PR #91", tokens: 3100, cost: 0.0037, timestamp: Date.now() - 64800000 },
  { id: "22", type: "event_ingested", description: "Discord thread created in #feature-requests", timestamp: Date.now() - 68400000 },
  { id: "23", type: "ai_generation", description: "User story generated from feedback cluster", tokens: 4800, cost: 0.0058, timestamp: Date.now() - 72000000 },
  { id: "24", type: "event_ingested", description: "GitHub Actions workflow completed", timestamp: Date.now() - 75600000 },
  { id: "25", type: "overage_charge", description: "Token budget overage — 8,200 tokens over limit", tokens: 8200, cost: 0.0098, timestamp: Date.now() - 79200000 },
]

// ── Helpers ──────────────────────────────────────────────

const HOUR = 3600000
const MIN = 60000

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

function formatTokens(tokens: number) {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`
  return tokens.toString()
}

function formatCurrency(amount: number) {
  return `$${amount.toFixed(amount < 0.01 ? 4 : 2)}`
}

const RECORD_CONFIG: Record<UsageRecord["type"], { icon: typeof Lightning; label: string; color: string }> = {
  ai_generation: { icon: Robot, label: "AI Generation", color: "text-purple-500" },
  event_ingested: { icon: Plugs, label: "Event Ingested", color: "text-blue-500" },
  overage_charge: { icon: Warning, label: "Overage", color: "text-amber-500" },
  ai_tool_call: { icon: Lightning, label: "Tool Call", color: "text-emerald-500" },
}

type FilterType = "all" | "ai" | "events" | "overages"

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ai", label: "AI Usage" },
  { value: "events", label: "Events" },
  { value: "overages", label: "Overages" },
]

function filterRecords(records: UsageRecord[], filter: FilterType): UsageRecord[] {
  if (filter === "all") return records
  if (filter === "ai") return records.filter((r) => r.type === "ai_generation" || r.type === "ai_tool_call")
  if (filter === "events") return records.filter((r) => r.type === "event_ingested")
  return records.filter((r) => r.type === "overage_charge")
}

// ── Custom tooltip ───────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-[4px] border border-border bg-card px-2.5 py-1.5 shadow-sm">
      {label && <p className="mb-1 text-[11px] font-medium text-foreground">Day {label}</p>}
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <div className="size-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span>{entry.name}:</span>
          <span className="font-medium text-foreground">{entry.name === "Events" ? entry.value.toLocaleString() : formatTokens(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Skeleton ─────────────────────────────────────────────

function BillingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-6">
      <div className="mb-6">
        <div className="h-4 w-16 rounded-[4px] bg-muted/40" />
        <div className="mt-2 h-3 w-56 rounded-[4px] bg-muted/30" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-[4px] ring-1 ring-border p-4">
          <div className="mb-3 h-3.5 w-28 rounded-[4px] bg-muted/40" />
          <div className="h-[180px] rounded-[4px] bg-muted/20" />
        </div>
        <div className="rounded-[4px] ring-1 ring-border p-4">
          <div className="mb-3 h-3.5 w-28 rounded-[4px] bg-muted/40" />
          <div className="h-[180px] rounded-[4px] bg-muted/20" />
        </div>
      </div>
      <div className="mb-6 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-[4px] ring-1 ring-border p-4">
            <div className="mb-2 h-4 w-16 rounded-[4px] bg-muted/40" />
            <div className="mb-4 h-6 w-20 rounded-[4px] bg-muted/30" />
            <div className="space-y-2">
              <div className="h-3 w-full rounded-[4px] bg-muted/20" />
              <div className="h-3 w-3/4 rounded-[4px] bg-muted/20" />
              <div className="h-3 w-5/6 rounded-[4px] bg-muted/20" />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-[4px] ring-1 ring-border">
        {Array.from({ length: 6 }).map((_, i) => (
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

// ── Main component ───────────────────────────────────────

const PAGE_SIZE = 20

export default function BillingPage() {
  const [filter, setFilter] = useState<FilterType>("all")
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = "Billing — Median"
    const t = setTimeout(() => setLoading(false), 400)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    setPage(0)
  }, [filter])

  if (loading) return <BillingSkeleton />

  const currentPlanData = PLANS.find((p) => p.name.toLowerCase() === CURRENT_PLAN)!
  const tokenSpend = ((TOKEN_DATA.totalInput + TOKEN_DATA.totalOutput) / 1000000) * 0.80
  const tokenBudgetUsed = Math.min(tokenSpend, currentPlanData.tokenBudget)
  const tokenOverage = Math.max(0, tokenSpend - currentPlanData.tokenBudget)
  const eventOverage = Math.max(0, EVENT_DATA.total - currentPlanData.eventLimit)

  const filteredRecords = filterRecords(MOCK_USAGE_RECORDS, filter)
  const totalCount = filteredRecords.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const paginatedRecords = filteredRecords.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const monthName = new Date().toLocaleString("default", { month: "long" })

  return (
    <Stagger className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-6 py-6">
        {/* Header */}
        <motion.div variants={fadeUp} className="mb-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CreditCard size={16} weight="bold" className="text-foreground" />
              <h2 className="text-[14px] font-semibold">Billing</h2>
            </div>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Usage, plans, and billing for your workspace.
            </p>
          </div>
          <button className="flex h-7 items-center gap-1.5 rounded-[4px] bg-card px-2.5 text-[12px] font-medium ring-1 ring-border transition-colors hover:bg-muted">
            Manage billing
            <ArrowUpRight size={11} weight="bold" />
          </button>
        </motion.div>

        {/* Usage summary bar */}
        <motion.div variants={fadeUp} className="mb-6 grid grid-cols-4 gap-3">
          <div className="rounded-[4px] ring-1 ring-border p-3">
            <p className="text-[11px] text-muted-foreground">Current plan</p>
            <p className="mt-0.5 text-[15px] font-semibold">{currentPlanData.name}</p>
          </div>
          <div className="rounded-[4px] ring-1 ring-border p-3">
            <p className="text-[11px] text-muted-foreground">Token spend</p>
            <div className="mt-0.5 flex items-baseline gap-1">
              <p className="text-[15px] font-semibold">{formatCurrency(tokenBudgetUsed)}</p>
              <span className="text-[11px] text-muted-foreground">/ ${currentPlanData.tokenBudget}</span>
            </div>
          </div>
          <div className="rounded-[4px] ring-1 ring-border p-3">
            <p className="text-[11px] text-muted-foreground">Events ingested</p>
            <div className="mt-0.5 flex items-baseline gap-1">
              <p className="text-[15px] font-semibold">{EVENT_DATA.total.toLocaleString()}</p>
              <span className="text-[11px] text-muted-foreground">/ {currentPlanData.eventLimit.toLocaleString()}</span>
            </div>
          </div>
          <div className="rounded-[4px] ring-1 ring-border p-3">
            <p className="text-[11px] text-muted-foreground">Overages</p>
            <p className={`mt-0.5 text-[15px] font-semibold ${tokenOverage > 0 || eventOverage > 0 ? "text-amber-500" : ""}`}>
              {tokenOverage > 0 || eventOverage > 0 ? formatCurrency(tokenOverage + (eventOverage * 0.001)) : "$0.00"}
            </p>
          </div>
        </motion.div>

        {/* Charts row — token usage + events ingested */}
        <motion.div variants={fadeUp} className="mb-6 grid grid-cols-2 gap-3">
          {/* Token usage cumulative */}
          <div className="rounded-[4px] ring-1 ring-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-medium">Token usage</h3>
              <span className="text-[11px] text-muted-foreground">{monthName}</span>
            </div>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={TOKEN_DATA.days} margin={{ top: 4, right: 4, left: 4, bottom: 16 }}>
                  <defs>
                    <linearGradient id="gradInput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradOutput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <RechartsTooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="input" name="Input" stroke="var(--chart-1)" fill="url(#gradInput)" strokeWidth={1.5} dot={false} />
                  <Area type="monotone" dataKey="output" name="Output" stroke="var(--chart-3)" fill="url(#gradOutput)" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center justify-center gap-4">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <div className="size-1.5 rounded-full" style={{ backgroundColor: "var(--chart-1)" }} />
                Input ({formatTokens(TOKEN_DATA.totalInput)})
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <div className="size-1.5 rounded-full" style={{ backgroundColor: "var(--chart-3)" }} />
                Output ({formatTokens(TOKEN_DATA.totalOutput)})
              </div>
            </div>
          </div>

          {/* Events ingested cumulative */}
          <div className="rounded-[4px] ring-1 ring-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-medium">Events ingested</h3>
              <span className="text-[11px] text-muted-foreground">{monthName}</span>
            </div>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={EVENT_DATA.days} margin={{ top: 4, right: 4, left: 4, bottom: 16 }}>
                  <defs>
                    <linearGradient id="gradEvents" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <RechartsTooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="events" name="Events" stroke="var(--chart-2)" fill="url(#gradEvents)" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center justify-center">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <div className="size-1.5 rounded-full" style={{ backgroundColor: "var(--chart-2)" }} />
                {EVENT_DATA.total.toLocaleString()} events this month
              </div>
            </div>
          </div>
        </motion.div>

        {/* Plans */}
        <motion.div variants={fadeUp} className="mb-6">
          <h3 className="mb-3 text-[13px] font-medium">Plans</h3>
          <div className="grid grid-cols-3 gap-3">
            {PLANS.map((plan) => {
              const isCurrent = plan.name.toLowerCase() === CURRENT_PLAN
              return (
                <div
                  key={plan.name}
                  className={`relative flex flex-col rounded-[4px] p-4 ring-1 transition-colors ${
                    isCurrent
                      ? "bg-card ring-foreground/20"
                      : "ring-border hover:ring-foreground/10"
                  }`}
                >
                  {isCurrent && (
                    <div className="absolute -top-2 right-3 flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">
                      <Crown size={10} weight="fill" />
                      Current
                    </div>
                  )}
                  <div className="mb-3">
                    <h4 className="text-[13px] font-semibold">{plan.name}</h4>
                    <div className="mt-1 flex items-baseline gap-0.5">
                      <span className="text-[22px] font-bold tracking-tight">${plan.price}</span>
                      <span className="text-[11px] text-muted-foreground">/month</span>
                    </div>
                  </div>
                  <div className="mb-4 flex-1 space-y-2">
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
                        <Check size={12} weight="bold" className="mt-0.5 shrink-0 text-foreground/50" />
                        {feature}
                      </div>
                    ))}
                  </div>
                  <button
                    className={`flex h-7 items-center justify-center rounded-[4px] text-[12px] font-medium transition-colors ${
                      isCurrent
                        ? "bg-muted text-muted-foreground cursor-default"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    }`}
                    disabled={isCurrent}
                  >
                    {isCurrent ? "Current plan" : plan.price > (PLANS.find((p) => p.name.toLowerCase() === CURRENT_PLAN)?.price ?? 0) ? "Upgrade" : "Downgrade"}
                  </button>
                </div>
              )
            })}
          </div>
        </motion.div>

        {/* Overage notice */}
        {(tokenOverage > 0 || eventOverage > 0) && (
          <motion.div variants={fadeUp} className="mb-6 flex items-start gap-2.5 rounded-[4px] bg-amber-500/5 p-3 ring-1 ring-amber-500/20">
            <Warning size={14} weight="fill" className="mt-0.5 shrink-0 text-amber-500" />
            <div>
              <p className="text-[12px] font-medium text-foreground">You have overages this billing cycle</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {tokenOverage > 0 && `Token spend exceeds budget by ${formatCurrency(tokenOverage)}. `}
                {eventOverage > 0 && `${eventOverage.toLocaleString()} events over your ${currentPlanData.eventLimit.toLocaleString()} limit. `}
                Overages are automatically charged at the end of the billing cycle.
              </p>
            </div>
          </motion.div>
        )}

        {/* Usage records */}
        <motion.div variants={fadeUp}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-medium">Usage records</h3>
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
            {totalCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <CreditCard size={24} className="text-muted-foreground/40" />
                <p className="mt-2 text-[13px] text-muted-foreground">No records match this filter</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {paginatedRecords.map((record) => {
                  const config = RECORD_CONFIG[record.type]
                  const Icon = config.icon
                  return (
                    <div
                      key={record.id}
                      className="group flex items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-muted/30"
                    >
                      <div className={`flex size-5 shrink-0 items-center justify-center rounded-[3px] bg-muted/50 ${config.color}`}>
                        <Icon size={11} weight="bold" />
                      </div>
                      <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{config.label}</span>
                      <p className="min-w-0 flex-1 truncate text-[12px] text-foreground">{record.description}</p>
                      {record.tokens && (
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {formatTokens(record.tokens)} tok
                        </span>
                      )}
                      {record.cost && (
                        <span className={`shrink-0 text-[11px] tabular-nums font-medium ${record.type === "overage_charge" ? "text-amber-500" : "text-muted-foreground"}`}>
                          {formatCurrency(record.cost)}
                        </span>
                      )}
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatRelativeTime(record.timestamp)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalCount > PAGE_SIZE && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
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
