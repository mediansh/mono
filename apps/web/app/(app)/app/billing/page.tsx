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
  ArrowUpRight,
  Warning,
  Crown,
  Info,
  Coins,
  Sparkle,
  Lightning,
  Star,
} from "@phosphor-icons/react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
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
  credits: number
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
  cycleStart: number | null
  cycleEnd: number | null
  summary: {
    creditsBudget: number
    creditsUsed: number
    creditsRemaining: number
    creditsOverage: number
    aiSpend: number
    aiCalls: number
    eventCount: number
    eventCost: number
  }
  credits: {
    total: number
    budget: number
    days: Array<{
      timestamp: number
      day: string
      credits: number
      cumulative: number
    }>
  }
  plans: BillingPlan[]
}

function formatCurrency(amount: number) {
  return `$${amount.toFixed(amount < 0.01 && amount > 0 ? 4 : 2)}`
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
            {formatCurrency(entry.value)}
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
        <div className="h-4 w-20 rounded-[4px] bg-muted/40" />
        <div className="mt-2 h-3 w-56 rounded-[4px] bg-muted/30" />
      </div>
      <div className="mb-6 rounded-[6px] p-5 ring-1 ring-border">
        <div className="h-3.5 w-24 rounded-[3px] bg-muted/40" />
        <div className="mt-3 h-7 w-40 rounded-[3px] bg-muted/40" />
        <div className="mt-4 h-2 w-full rounded-full bg-muted/30" />
        <div className="mt-3 flex gap-3">
          <div className="h-3 w-24 rounded-[3px] bg-muted/30" />
          <div className="h-3 w-24 rounded-[3px] bg-muted/30" />
        </div>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-[4px] p-3 ring-1 ring-border">
            <div className="h-3 w-16 rounded-[3px] bg-muted/30" />
            <div className="mt-2 h-4 w-20 rounded-[3px] bg-muted/40" />
          </div>
        ))}
      </div>
      <div className="mb-6 rounded-[4px] p-4 ring-1 ring-border">
        <div className="mb-3 h-3.5 w-24 rounded-[4px] bg-muted/40" />
        <div className="h-[220px] rounded-[4px] bg-muted/20" />
      </div>
      <div className="mb-3 h-3.5 w-16 rounded-[4px] bg-muted/40" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-[4px] p-4 ring-1 ring-border">
            <div className="h-3.5 w-20 rounded-[3px] bg-muted/40" />
            <div className="mt-2 h-6 w-24 rounded-[3px] bg-muted/40" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-3 w-full rounded-[3px] bg-muted/20" />
              ))}
            </div>
            <div className="mt-4 h-7 w-full rounded-[3px] bg-muted/30" />
          </div>
        ))}
      </div>
    </div>
  )
}

