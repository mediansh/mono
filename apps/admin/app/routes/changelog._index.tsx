import { Link } from "react-router"
import { useQuery } from "convex/react"
import { motion } from "motion/react"
import { Plus, Megaphone } from "@phosphor-icons/react"

import { api } from "~/lib/convex"
import { fadeUp, formatDate, stagger } from "~/lib/utils"

export default function AdminChangelogListPage() {
  const entries = useQuery(api.changelogEntries.list, {})

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={stagger}
      className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8"
    >
      <motion.div
        variants={fadeUp}
        className="mb-6 flex items-center justify-between"
      >
        <div>
          <h1 className="text-[15px] font-semibold leading-tight">Changelog</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {entries ? `${entries.length} total` : "Loading…"}
          </p>
        </div>
        <Link
          to="/changelog/new"
          className="flex h-7 items-center gap-1.5 bg-foreground px-2.5 text-[12px] font-medium text-background transition-colors hover:bg-foreground/90"
        >
          <Plus size={13} weight="bold" />
          <span>New entry</span>
        </Link>
      </motion.div>

      <motion.div
        variants={fadeUp}
        className="overflow-hidden border border-sidebar-border bg-sidebar/30"
      >
        {entries === undefined ? (
          <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">
            Loading…
          </div>
        ) : entries.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-sidebar-border">
            {entries.map((entry) => (
              <li key={entry._id}>
                <Link
                  to={`/changelog/${entry._id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-sidebar-accent/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium">
                        {entry.title}
                      </span>
                      {entry.version && (
                        <span className="bg-sidebar-accent px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {entry.version}
                        </span>
                      )}
                      <StatusBadge status={entry.status} />
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      /{entry.slug} · Updated {formatDate(entry.updatedAt)}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </motion.div>
  )
}

function StatusBadge({ status }: { status: "draft" | "published" }) {
  return (
    <span
      className={`px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${
        status === "published"
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "bg-sidebar-accent text-muted-foreground"
      }`}
    >
      {status}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <div className="flex size-10 items-center justify-center bg-sidebar-accent ring-1 ring-sidebar-border">
        <Megaphone size={18} className="text-muted-foreground" />
      </div>
      <div className="text-[13px] font-medium">No entries yet</div>
      <div className="max-w-xs text-[11px] text-muted-foreground">
        Write your first changelog entry to get started.
      </div>
    </div>
  )
}
