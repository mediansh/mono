"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useAction, useMutation } from "convex/react"
import { Switch } from "@workspace/ui/components/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import { motion } from "motion/react"
import {
  CreditCard,
  Check,
  ArrowUpRight,
  Warning,
  Crown,
  Info,
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
import Link from "next/link"
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

type BillingPlan = {
  id: string
  name: string
  price: number
  aiBudget: number
  eventLimit: number
  trialDays: number
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
  disableOveragesWhenExhausted: boolean
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
}

function formatTokens(tokens: number) {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`
  return tokens.toString()
}

function formatCurrency(amount: number) {
  return `$${amount.toFixed(amount < 0.01 ? 4 : 2)}`
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
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string; payload?: { timestamp?: number } }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const timestamp = payload[0]?.payload?.timestamp
  const dateLabel = timestamp
    ? new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null
  return (
    <div className="rounded-[4px] border border-border bg-card px-2.5 py-1.5 shadow-sm">
      {dateLabel && (
        <p className="mb-1 text-[11px] font-medium text-foreground">{dateLabel}</p>
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
              : entry.name === "Spend"
                ? formatCurrency(entry.value)
                : formatTokens(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// Mock dashboard renders instantly so the billing page is visible while
// the slow Autumn-backed action loads in the background. Real data
// replaces this once the action resolves.
const MOCK_BILLING_DASHBOARD: BillingDashboard = {
  currentPlanId: "starter",
  currentPlanName: "Starter",
  canManageBilling: true,
  disableOveragesWhenExhausted: false,
  monthLabel: new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  }),
  summary: {
    aiBudget: 25,
    aiSpend: 8.42,
    aiRemaining: 16.58,
    aiOverage: 0,
    eventLimit: 10000,
    eventUsage: 3284,
    eventRemaining: 6716,
    eventOverage: 0,
    overageTotal: 0,
  },
  tokens: {
    totalInput: 184320,
    totalOutput: 42180,
    days: Array.from({ length: 14 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (13 - i))
      const cumulative = (i + 1) * 0.62
      return {
        timestamp: date.getTime(),
        day: date.getDate().toString(),
        input: cumulative,
        output: 0,
      }
    }),
  },
  events: {
    total: 3284,
    days: Array.from({ length: 14 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (13 - i))
      const cumulative = Math.round((i + 1) * 235)
      return {
        timestamp: date.getTime(),
        day: date.getDate().toString(),
        events: cumulative,
      }
    }),
  },
  plans: [
    {
      id: "starter",
      name: "Starter",
      price: 0,
      aiBudget: 25,
      eventLimit: 10000,
      trialDays: 0,
      features: [
        "$25 AI generation budget",
        "10,000 events per month",
        "Up to 3 integrations",
        "Community support",
      ],
      eligibility: { attachAction: "none", status: "active", canceling: false },
    },
    {
      id: "pro",
      name: "Pro",
      price: 29,
      aiBudget: 150,
      eventLimit: 100000,
      trialDays: 14,
      features: [
        "$150 AI generation budget",
        "100,000 events per month",
        "Unlimited integrations",
        "Priority support",
        "Advanced analytics",
      ],
      eligibility: {
        attachAction: "upgrade",
        status: null,
        canceling: false,
      },
    },
    {
      id: "team",
      name: "Team",
      price: 99,
      aiBudget: 500,
      eventLimit: 500000,
      trialDays: 14,
      features: [
        "$500 AI generation budget",
        "500,000 events per month",
        "Unlimited integrations",
        "Dedicated support channel",
        "SSO and audit logs",
        "Custom retention",
      ],
      eligibility: {
        attachAction: "upgrade",
        status: null,
        canceling: false,
      },
    },
  ],
}

export default function BillingPage() {
  const { currentWorkspace } = useWorkspace()
  const loadBillingDashboard = useAction(api.billing.getWorkspaceBillingDashboard)
  const openBillingPortal = useAction(api.billing.openWorkspaceBillingPortal)
  const attachBillingPlan = useAction(api.billing.attachWorkspaceBillingPlan)
  const setDisableOverages = useMutation(api.billing.setWorkspaceDisableOverages)
  // Seed with mock data so the UI renders immediately while the slow
  // Autumn-backed action loads. Replaced by real data when it arrives.
  const [dashboard, setDashboard] = useState<BillingDashboard>(
    MOCK_BILLING_DASHBOARD
  )
  const [error, setError] = useState<string | null>(null)
  const [managingBilling, setManagingBilling] = useState(false)
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)
  const [disableOveragesPending, setDisableOveragesPending] = useState(false)
  const [confirmDisableOveragesOpen, setConfirmDisableOveragesOpen] =
    useState(false)

  useEffect(() => {
    document.title = "Billing — Median"
  }, [])

  useEffect(() => {
    let cancelled = false

    async function fetchDashboard() {
      if (!currentWorkspace) {
        if (!cancelled) {
          setDashboard(MOCK_BILLING_DASHBOARD)
          setError(null)
        }
        return
      }

      try {
        if (!cancelled) {
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

  function handleSwitchDisableOverages(nextValue: boolean) {
    if (!currentWorkspace || !dashboard?.canManageBilling || disableOveragesPending)
      return

    if (nextValue) {
      // Hard-cap is destructive (can pause syncs / block AI generation), so
      // confirm before enabling. Turning it back off is not destructive and
      // applies immediately.
      setConfirmDisableOveragesOpen(true)
      return
    }

    void applyDisableOveragesChange(false)
  }

  async function applyDisableOveragesChange(nextValue: boolean) {
    if (!currentWorkspace || !dashboard) return

    const previousValue = dashboard.disableOveragesWhenExhausted
    setDashboard((current) =>
      current ? { ...current, disableOveragesWhenExhausted: nextValue } : current
    )
    setDisableOveragesPending(true)

    try {
      await setDisableOverages({
        workspaceId: currentWorkspace._id,
        disableOveragesWhenExhausted: nextValue,
      })
      toast.success(
        nextValue
          ? "Overages disabled. Usage will hard-stop at plan limits."
          : "Overages re-enabled. Usage beyond plan limits will be billed."
      )
    } catch (nextError) {
      setDashboard((current) =>
        current
          ? { ...current, disableOveragesWhenExhausted: previousValue }
          : current
      )
      toast.error(
        nextError instanceof Error
          ? nextError.message
          : "Unable to update overage settings."
      )
    } finally {
      setDisableOveragesPending(false)
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

  // Render immediately with mock data; real data swaps in when the
  // action resolves. Skeleton no longer blocks the page.

  const currentPlan =
    dashboard.plans.find((plan) => plan.id === dashboard.currentPlanId) ?? null
  const aiBudgetUsed =
    dashboard.summary.aiBudget > 0
      ? Math.min(dashboard.summary.aiSpend, dashboard.summary.aiBudget)
      : dashboard.summary.aiSpend
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

        <motion.div variants={fadeUp} className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
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

        <motion.div variants={fadeUp} className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-[4px] p-4 ring-1 ring-border">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-medium">AI spend</h3>
              <span className="text-[11px] text-muted-foreground">
                {dashboard.monthLabel}
              </span>
            </div>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dashboard.tokens.days} margin={{ top: 4, right: 4, left: 4, bottom: 16 }}>
                  <defs>
                    <linearGradient id="gradSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
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
                    name="Spend"
                    stroke="var(--chart-1)"
                    fill="url(#gradSpend)"
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
                {formatCurrency(dashboard.summary.aiSpend)} spent
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-[13px] font-semibold">{plan.name}</h4>
                      {plan.trialDays > 0 && (
                        <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-foreground/70">
                          {plan.trialDays}-day trial
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-baseline gap-0.5">
                      <span className="text-[22px] font-bold tracking-tight">
                        ${plan.price}
                      </span>
                      <span className="text-[11px] text-muted-foreground">/month</span>
                    </div>
                    {plan.trialDays > 0 && !isCurrent && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Free for {plan.trialDays} days
                      </p>
                    )}
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

        <motion.div
          variants={fadeUp}
          className="mb-6 flex items-start gap-3 rounded-[4px] p-3.5 ring-1 ring-border"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-foreground">
              Hard cap usage at plan limits
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              When enabled, AI task generation pauses once your monthly budget is spent and
              integrations stop ingesting new events past your plan&apos;s allowance. The task
              board stays available — Linear, GitHub, and Discord just won&apos;t sync new
              events until the next cycle or an upgrade.
            </p>
          </div>
          <Switch
            checked={dashboard.disableOveragesWhenExhausted}
            onCheckedChange={handleSwitchDisableOverages}
            disabled={!dashboard.canManageBilling || disableOveragesPending}
            aria-label="Disable overages when plan limits are reached"
          />
        </motion.div>

        {(dashboard.summary.aiOverage > 0 || dashboard.summary.eventOverage > 0) && (
          <motion.div
            variants={fadeUp}
            className="mb-6 flex items-start gap-2.5 rounded-[4px] bg-amber-500/5 p-3 ring-1 ring-amber-500/20"
          >
            <Warning size={14} weight="fill" className="mt-0.5 shrink-0 text-amber-500" />
            <div>
              <p className="text-[12px] font-medium text-foreground">
                {dashboard.disableOveragesWhenExhausted
                  ? "You've reached your plan limits"
                  : "You have overages this billing cycle"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {dashboard.summary.aiOverage > 0 &&
                  `AI spend exceeds budget by ${formatCurrency(dashboard.summary.aiOverage)}. `}
                {dashboard.summary.eventOverage > 0 &&
                  `${dashboard.summary.eventOverage.toLocaleString()} events over your ${dashboard.summary.eventLimit.toLocaleString()} limit. `}
                {dashboard.disableOveragesWhenExhausted
                  ? "Ingest is paused — overages are disabled. Upgrade your plan to resume."
                  : "Overages are automatically charged at the end of the billing cycle."}
              </p>
            </div>
          </motion.div>
        )}

        <motion.div
          variants={fadeUp}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
        >
          <Info size={12} className="shrink-0" />
          <span>
            Per-request AI costs are shown alongside feedback events in{" "}
            <Link
              href="/app/logs"
              className="text-foreground underline underline-offset-2 hover:text-foreground/80"
            >
              Logs
            </Link>
          </span>
        </motion.div>

      </div>

      <Dialog
        open={confirmDisableOveragesOpen}
        onOpenChange={(open) => {
          if (disableOveragesPending) return
          setConfirmDisableOveragesOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable overages?</DialogTitle>
            <DialogDescription>
              When you reach your plan limits, Median will stop generating AI tasks
              and stop ingesting new events from Discord, Linear, GitHub, and X
              until the next billing cycle or an upgrade. Your task board will
              keep working — but Linear and GitHub syncs will pause.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmDisableOveragesOpen(false)}
              disabled={disableOveragesPending}
              className="flex h-8 flex-1 items-center justify-center rounded-[4px] ring-1 ring-border text-[13px] font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={disableOveragesPending}
              onClick={async () => {
                await applyDisableOveragesChange(true)
                setConfirmDisableOveragesOpen(false)
              }}
              className="flex h-8 flex-1 items-center justify-center rounded-[4px] bg-primary text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {disableOveragesPending ? "Disabling..." : "Disable overages"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </Stagger>
  )
}
