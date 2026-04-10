"use client"

import { use } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { motion } from "motion/react"
import { ArrowLeft } from "@phosphor-icons/react"
import { LandingFooter } from "@/components/landing-footer"
import { LandingNavbar } from "@/components/landing-navbar"
import { TiptapContent } from "@/components/tiptap-content"
import { api } from "@/convex/_generated/api"

const ease = [0.25, 0.1, 0.25, 1] as const

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export default function ChangelogEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const entry = useQuery(api.changelogEntries.getPublishedBySlug, { slug })

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

        {entry === undefined ? (
          <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>
        ) : entry === null ? (
          <NotFound />
        ) : (
          <>
            <motion.header
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease }}
              className="mt-6"
            >
              <div className="flex items-center gap-2">
                {entry.version && (
                  <span className="rounded-[3px] bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-foreground">
                    v{entry.version}
                  </span>
                )}
                <p className="text-xs uppercase tracking-wider text-muted-foreground/60">
                  {formatDate(entry.publishedAt)}
                </p>
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                {entry.title}
              </h1>
              {entry.excerpt && (
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
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
        )}
      </article>
      <LandingFooter />
    </motion.main>
  )
}

function NotFound() {
  return (
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
  )
}
