"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useAction } from "convex/react"
import { motion } from "motion/react"
import {
  CreditCard,
  ArrowLeft,
  ArrowRight,
  Lightning,
  Robot,
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
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"

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
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const },
  },
}

type UsageRecord = {
  id: string
  type: "ai_generation" | "event_ingested" | "overage_charge" | "ai_tool_call"
  description: string
  tokens?: number
  cost?: number
  timestamp: number
}

type BillingPlan = {
  id: string
  name: string
  price: number
  aiBudget: number
  eventLimit: number
  features: string[]
  eligibility: {
    attachAction: "activate" | "upgrade" | "downgrade" | "purchase" | "none"
    status: "active" | "scheduled" | null
    canceling: boolean
  }
}

type BillingDashboard = {
  currentPlanId: string | null
  currentPlanName: string
  canManageBilling: boolean
  monthLabel: string
  summary: {
    aiBudget: number
    aiSpend: number
    aiRemaining: number
    aiOverage: number
    eventLimit: number
    eventUsage: number
    eventRemaining: number
    eventOverage: number
    overageTotal: number
  }
  tokens: {
    totalInput: number
    totalOutput: number
    days: Array<{
      timestamp: number
      day: string
      input: number
      output: number
    }>
  }
  events: {
    total: number
    days: Array<{
      timestamp: number
      day: string
      events: number
    }>
  }
  plans: BillingPlan[]
  usageRecords: UsageRecord[]
}

const HOUR = 3600000
const MIN = 60000
const PAGE_SIZE = 20

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

const RECORD_CONFIG: Record<
  UsageRecord["type"],
  { icon: typeof Lightning; label: string; color: string }
> = {
  ai_generation: { icon: Robot, label: "AI Generation", color: "text-purple-500" },
  event_ingested: { icon: Plugs, label: "Event Ingested", color: "text-blue-500" },
  overage_charge: { icon: Warning, label: "Overage", color: "text-amber-500" },
  ai_tool_call: { icon: Lightning, label: "Tool Call", color: "text-emerald-500" },
}

type FilterType = "all" | "ai" | "events" | "overages"

const FILTER_OPTIONS: Array<{ value: FilterType; label: string }> = [
  { value: "all", label: "All" },
  { value: "ai", label: "AI Usage" },
  { value: "events", label: "Events" },
  { value: "overages", label: "Overages" },
]

function filterRecords(records: UsageRecord[], filter: FilterType): UsageRecord[] {
  if (filter === "all") return records
  if (filter === "ai") {
    return records.filter(
      (record) =>
        record.type === "ai_generation" || record.type === "ai_tool_call"
    )
  }
  if (filter === "events") {
    return records.filter((record) => record.type === "event_ingested")
  }
  return records.filter((record) => record.type === "overage_charge")
}

