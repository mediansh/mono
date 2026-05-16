"use client"

import Link from "next/link"
import { motion } from "motion/react"
import { Sparkle } from "@phosphor-icons/react"
import { LandingFooter } from "@/components/landing-footer"
import { LandingNavbar } from "@/components/landing-navbar"
import { NotraContent } from "@/components/notra-content"

const ease = [0.25, 0.1, 0.25, 1] as const

export type ChangelogListEntry = {
  id: string
  href: string
  title: string
  markdown: string
  publishedAt: number
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export function ChangelogListView({ entries }: { entries: ChangelogListEntry[] }) {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease }}
      className="min-h-svh"
    >
      <LandingNavbar />
      <div className="mx-auto max-w-2xl px-4 pt-36 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05, ease }}
        >
          <h1 className="text-3xl font-semibold tracking-tight">Changelog</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            New features, improvements, and fixes shipped to Median.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12, ease }}
          className="mt-16"
        >
          {entries.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="divide-y divide-foreground/[0.06]">
              {entries.map((entry) => (
                <section key={entry.id} className="py-12 first:pt-0">
                  <div className="flex items-baseline justify-between gap-4">
                    <Link
                      href={`/changelog/${entry.href}`}
                      className="text-3xl font-semibold tracking-tight text-foreground transition-colors hover:text-foreground/70"
                    >
                      {entry.title}
                    </Link>
                    <p className="shrink-0 text-xs uppercase tracking-wider text-muted-foreground/60">
                      {formatDate(entry.publishedAt)}
                    </p>
                  </div>
                  <div className="mt-2">
                    <NotraContent markdown={entry.markdown} />
                  </div>
                </section>
              ))}
            </div>
          )}
        </motion.div>
      </div>
      <LandingFooter />
    </motion.main>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-foreground/[0.04] ring-1 ring-foreground/[0.06]">
        <Sparkle size={18} className="text-muted-foreground" />
      </div>
      <div className="text-sm font-medium">No changes yet</div>
      <div className="max-w-xs text-xs text-muted-foreground">
        We haven&apos;t shipped any public updates yet. Stay tuned.
      </div>
    </div>
  )
}
