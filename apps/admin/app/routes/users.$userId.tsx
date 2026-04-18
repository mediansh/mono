import { useMemo, useState } from "react"
import { Link, useParams } from "react-router"
import { useAction, useMutation, useQuery } from "convex/react"
import { motion } from "motion/react"
import {
  ArrowLeft,
  Buildings,
  Check,
  Copy,
  Key,
  Lightning,
  ShieldCheck,
  ShieldSlash,
  Stack,
  Terminal,
  User,
  WarningCircle,
} from "@phosphor-icons/react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { api } from "~/lib/convex"
import { fadeUp, stagger } from "~/lib/utils"

const WINDOW_OPTIONS = [
  { label: "24h", ms: 24 * 60 * 60 * 1000 },
  { label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
] as const

const CATEGORY_COLORS: Record<string, string> = {
  tasks: "#0066cc",
  webhooks: "#cc6600",
  integrations: "#009966",
  members: "#9933cc",
}

function formatDate(ms: number | null | undefined) {
  if (!ms) return "—"
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatRelative(ms: number | null | undefined) {
  if (!ms) return "—"
  const diff = Date.now() - ms
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  if (diff < 30 * 86_400_000) return `${Math.round(diff / 86_400_000)}d ago`
  return new Date(ms).toLocaleDateString()
}

function formatTick(ts: number, windowMs: number) {
  const d = new Date(ts)
  if (windowMs <= 24 * 60 * 60 * 1000) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

export default function UserDetailPage() {
  const { userId = "" } = useParams<{ userId: string }>()
  const [windowMs, setWindowMs] = useState<number>(7 * 24 * 60 * 60 * 1000)
  const [copied, setCopied] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const user = useQuery(api.users.adminGetUser, { userId })
  const activity = useQuery(api.users.adminGetUserActivitySeries, {
    userId,
    windowMs,
  })
  const isSelf = useQuery(api.users.adminIsCurrentUserSelf, { userId })

  const addAdmin = useMutation(api.admins.addAdmin)
  const removeAdmin = useMutation(api.admins.removeAdmin)
  const removeScale = useAction(api.earlyAccess.adminRemoveScalePlan)

  async function copyId() {
    if (!user) return
    await navigator.clipboard.writeText(user.userId)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  async function toggleAdmin() {
    if (!user) return
    setError(null)
    setPending("admin")
    try {
      if (user.isAdmin) {
        await removeAdmin({ userId: user.userId })
      } else {
        await addAdmin({ userId: user.userId })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setPending(null)
    }
  }

  const chartData = useMemo(() => {
    if (!activity) return []
    return activity.buckets.map((b) => ({
      timestamp: b.timestamp,
      ...b.byCategory,
      total: b.total,
    }))
  }, [activity])

  const tasksTotal = useMemo(
    () => (user ? user.ownedWorkspaces.reduce((s, w) => s + w.taskCount, 0) : 0),
    [user]
  )
  const tasksCapped = useMemo(
    () => !!user?.ownedWorkspaces.some((w) => w.taskCountCapped),
    [user]
  )
  const topTypes = useMemo(() => {
    if (!activity) return []
    return Object.entries(activity.byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
  }, [activity])

  if (user === undefined) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 text-[12px] text-muted-foreground md:px-8">
        Loading user…
      </div>
    )
  }

  const displayName = user.name ?? user.email ?? user.userId

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={stagger}
      className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10"
    >
      <motion.div variants={fadeUp} className="mb-5">
        <Link
          to="/users"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={12} />
          All users
        </Link>
      </motion.div>

      <motion.div
        variants={fadeUp}
        className="mb-5 flex flex-wrap items-start justify-between gap-4 border border-sidebar-border bg-sidebar/30 p-4"
      >
        <div className="flex min-w-0 items-start gap-3">
          {user.imageUrl ? (
            <img
              src={user.imageUrl}
              alt=""
              className="size-12 shrink-0 border border-sidebar-border object-cover"
            />
          ) : (
            <div className="flex size-12 shrink-0 items-center justify-center border border-sidebar-border bg-sidebar-accent text-[16px] font-semibold text-muted-foreground">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="text-[15px] font-semibold leading-tight">
                {user.name ?? "(no name)"}
              </h1>
              {user.isAdmin && (
                <span className="flex items-center gap-0.5 bg-foreground px-1 py-[1px] text-[9px] font-medium uppercase tracking-wide text-background">
                  <ShieldCheck size={9} weight="fill" />
                  admin
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              {user.email ?? "(no email)"}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copyId}
                className="flex items-center gap-1 border border-sidebar-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {copied ? (
                  <Check size={10} weight="bold" />
                ) : (
                  <Copy size={10} />
                )}
                <span>{user.userId}</span>
              </button>
              <span className="text-[11px] text-muted-foreground">
                Joined {formatDate(user.firstSeenAt)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                · Last seen {formatRelative(user.lastSeenAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleAdmin}
            disabled={pending === "admin" || isSelf === true}
            title={
              isSelf
                ? "You cannot remove your own admin status"
                : user.isAdmin
                  ? "Revoke admin access"
                  : "Grant admin access"
            }
            className={`flex h-8 items-center gap-1.5 px-3 text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 ${
              user.isAdmin
                ? "border border-sidebar-border text-destructive hover:bg-destructive/10"
                : "bg-foreground text-background hover:bg-foreground/90"
            }`}
          >
            {user.isAdmin ? (
              <>
                <ShieldSlash size={13} />
                <span>Revoke admin</span>
              </>
            ) : (
              <>
                <ShieldCheck size={13} weight="fill" />
                <span>Make admin</span>
              </>
            )}
          </button>
        </div>
      </motion.div>

      {error && (
        <motion.div
          variants={fadeUp}
          className="mb-4 flex items-center gap-2 border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive"
        >
          <WarningCircle size={12} weight="fill" />
          {error}
        </motion.div>
      )}

      <motion.div
        variants={fadeUp}
        className="mb-5 grid grid-cols-2 gap-0 border border-sidebar-border bg-sidebar/30 sm:grid-cols-5"
      >
        <Stat
          icon={<Buildings size={14} />}
          label="Workspaces"
          value={String(user.memberships.length)}
          hint={
            user.ownedWorkspaces.length > 0
              ? `${user.ownedWorkspaces.length} owned`
              : undefined
          }
        />
        <Stat
          icon={<Stack size={14} />}
          label="Tasks in owned"
          value={`${tasksTotal}${tasksCapped ? "+" : ""}`}
          hint={tasksCapped ? "Count capped per workspace" : undefined}
        />
        <Stat
          icon={<Key size={14} />}
          label="Early access"
          value={user.redemptions.length > 0 ? "Yes" : "No"}
          tone={user.redemptions.length > 0 ? "warn" : "default"}
        />
        <Stat
          icon={<Terminal size={14} />}
          label="CLI keys"
          value={String(user.cliApiKeys.length)}
          hint={
            user.cliApiKeys.filter((k) => k.revokedAt).length > 0
              ? `${user.cliApiKeys.filter((k) => k.revokedAt).length} revoked`
              : undefined
          }
        />
        <Stat
          icon={<Lightning size={14} />}
          label="Activity (window)"
          value={activity ? String(activity.totalLogs) : "—"}
          last
        />
      </motion.div>

      <motion.section
        variants={fadeUp}
        className="mb-5 border border-sidebar-border bg-sidebar/30 p-3"
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[12px] font-medium">
              Activity across owned workspaces
            </h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Log events from workspaces this user owns, bucketed over time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              {(activity?.categories ?? []).map((c) => (
                <LegendDot
                  key={c}
                  color={CATEGORY_COLORS[c] ?? "#666"}
                  label={c}
                />
              ))}
            </div>
            <div className="flex border border-sidebar-border bg-background">
              {WINDOW_OPTIONS.map((opt) => {
                const active = windowMs === opt.ms
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setWindowMs(opt.ms)}
                    className={`px-2 py-1 text-[11px] font-medium transition-colors ${
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
          </div>
        </div>

        {activity === undefined ? (
          <div className="flex h-[200px] items-center justify-center text-[11px] text-muted-foreground">
            Loading…
          </div>
        ) : activity.totalLogs === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-[11px] text-muted-foreground">
            No activity in this window.
          </div>
        ) : (
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <LineChart
                data={chartData}
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
                  tickFormatter={(v) => formatTick(Number(v), windowMs)}
                  tickLine={false}
                  axisLine={{ stroke: "var(--sidebar-border)" }}
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--sidebar-border)" }}
                  width={28}
                  allowDecimals={false}
                />
                <Tooltip
                  content={(props) => (
                    <ActivityTooltip
                      {...(props as unknown as ActivityTooltipBag)}
                      windowMs={windowMs}
                    />
                  )}
                />
                {activity.categories.map((c) => (
                  <Line
                    key={c}
                    type="monotone"
                    dataKey={c}
                    name={c}
                    stroke={CATEGORY_COLORS[c] ?? "#666"}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {topTypes.length > 0 && (
          <div className="mt-3 border-t border-sidebar-border pt-3">
            <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              Top event types
            </div>
            <div className="flex flex-wrap gap-1.5">
              {topTypes.map(([type, count]) => (
                <div
                  key={type}
                  className="flex items-center gap-1.5 border border-sidebar-border bg-background px-2 py-0.5 text-[11px]"
                >
                  <span className="font-mono text-muted-foreground">
                    {type}
                  </span>
                  <span className="tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.section>

      <motion.section variants={fadeUp} className="mb-5">
        <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
          <Buildings size={12} />
          Memberships ({user.memberships.length})
        </h2>
        <div className="border border-sidebar-border bg-sidebar/30">
          {user.memberships.length === 0 ? (
            <div className="px-3 py-4 text-[12px] text-muted-foreground">
              Not a member of any workspace.
            </div>
          ) : (
            user.memberships.map((m) => (
              <div
                key={m._id}
                className="flex items-center justify-between gap-3 border-b border-sidebar-border px-3 py-2 text-[12px] last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="truncate">{m.workspaceName}</span>
                    {m.workspacePrefix && (
                      <span className="bg-sidebar-accent px-1 py-[1px] font-mono text-[9px] uppercase text-muted-foreground">
                        {m.workspacePrefix}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    Joined {formatDate(m.joinedAt)}
                  </div>
                </div>
                <span
                  className={`px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${
                    m.role === "owner"
                      ? "bg-foreground text-background"
                      : m.role === "admin"
                        ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                        : "bg-sidebar-accent text-muted-foreground"
                  }`}
                >
                  {m.role}
                </span>
              </div>
            ))
          )}
        </div>
      </motion.section>

      {user.ownedWorkspaces.length > 0 && (
        <motion.section variants={fadeUp} className="mb-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
            <User size={12} />
            Owned workspaces ({user.ownedWorkspaces.length})
          </h2>
          <div className="border border-sidebar-border bg-sidebar/30">
            {user.ownedWorkspaces.map((w) => (
              <div
                key={w._id}
                className="flex items-center justify-between gap-3 border-b border-sidebar-border px-3 py-2 text-[12px] last:border-b-0"
              >
                <div>
                  <div className="font-medium">{w.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    Created {formatDate(w.createdAt)}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  <span className="tabular-nums">{w.taskCount}</span>
                  {w.taskCountCapped ? "+" : ""} tasks
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {user.redemptions.length > 0 && (
        <motion.section variants={fadeUp} className="mb-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
            <Key size={12} />
            Early access ({user.redemptions.length})
          </h2>
          <div className="border border-sidebar-border bg-sidebar/30">
            {user.redemptions.map((r) => {
              const scaleActive = !!r.scaleAttachedAt && !r.scaleRemovedAt
              return (
                <div
                  key={r._id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-sidebar-border px-3 py-2 text-[12px] last:border-b-0"
                >
                  <div>
                    <div className="font-mono text-[11px]">{r.code}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      Redeemed {formatDate(r.redeemedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${
                        scaleActive
                          ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                          : r.scaleRemovedAt
                            ? "bg-sidebar-accent text-muted-foreground"
                            : "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                      }`}
                    >
                      {scaleActive
                        ? "Scale active"
                        : r.scaleRemovedAt
                          ? "Scale removed"
                          : "Scale pending"}
                    </span>
                    {scaleActive && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (
                            !confirm(
                              "Remove the Scale plan from this user? This cannot be undone from here."
                            )
                          )
                            return
                          setError(null)
                          setPending(r._id)
                          try {
                            await removeScale({ redemptionId: r._id })
                          } catch (e) {
                            setError(
                              e instanceof Error ? e.message : "Failed"
                            )
                          } finally {
                            setPending(null)
                          }
                        }}
                        disabled={pending === r._id}
                        className="border border-sidebar-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </motion.section>
      )}

      {user.cliApiKeys.length > 0 && (
        <motion.section variants={fadeUp} className="mb-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
            <Terminal size={12} />
            CLI API keys ({user.cliApiKeys.length})
          </h2>
          <div className="border border-sidebar-border bg-sidebar/30">
            {user.cliApiKeys.map((k) => (
              <div
                key={k._id}
                className="flex items-center justify-between gap-3 border-b border-sidebar-border px-3 py-2 text-[12px] last:border-b-0"
              >
                <div>
                  <div className="font-medium">{k.label}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {k.keyPrefix}… · created {formatDate(k.createdAt)}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {k.revokedAt ? (
                    <span className="text-destructive">Revoked</span>
                  ) : k.lastUsedAt ? (
                    <>Last used {formatRelative(k.lastUsedAt)}</>
                  ) : (
                    <>Unused</>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      )}
    </motion.div>
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
  tone?: "default" | "warn" | "danger"
  hint?: string
  last?: boolean
}) {
  const toneClass =
    tone === "warn"
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

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="size-1.5" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </span>
  )
}

type ActivityTooltipBag = {
  active?: boolean
  payload?: Array<{
    dataKey?: string | number
    value?: number | string
    color?: string
    name?: string | number
  }>
  label?: string | number
}

function ActivityTooltip({
  active,
  payload,
  label,
  windowMs,
}: ActivityTooltipBag & { windowMs: number }) {
  if (!active || !payload || payload.length === 0) return null
  const ts = typeof label === "number" ? label : Number(label)
  return (
    <div className="border border-sidebar-border bg-background px-2 py-1.5 text-[11px] shadow-lg">
      <div className="mb-1 font-medium">
        {Number.isFinite(ts) ? formatTick(ts, windowMs) : ""}
      </div>
      {payload.map((p) => (
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
          <span className="font-mono tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  )
}