function CreditsProgressCard({
  used,
  budget,
  overage,
  cycleEnd,
  monthLabel,
}: {
  used: number
  budget: number
  overage: number
  cycleEnd: number | null
  monthLabel: string
}) {
  const ratio = budget > 0 ? Math.min(used / budget, 1) : 0
  const percent = Math.round(ratio * 100)
  const inOverage = overage > 0
  const remainingDays = cycleEnd
    ? Math.max(0, Math.ceil((cycleEnd - Date.now()) / (24 * 60 * 60 * 1000)))
    : null

  return (
    <div className="relative overflow-hidden rounded-[6px] p-5 ring-1 ring-border">
      {/* subtle foreground gradient — adapts to theme */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          background:
            "radial-gradient(120% 80% at 0% 0%, var(--foreground), transparent 60%)",
        }}
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
              <Coins size={13} weight="bold" />
              Credits used this cycle
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-[26px] font-bold tracking-tight">
                {formatCurrency(used)}
              </span>
              <span className="text-[12px] text-muted-foreground">
                of {formatCurrency(budget)}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span
              className={`text-[18px] font-semibold tabular-nums ${
                inOverage ? "text-amber-500" : "text-foreground"
              }`}
            >
              {percent}%
            </span>
            <span className="text-[10px] text-muted-foreground">
              {monthLabel}
            </span>
          </div>
        </div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted/40">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
            className={`h-full rounded-full ${
              inOverage
                ? "bg-amber-500"
                : ratio > 0.8
                  ? "bg-foreground/80"
                  : "bg-foreground/70"
            }`}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            {!inOverage && (
              <span>
                {formatCurrency(Math.max(0, budget - used))} remaining
              </span>
            )}
            {inOverage && (
              <span className="font-medium text-amber-500">
                {formatCurrency(overage)} in overages
              </span>
            )}
          </div>
          {remainingDays !== null && (
            <span>
              {remainingDays === 0
                ? "Resets today"
                : `Resets in ${remainingDays} day${remainingDays === 1 ? "" : "s"}`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function BillingPage() {
  const { currentWorkspace } = useWorkspace()
  const loadBillingDashboard = useAction(api.billing.getWorkspaceBillingDashboard)
  const openBillingPortal = useAction(api.billing.openWorkspaceBillingPortal)
  const attachBillingPlan = useAction(api.billing.attachWorkspaceBillingPlan)
  const setDisableOverages = useMutation(api.billing.setWorkspaceDisableOverages)
  const [dashboard, setDashboard] = useState<BillingDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [managingBilling, setManagingBilling] = useState(false)
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)
  const [overageConfirmPlanId, setOverageConfirmPlanId] = useState<
    string | null
  >(null)
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
          setDashboard(null)
          setError(null)
        }
        return
      }

      if (!cancelled) {
        setDashboard(null)
        setError(null)
      }

      try {
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
    if (
      !currentWorkspace ||
      !dashboard?.canManageBilling ||
      managingBilling
    )
      return

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
    if (
      !currentWorkspace ||
      !dashboard?.canManageBilling ||
      disableOveragesPending
    )
      return

    if (nextValue) {
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
    if (
      !currentWorkspace ||
      !dashboard?.canManageBilling ||
      pendingPlanId
    )
      return

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

  function handlePlanSubscribeClick(planId: string) {
    if (
      !currentWorkspace ||
      !dashboard?.canManageBilling ||
      pendingPlanId
    )
      return

    setOverageConfirmPlanId(planId)
  }

  if (error && !dashboard) {
    return (
      <Stagger className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-6 py-6">
          <motion.div variants={fadeUp} className="mb-6">
            <div className="flex items-center gap-2">
              <CreditCard
                size={16}
                weight="bold"
                className="text-foreground"
              />
              <h2 className="text-[14px] font-semibold">Billing</h2>
            </div>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Usage, plans, and billing for your workspace.
            </p>
          </motion.div>
          <motion.div
            variants={fadeUp}
            className="rounded-[4px] bg-destructive/5 p-4 ring-1 ring-destructive/20"
          >
            <p className="text-[13px] font-medium text-foreground">
              Billing data is unavailable
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">{error}</p>
          </motion.div>
        </div>
      </Stagger>
    )
  }

  if (!dashboard) {
    return <BillingSkeleton />
  }

  const currentPlan =
    dashboard.plans.find((plan) => plan.id === dashboard.currentPlanId) ?? null
  const overageConfirmPlan =
    dashboard.plans.find((plan) => plan.id === overageConfirmPlanId) ?? null

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
              Credits, usage, and plans for your workspace.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href="https://docs.median.sh/pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-7 items-center gap-1.5 rounded-[4px] px-2.5 text-[12px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Learn more
              <ArrowUpRight size={11} weight="bold" />
            </a>
            <button
              onClick={() => void handleManageBilling()}
              disabled={
                !dashboard.canManageBilling ||
                managingBilling
              }
              className="flex h-7 items-center gap-1.5 rounded-[4px] bg-card px-2.5 text-[12px] font-medium whitespace-nowrap ring-1 ring-border transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Manage billing
              <ArrowUpRight size={11} weight="bold" />
            </button>
          </div>
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

        {/* Hero credits card */}
        <motion.div variants={fadeUp} className="mb-6">
          <CreditsProgressCard
            used={dashboard.summary.creditsUsed}
            budget={dashboard.summary.creditsBudget}
            overage={dashboard.summary.creditsOverage}
            cycleEnd={dashboard.cycleEnd}
            monthLabel={dashboard.monthLabel}
          />
        </motion.div>

        {/* Compact stat row */}
        <motion.div
          variants={fadeUp}
          className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3"
        >
          <div className="rounded-[4px] p-3 ring-1 ring-border">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CreditCard size={11} weight="bold" />
              Current plan
            </div>
            <p className="mt-0.5 text-[15px] font-semibold">
              {currentPlan?.name ?? dashboard.currentPlanName}
            </p>
          </div>
          <div className="rounded-[4px] p-3 ring-1 ring-border">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Sparkle size={11} weight="bold" />
              AI usage
            </div>
            <div className="mt-0.5 flex items-baseline gap-1">
              <p className="text-[15px] font-semibold">
                {formatCurrency(dashboard.summary.aiSpend)}
              </p>
              <span className="text-[11px] text-muted-foreground">
                · {dashboard.summary.aiCalls.toLocaleString()} call
                {dashboard.summary.aiCalls === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <div className="col-span-2 rounded-[4px] p-3 ring-1 ring-border md:col-span-1">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Lightning size={11} weight="bold" />
              Events
            </div>
            <div className="mt-0.5 flex items-baseline gap-1">
              <p className="text-[15px] font-semibold">
                {dashboard.summary.eventCount.toLocaleString()}
              </p>
              <span className="text-[11px] text-muted-foreground">
                · {formatCurrency(dashboard.summary.eventCost)}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Single combined chart: daily credits consumed */}
        <motion.div
          variants={fadeUp}
          className="mb-6 rounded-[4px] p-4 ring-1 ring-border"
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-[13px] font-medium">Credit consumption</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Daily credits used (cumulative)
              </p>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {dashboard.monthLabel}
            </span>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={dashboard.credits.days}
                margin={{ top: 4, right: 8, left: 0, bottom: 16 }}
              >
                <defs>
                  <linearGradient id="gradCredits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickFormatter={(value: number) =>
                    value >= 1 ? `$${value.toFixed(0)}` : `$${value.toFixed(2)}`
                  }
                />
                <RechartsTooltip content={<ChartTooltip />} />
                {dashboard.summary.creditsBudget > 0 && (
                  <ReferenceLine
                    y={dashboard.summary.creditsBudget}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                    label={{
                      value: `Budget ${formatCurrency(dashboard.summary.creditsBudget)}`,
                      position: "insideTopRight",
                      fill: "var(--muted-foreground)",
                      fontSize: 10,
                    }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  name="Credits"
                  stroke="var(--chart-1)"
                  fill="url(#gradCredits)"
                  strokeWidth={1.75}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center justify-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: "var(--chart-1)" }}
              />
              {formatCurrency(dashboard.credits.total)} consumed
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span>
              Events at $0.007 · AI charged at cost
            </span>
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
                  className={`relative flex flex-col rounded-[6px] p-5 ring-1 transition-colors ${
                    isCurrent
                      ? "bg-card ring-foreground/20"
                      : "ring-border hover:ring-foreground/15"
                  }`}
                >
                  {isCurrent && (
                    <div className="absolute -top-2 right-3 flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">
                      <Crown size={10} weight="fill" />
                      Current
                    </div>
                  )}

                  <div className="flex items-baseline justify-between">
                    <h4 className="text-[14px] font-semibold">{plan.name}</h4>
                    {plan.trialDays > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {plan.trialDays}-day trial
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-[28px] font-bold tracking-tight">
                      ${plan.price}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      /month
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-1.5 text-[12px] text-foreground/80">
                    <Coins size={12} weight="bold" className="text-foreground/60" />
                    <span>
                      <span className="font-medium text-foreground">
                        ${plan.credits}
                      </span>{" "}
                      in credits monthly
                    </span>
                  </div>

                  {plan.id === "scale" && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-foreground/80">
                      <Star size={12} weight="bold" className="text-foreground/60" />
                      <span>Priority support</span>
                    </div>
                  )}

                  <div className="mt-5 flex-1" />

                  <button
                    onClick={() => handlePlanSubscribeClick(plan.id)}
                    disabled={isDisabled}
                    className={`flex h-8 items-center justify-center rounded-[4px] text-[12px] font-medium transition-colors ${
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
              Hard cap usage at plan credits
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              When enabled, AI task generation pauses and integrations stop
              ingesting events once your monthly credits are spent. The task
              board stays available — Linear, GitHub, and Discord just won&apos;t
              sync until the next cycle or an upgrade.
            </p>
          </div>
          <Switch
            checked={dashboard.disableOveragesWhenExhausted}
            onCheckedChange={handleSwitchDisableOverages}
            disabled={
              !dashboard.canManageBilling ||
              disableOveragesPending
            }
            aria-label="Disable overages when credits run out"
          />
        </motion.div>

        {dashboard.summary.creditsOverage > 0 && (
          <motion.div
            variants={fadeUp}
            className="mb-6 flex items-start gap-2.5 rounded-[4px] bg-amber-500/5 p-3 ring-1 ring-amber-500/20"
          >
            <Warning size={14} weight="fill" className="mt-0.5 shrink-0 text-amber-500" />
            <div>
              <p className="text-[12px] font-medium text-foreground">
                {dashboard.disableOveragesWhenExhausted
                  ? "You've used all your credits this cycle"
                  : "You have credit overages this cycle"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {`${formatCurrency(dashboard.summary.creditsOverage)} in usage beyond your ${formatCurrency(dashboard.summary.creditsBudget)} credit budget. `}
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
              When you run out of credits, Median will stop generating AI tasks
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

      <Dialog
        open={overageConfirmPlanId !== null}
        onOpenChange={(open) => {
          if (pendingPlanId) return
          if (!open) setOverageConfirmPlanId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Overages are charged by default</DialogTitle>
            <DialogDescription>
              When you subscribe to
              {overageConfirmPlan ? ` ${overageConfirmPlan.name}` : " a plan"},
              usage beyond your ${overageConfirmPlan?.credits ?? 0} of included
              credits is automatically charged to your account by default. You
              can disable overages anytime in Billing to hard-cap usage at your
              credit budget.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOverageConfirmPlanId(null)}
              disabled={pendingPlanId !== null}
              className="flex h-8 flex-1 items-center justify-center rounded-[4px] ring-1 ring-border text-[13px] font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pendingPlanId !== null || !overageConfirmPlan}
              onClick={async () => {
                if (!overageConfirmPlan) return
                await handleAttachPlan(overageConfirmPlan.id)
                setOverageConfirmPlanId(null)
              }}
              className="flex h-8 flex-1 items-center justify-center rounded-[4px] bg-primary text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {pendingPlanId === overageConfirmPlan?.id
                ? "Working..."
                : "Continue"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </Stagger>
  )
}
