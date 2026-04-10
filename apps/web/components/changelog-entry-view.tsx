"use client"

import Link from "next/link"
import { usePreloadedQuery, type Preloaded } from "convex/react"
import { motion } from "motion/react"
import { ArrowLeft } from "@phosphor-icons/react"
import { LandingFooter } from "@/components/landing-footer"
import { LandingNavbar } from "@/components/landing-navbar"
import { TiptapContent } from "@/components/tiptap-content"
import type { api } from "@/convex/_generated/api"

const ease = [0.25, 0.1, 0.25, 1] as const

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export function ChangelogEntryView({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.changelogEntries.getPublishedBySlug>
}) {
  const entry = usePreloadedQuery(preloaded)

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

        {entry ? (
          <>
            <motion.header
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease }}
              className="mt-8"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                  {entry.version ? `v${entry.version}` : entry.title}
                </h1>
                <p className="shrink-0 text-xs uppercase tracking-wider text-muted-foreground/60">
                  {formatDate(entry.publishedAt)}
                </p>
              </div>
              {entry.version && (
                <p className="mt-4 text-base font-medium text-muted-foreground">
                  {entry.title}
                </p>
              )}
              {entry.excerpt && (
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {entry.excerpt}
                </p>
              )}
            </motion.header>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18, ease }}
              className="mt-10"
            >
              <TiptapContent json={entry.content} />
            </motion.div>
          </>
        ) : (
          <div className="mt-16 flex flex-col items-center justify-center gap-3 text-center">
            <div className="text-base font-semibold">Entry not found</div>
            <p className="max-w-xs text-sm text-muted-foreground">
              This changelog entry may have been removed or the link is incorrect.
            </p>
            <Link
              href="/changelog"
              className="mt-2 text-xs text-foreground underline underline-offset-2"
            >
              Back to changelog
            </Link>
          </div>
        )}
      </article>
      <LandingFooter />
    </motion.main>
  )
}
