import { useState } from "react"
import { Link } from "react-router"
import { useQuery } from "convex/react"
import { motion } from "motion/react"
import {
  Check,
  Copy,
  Key,
  MagnifyingGlass,
  ShieldCheck,
  User,
  Users,
} from "@phosphor-icons/react"

import { api } from "~/lib/convex"
import { fadeUp, stagger } from "~/lib/utils"

type SortMode = "last_seen" | "first_seen" | "workspaces" | "name"

function formatRelative(ms: number) {
  if (!ms) return "—"
  const diff = Date.now() - ms
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  if (diff < 30 * 86_400_000) return `${Math.round(diff / 86_400_000)}d ago`
  return new Date(ms).toLocaleDateString()
}

const SORTS: { value: SortMode; label: string }[] = [
  { value: "last_seen", label: "Last seen" },
  { value: "first_seen", label: "Joined" },
  { value: "workspaces", label: "Workspaces" },
  { value: "name", label: "Name" },
]

export default function UsersListPage() {
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortMode>("last_seen")
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const data = useQuery(api.users.adminListUsers, {
    search: search.trim() ? search.trim() : undefined,
    sort,
    limit: 200,
  })

  async function copy(id: string) {
    await navigator.clipboard.writeText(id)
    setCopiedId(id)
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200)
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={stagger}
      className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10"
    >
      <motion.div
        variants={fadeUp}
        className="mb-5 flex flex-wrap items-start justify-between gap-3"
      >
        <div>
          <h1 className="flex items-center gap-2 text-[15px] font-semibold leading-tight">
            <Users size={15} weight="fill" />
            Users
          </h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {data
              ? `${data.total} user${data.total === 1 ? "" : "s"}`
              : "Loading…"}
          </p>
        </div>
      </motion.div>

      <motion.div
        variants={fadeUp}
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        <div className="relative flex-1 min-w-[240px]">
          <MagnifyingGlass
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or user_..."
            className="h-8 w-full border border-sidebar-border bg-background pl-7 pr-3 text-[12px] outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-foreground/30"
          />
        </div>
        <div className="flex border border-sidebar-border bg-sidebar/30">
          {SORTS.map((s) => {
            const active = sort === s.value
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setSort(s.value)}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </motion.div>

      <motion.div
        variants={fadeUp}
        className="overflow-x-auto border border-sidebar-border bg-sidebar/30"
      >
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[1.8fr_1fr_220px_90px_110px_100px] gap-3 border-b border-sidebar-border bg-sidebar/50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <div>User</div>
            <div>Email</div>
            <div>Clerk ID</div>
            <div className="text-right">Workspaces</div>
            <div className="text-right">Joined</div>
            <div className="text-right">Last seen</div>
          </div>
          {data === undefined && (
            <div className="px-3 py-6 text-[12px] text-muted-foreground">
              Loading…
            </div>
          )}
          {data?.rows.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-6 text-[12px] text-muted-foreground">
              <User size={12} />
              {search ? "No users match this search." : "No users yet."}
            </div>
          )}
          {data?.rows.map((u) => (
            <Link
              key={u.userId}
              to={`/users/${u.userId}`}
              className="grid grid-cols-[1.8fr_1fr_220px_90px_110px_100px] items-center gap-3 border-b border-sidebar-border px-3 py-2 text-[12px] transition-colors last:border-b-0 hover:bg-sidebar-accent/60"
            >
              <div className="flex min-w-0 items-center gap-2">
                {u.imageUrl ? (
                  <img
                    src={u.imageUrl}
                    alt=""
                    className="size-6 shrink-0 border border-sidebar-border object-cover"
                  />
                ) : (
                  <div className="flex size-6 shrink-0 items-center justify-center border border-sidebar-border bg-sidebar-accent text-[10px] font-semibold text-muted-foreground">
                    {(u.name ?? u.email ?? u.userId).slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">
                      {u.name ?? "—"}
                    </span>
                    {u.isAdmin && (
                      <span className="flex items-center gap-0.5 bg-foreground px-1 py-[1px] text-[9px] font-medium uppercase tracking-wide text-background">
                        <ShieldCheck size={9} weight="fill" />
                        admin
                      </span>
                    )}
                    {u.hasEarlyAccess && (
                      <span className="flex items-center gap-0.5 bg-amber-500/20 px-1 py-[1px] text-[9px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                        <Key size={9} weight="fill" />
                        early
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="truncate text-muted-foreground">
                {u.email ?? "—"}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  copy(u.userId)
                }}
                className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                title={u.userId}
              >
                {copiedId === u.userId ? (
                  <Check size={11} weight="bold" />
                ) : (
                  <Copy size={11} />
                )}
                <span className="truncate">{u.userId}</span>
              </button>
              <div className="text-right tabular-nums">
                {u.workspaceCount}
                {u.ownedWorkspaceCount > 0 && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    ({u.ownedWorkspaceCount} own)
                  </span>
                )}
              </div>
              <div className="text-right tabular-nums text-muted-foreground">
                {formatRelative(u.firstSeenAt)}
              </div>
              <div className="text-right tabular-nums text-muted-foreground">
                {formatRelative(u.lastSeenAt)}
              </div>
            </Link>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}
