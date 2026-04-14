"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import { motion } from "motion/react"
import { Article, Key, Megaphone, ArrowUpRight } from "@phosphor-icons/react"
import { api } from "@/convex/_generated/api"

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const } },
}

export default function AdminOverviewPage() {
  const blogPosts = useQuery(api.blogPosts.list, {})
  const changelog = useQuery(api.changelogEntries.list, {})
  const earlyAccessCodes = useQuery(api.earlyAccess.adminListCodes)
  const earlyAccessEnabled = useQuery(api.earlyAccess.isEnabled)

  const blogDraftCount = blogPosts?.filter((p) => p.status === "draft").length ?? 0
  const blogPublishedCount = blogPosts?.filter((p) => p.status === "published").length ?? 0
  const changelogDraftCount = changelog?.filter((p) => p.status === "draft").length ?? 0
  const changelogPublishedCount = changelog?.filter((p) => p.status === "published").length ?? 0
  const earlyAccessRedeemed = earlyAccessCodes?.filter((c) => c.redeemedByUserId).length ?? 0
  const earlyAccessUnused = earlyAccessCodes?.filter((c) => !c.redeemedByUserId).length ?? 0

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      className="mx-auto max-w-3xl px-8 py-10"
    >
      <motion.div variants={fadeUp} className="mb-8">
        <h1 className="text-[15px] font-semibold leading-tight">Admin overview</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Manage blog posts and changelog entries.
        </p>
      </motion.div>

      <div className="grid gap-3 sm:grid-cols-2">
        <AdminCard
          href="/app/admin/blog"
          icon={<Article size={16} weight="fill" />}
          title="Blog posts"
          description="Long-form articles."
          stats={[
            { label: "Published", value: blogPublishedCount },
            { label: "Drafts", value: blogDraftCount },
          ]}
        />
        <AdminCard
          href="/app/admin/changelog"
          icon={<Megaphone size={16} weight="fill" />}
          title="Changelog"
          description="Release notes and updates."
          stats={[
            { label: "Published", value: changelogPublishedCount },
            { label: "Drafts", value: changelogDraftCount },
          ]}
        />
        <AdminCard
          href="/app/admin/early-access"
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
  href,
  icon,
  title,
  description,
  stats,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
  stats: { label: string; value: number }[]
}) {
  return (
    <motion.div variants={fadeUp}>
      <Link
        href={href}
        className="group flex h-full flex-col rounded-[6px] border border-sidebar-border bg-sidebar/30 p-4 transition-colors hover:bg-sidebar-accent/60"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex h-7 w-7 items-center justify-center rounded-[5px] bg-sidebar-accent ring-1 ring-sidebar-border">
            {icon}
          </div>
          <ArrowUpRight
            size={14}
            className="text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          />
        </div>
        <h2 className="text-[13px] font-semibold leading-tight">{title}</h2>
        <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{description}</p>
        <div className="mt-4 flex gap-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <div className="text-[15px] font-semibold leading-tight">{stat.value}</div>
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