function getPlanButtonLabel(plan: BillingPlan, isCurrent: boolean) {
  if (isCurrent) return "Current plan"
  switch (plan.eligibility.attachAction) {
    case "upgrade":
      return "Upgrade"
    case "downgrade":
      return "Downgrade"
    case "purchase":
      return "Purchase"
    case "activate":
      return "Subscribe"
    default:
      return plan.eligibility.status === "scheduled" ? "Plan scheduled" : "Current plan"
  }
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-[4px] border border-border bg-card px-2.5 py-1.5 shadow-sm">
      {label && (
        <p className="mb-1 text-[11px] font-medium text-foreground">Day {label}</p>
      )}
      {payload.map((entry) => (
        <div
          key={entry.name}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
        >
          <div
            className="size-1.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span>{entry.name}:</span>
          <span className="font-medium text-foreground">
            {entry.name === "Events"
              ? entry.value.toLocaleString()
              : formatTokens(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

function BillingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-6">
      <div className="mb-6">
        <div className="h-4 w-16 rounded-[4px] bg-muted/40" />
        <div className="mt-2 h-3 w-56 rounded-[4px] bg-muted/30" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-[4px] p-4 ring-1 ring-border">
          <div className="mb-3 h-3.5 w-28 rounded-[4px] bg-muted/40" />
          <div className="h-[180px] rounded-[4px] bg-muted/20" />
        </div>
        <div className="rounded-[4px] p-4 ring-1 ring-border">
          <div className="mb-3 h-3.5 w-28 rounded-[4px] bg-muted/40" />
          <div className="h-[180px] rounded-[4px] bg-muted/20" />
        </div>
      </div>
      <div className="mb-6 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-[4px] p-4 ring-1 ring-border">
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
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-2.5 border-b border-border px-3 py-1.5 last:border-0"
          >
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

export default function BillingPage() {
  const { currentWorkspace } = useWorkspace()
  const loadBillingDashboard = useAction(api.billing.getWorkspaceBillingDashboard)
  const openBillingPortal = useAction(api.billing.openWorkspaceBillingPortal)
  const attachBillingPlan = useAction(api.billing.attachWorkspaceBillingPlan)
  const [filter, setFilter] = useState<FilterType>("all")
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [dashboard, setDashboard] = useState<BillingDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [managingBilling, setManagingBilling] = useState(false)
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)

  useEffect(() => {
    document.title = "Billing — Median"
  }, [])

  useEffect(() => {
    setPage(0)
  }, [filter])

  useEffect(() => {
    let cancelled = false

    async function fetchDashboard() {
      if (!currentWorkspace) {
        if (!cancelled) {
          setDashboard(null)
          setLoading(false)
          setError(null)
        }
        return
      }

      try {
        if (!cancelled) {
          setLoading(true)
          setError(null)
        }

        const nextDashboard = (await loadBillingDashboard({
          workspaceId: currentWorkspace._id,
        })) as BillingDashboard

        if (!cancelled) {
          setDashboard(nextDashboard)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Unable to load billing data."
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchDashboard()

    return () => {
      cancelled = true
    }
  }, [currentWorkspace?._id, loadBillingDashboard])

  async function refreshDashboard() {
    if (!currentWorkspace) return
    const nextDashboard = (await loadBillingDashboard({
      workspaceId: currentWorkspace._id,
    })) as BillingDashboard
    setDashboard(nextDashboard)
  }

  async function handleManageBilling() {
    if (!currentWorkspace || !dashboard?.canManageBilling || managingBilling) return

    try {
      setManagingBilling(true)
      const result = await openBillingPortal({
        workspaceId: currentWorkspace._id,
        returnUrl: window.location.href,
      })
      window.location.assign(result.url)
    } catch (nextError) {
      toast.error(
        nextError instanceof Error
          ? nextError.message
          : "Unable to open the billing portal."
      )
      setManagingBilling(false)
    }
  }

  async function handleAttachPlan(planId: string) {
    if (!currentWorkspace || !dashboard?.canManageBilling || pendingPlanId) return

    try {
      setPendingPlanId(planId)
      const result = await attachBillingPlan({
        workspaceId: currentWorkspace._id,
        planId,
        successUrl: window.location.href,
      })

      if (result.paymentUrl) {
        window.location.assign(result.paymentUrl)
        return
      }

      await refreshDashboard()
      toast.success("Billing plan updated.")
    } catch (nextError) {
      toast.error(
        nextError instanceof Error
          ? nextError.message
          : "Unable to change the billing plan."
      )
    } finally {
      setPendingPlanId(null)
    }
  }

  if (loading || !dashboard) {
    return <BillingSkeleton />
  }

  const currentPlan =
    dashboard.plans.find((plan) => plan.id === dashboard.currentPlanId) ?? null
  const aiBudgetUsed =
    dashboard.summary.aiBudget > 0
      ? Math.min(dashboard.summary.aiSpend, dashboard.summary.aiBudget)
      : dashboard.summary.aiSpend
  const filteredRecords = filterRecords(dashboard.usageRecords, filter)
  const totalCount = filteredRecords.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const paginatedRecords = filteredRecords.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE
  )

  return (
    <Stagger className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-6 py-6">
        <motion.div
          variants={fadeUp}
          className="mb-6 flex items-start justify-between"
        >
          <div>
            <div className="flex items-center gap-2">
              <CreditCard size={16} weight="bold" className="text-foreground" />
              <h2 className="text-[14px] font-semibold">Billing</h2>
            </div>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Usage, plans, and billing for your workspace.
            </p>
          </div>
          <button
            onClick={() => void handleManageBilling()}
            disabled={!dashboard.canManageBilling || managingBilling}
            className="flex h-7 items-center gap-1.5 rounded-[4px] bg-card px-2.5 text-[12px] font-medium ring-1 ring-border transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Manage billing
            <ArrowUpRight size={11} weight="bold" />
          </button>
        </motion.div>

        {error && (
          <motion.div
            variants={fadeUp}
            className="mb-6 rounded-[4px] bg-destructive/5 p-3 ring-1 ring-destructive/20"
          >
            <p className="text-[12px] font-medium text-foreground">Billing data is unavailable</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{error}</p>
          </motion.div>
        )}

        {!dashboard.canManageBilling && (
          <motion.div
            variants={fadeUp}
            className="mb-6 rounded-[4px] bg-muted/40 p-3 ring-1 ring-border"
          >
            <p className="text-[12px] font-medium text-foreground">
              Billing changes are limited to workspace admins
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              You can still review usage and plan details from this page.
            </p>
          </motion.div>
        )}

        <motion.div variants={fadeUp} className="mb-6 grid grid-cols-4 gap-3">
          <div className="rounded-[4px] p-3 ring-1 ring-border">
            <p className="text-[11px] text-muted-foreground">Current plan</p>
            <p className="mt-0.5 text-[15px] font-semibold">
              {currentPlan?.name ?? dashboard.currentPlanName}
            </p>
          </div>
          <div className="rounded-[4px] p-3 ring-1 ring-border">
            <p className="text-[11px] text-muted-foreground">AI spend</p>
            <div className="mt-0.5 flex items-baseline gap-1">
              <p className="text-[15px] font-semibold">{formatCurrency(aiBudgetUsed)}</p>
              <span className="text-[11px] text-muted-foreground">
                / {formatCurrency(dashboard.summary.aiBudget)}
              </span>
            </div>
          </div>
          <div className="rounded-[4px] p-3 ring-1 ring-border">
            <p className="text-[11px] text-muted-foreground">Events ingested</p>
            <div className="mt-0.5 flex items-baseline gap-1">
              <p className="text-[15px] font-semibold">
                {dashboard.summary.eventUsage.toLocaleString()}
              </p>
              <span className="text-[11px] text-muted-foreground">
                / {dashboard.summary.eventLimit.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="rounded-[4px] p-3 ring-1 ring-border">
            <p className="text-[11px] text-muted-foreground">Overages</p>
            <p
              className={`mt-0.5 text-[15px] font-semibold ${
                dashboard.summary.aiOverage > 0 || dashboard.summary.eventOverage > 0
                  ? "text-amber-500"
                  : ""
              }`}
            >
              {dashboard.summary.overageTotal > 0
                ? formatCurrency(dashboard.summary.overageTotal)
                : "$0.00"}
            </p>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-[4px] p-4 ring-1 ring-border">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-medium">Token usage</h3>
              <span className="text-[11px] text-muted-foreground">
                {dashboard.monthLabel}
              </span>
            </div>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dashboard.tokens.days} margin={{ top: 4, right: 4, left: 4, bottom: 16 }}>
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
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <RechartsTooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="input"
                    name="Input"
                    stroke="var(--chart-1)"
                    fill="url(#gradInput)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="output"
                    name="Output"
                    stroke="var(--chart-3)"
                    fill="url(#gradOutput)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center justify-center gap-4">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <div
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: "var(--chart-1)" }}
                />
                Input ({formatTokens(dashboard.tokens.totalInput)})
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <div
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: "var(--chart-3)" }}
                />
                Output ({formatTokens(dashboard.tokens.totalOutput)})
              </div>
            </div>
          </div>

          <div className="rounded-[4px] p-4 ring-1 ring-border">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-medium">Events ingested</h3>
              <span className="text-[11px] text-muted-foreground">
                {dashboard.monthLabel}
              </span>
            </div>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dashboard.events.days} margin={{ top: 4, right: 4, left: 4, bottom: 16 }}>
                  <defs>
                    <linearGradient id="gradEvents" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <RechartsTooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="events"
                    name="Events"
                    stroke="var(--chart-2)"
                    fill="url(#gradEvents)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center justify-center">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <div
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: "var(--chart-2)" }}
                />
                {dashboard.events.total.toLocaleString()} events this cycle
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="mb-6">
          <h3 className="mb-3 text-[13px] font-medium">Plans</h3>
          <div className="grid grid-cols-3 gap-3">
            {dashboard.plans.map((plan) => {
              const isCurrent = plan.id === dashboard.currentPlanId
              const buttonLabel = getPlanButtonLabel(plan, isCurrent)
              const isDisabled =
                isCurrent ||
                plan.eligibility.attachAction === "none" ||
                !dashboard.canManageBilling ||
                pendingPlanId !== null

              return (
                <div
                  key={plan.id}
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
                      <span className="text-[22px] font-bold tracking-tight">
                        ${plan.price}
                      </span>
                      <span className="text-[11px] text-muted-foreground">/month</span>
                    </div>
                  </div>
                  <div className="mb-4 flex-1 space-y-2">
                    {plan.features.map((feature) => (
                      <div
                        key={feature}
                        className="flex items-start gap-1.5 text-[12px] text-muted-foreground"
                      >
                        <Check
                          size={12}
                          weight="bold"
                          className="mt-0.5 shrink-0 text-foreground/50"
                        />
                        {feature}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => void handleAttachPlan(plan.id)}
                    disabled={isDisabled}
                    className={`flex h-7 items-center justify-center rounded-[4px] text-[12px] font-medium transition-colors ${
                      isDisabled
                        ? "cursor-default bg-muted text-muted-foreground"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    }`}
                  >
                    {pendingPlanId === plan.id ? "Working..." : buttonLabel}
                  </button>
                </div>
              )
            })}
          </div>
        </motion.div>

        {(dashboard.summary.aiOverage > 0 || dashboard.summary.eventOverage > 0) && (
          <motion.div
            variants={fadeUp}
            className="mb-6 flex items-start gap-2.5 rounded-[4px] bg-amber-500/5 p-3 ring-1 ring-amber-500/20"
          >
            <Warning size={14} weight="fill" className="mt-0.5 shrink-0 text-amber-500" />
            <div>
              <p className="text-[12px] font-medium text-foreground">
                You have overages this billing cycle
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {dashboard.summary.aiOverage > 0 &&
                  `AI spend exceeds budget by ${formatCurrency(dashboard.summary.aiOverage)}. `}
                {dashboard.summary.eventOverage > 0 &&
                  `${dashboard.summary.eventOverage.toLocaleString()} events over your ${dashboard.summary.eventLimit.toLocaleString()} limit. `}
                Overages are automatically charged at the end of the billing cycle.
              </p>
            </div>
          </motion.div>
        )}

        <motion.div variants={fadeUp}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-medium">Usage records</h3>
            <div className="flex items-center gap-1 rounded-[4px] p-0.5 ring-1 ring-border">
              {FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFilter(option.value)}
                  className={`rounded-[3px] px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    filter === option.value
                      ? "bg-background text-foreground ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[4px] ring-1 ring-border">
            {totalCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <CreditCard size={24} className="text-muted-foreground/40" />
                <p className="mt-2 text-[13px] text-muted-foreground">
                  No records match this filter
                </p>
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
                      <div
                        className={`flex size-5 shrink-0 items-center justify-center rounded-[3px] bg-muted/50 ${config.color}`}
                      >
                        <Icon size={11} weight="bold" />
                      </div>
                      <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                        {config.label}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                        {record.description}
                      </p>
                      {record.tokens !== undefined && (
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {formatTokens(record.tokens)} tok
                        </span>
                      )}
                      {record.cost !== undefined && (
                        <span
                          className={`shrink-0 text-[11px] tabular-nums font-medium ${
                            record.type === "overage_charge"
                              ? "text-amber-500"
                              : "text-muted-foreground"
                          }`}
                        >
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

          {totalCount > PAGE_SIZE && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                {page * PAGE_SIZE + 1}-
                {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={page === 0}
                  className="flex size-7 items-center justify-center rounded-[4px] text-[11px] text-muted-foreground ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ArrowLeft size={12} />
                </button>
                <span className="px-2 text-[11px] text-muted-foreground">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() =>
                    setPage((current) => Math.min(totalPages - 1, current + 1))
                  }
                  disabled={page >= totalPages - 1}
                  className="flex size-7 items-center justify-center rounded-[4px] text-[11px] text-muted-foreground ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
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
