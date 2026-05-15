"use client"

import Link from "next/link"
import { motion } from "motion/react"
import { ArrowLeft } from "@phosphor-icons/react"
import { LandingFooter } from "@/components/landing-footer"
import { LandingNavbar } from "@/components/landing-navbar"
import { NotraContent } from "@/components/notra-content"

const ease = [0.25, 0.1, 0.25, 1] as const

export type ChangelogEntry = {
  id: string
  href: string
  title: string
  markdown: string
  publishedAt: number
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export function ChangelogEntryView({ entry }: { entry: ChangelogEntry }) {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease }}
      className="min-h-svh"
    >
      <LandingNavbar />
      <article className="mx-auto max-w-2xl px-4 pt-36 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05, ease }}
        >
          <Link
            href="/changelog"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={12} />
            Back to changelog
          </Link>
        </motion.div>

        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease }}
          className="mt-8"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              {entry.title}
            </h1>
            <p className="shrink-0 text-xs uppercase tracking-wider text-muted-foreground/60">
              {formatDate(entry.publishedAt)}
            </p>
          </div>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.18, ease }}
          className="mt-10"
        >
          <NotraContent markdown={entry.markdown} />
        </motion.div>
      </article>
      <LandingFooter />
    </motion.main>
  )
}
