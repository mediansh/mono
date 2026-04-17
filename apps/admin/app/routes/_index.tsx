import { Link } from "react-router"
import { useQuery } from "convex/react"
import { motion } from "motion/react"
import {
  Article,
  Key,
  Megaphone,
  ArrowUpRight,
} from "@phosphor-icons/react"

import { api } from "~/lib/convex"
import { fadeUp, stagger } from "~/lib/utils"

export default function AdminOverviewPage() {
  const blogPosts = useQuery(api.blogPosts.list, {})
  const changelog = useQuery(api.changelogEntries.list, {})
  const earlyAccessCodes = useQuery(api.earlyAccess.adminListCodes)
  const earlyAccessEnabled = useQuery(api.earlyAccess.isEnabled)

  const blogDraftCount =
    blogPosts?.filter((p) => p.status === "draft").length ?? 0
  const blogPublishedCount =
    blogPosts?.filter((p) => p.status === "published").length ?? 0
  const changelogDraftCount =
    changelog?.filter((p) => p.status === "draft").length ?? 0
  const changelogPublishedCount =
    changelog?.filter((p) => p.status === "published").length ?? 0
  const earlyAccessRedeemed =
    earlyAccessCodes?.filter((c) => c.redeemedByUserId).length ?? 0
  const earlyAccessUnused =
    earlyAccessCodes?.filter((c) => !c.redeemedByUserId).length ?? 0

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={stagger}
      className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10"
    >
      <motion.div variants={fadeUp} className="mb-8">
        <h1 className="text-[15px] font-semibold leading-tight">
          Admin overview
        </h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Manage blog posts, changelog entries, and early access.
        </p>
      </motion.div>

      <div className="grid gap-3 sm:grid-cols-2">
        <AdminCard
          to="/blog"
          icon={<Article size={16} weight="fill" />}
          title="Blog posts"
          description="Long-form articles."
          stats={[
            { label: "Published", value: blogPublishedCount },
            { label: "Drafts", value: blogDraftCount },
          ]}
        />
        <AdminCard
          to="/changelog"
          icon={<Megaphone size={16} weight="fill" />}
          title="Changelog"
          description="Release notes and updates."
          stats={[
            { label: "Published", value: changelogPublishedCount },
            { label: "Drafts", value: changelogDraftCount },
          ]}
        />
        <AdminCard
          to="/early-access"
          icon={<Key size={16} weight="fill" />}
          title="Early access"
          description={earlyAccessEnabled ? "Gate enabled." : "Gate disabled."}
          stats={[
            { label: "Redeemed", value: earlyAccessRedeemed },
            { label: "Unused", value: earlyAccessUnused },
          ]}
        />
      </div>
    </motion.div>
  )
}

function AdminCard({
  to,
  icon,
  title,
  description,
  stats,
}: {
  to: string
  icon: React.ReactNode
  title: string
  description: string
  stats: { label: string; value: number }[]
}) {
  return (
    <motion.div variants={fadeUp}>
      <Link
        to={to}
        className="group flex h-full flex-col border border-sidebar-border bg-sidebar/30 p-4 transition-colors hover:bg-sidebar-accent/60"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex size-7 items-center justify-center bg-sidebar-accent ring-1 ring-sidebar-border">
            {icon}
          </div>
          <ArrowUpRight
            size={14}
            className="text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          />
        </div>
        <h2 className="text-[13px] font-semibold leading-tight">{title}</h2>
        <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
          {description}
        </p>
        <div className="mt-4 flex gap-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <div className="text-[15px] font-semibold leading-tight">
                {stat.value}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </Link>
    </motion.div>
  )
}
