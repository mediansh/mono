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

export function NewsPostView({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.blogPosts.getPublishedBySlug>
}) {
  const post = usePreloadedQuery(preloaded)

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
            href="/news"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={12} />
            Back to news
          </Link>
        </motion.div>

        {post ? (
          <>
            <motion.header
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease }}
              className="mt-6"
            >
              <p className="text-xs uppercase tracking-wider text-muted-foreground/60">
                {formatDate(post.publishedAt)}
                {post.authorName ? ` · ${post.authorName}` : ""}
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                {post.title}
              </h1>
              {post.excerpt && (
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  {post.excerpt}
                </p>
              )}
            </motion.header>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18, ease }}
              className="mt-10"
            >
              <TiptapContent json={post.content} />
            </motion.div>
          </>
        ) : (
          <div className="mt-16 flex flex-col items-center justify-center gap-3 text-center">
            <div className="text-base font-semibold">Post not found</div>
            <p className="max-w-xs text-sm text-muted-foreground">
              This post may have been removed or the link is incorrect.
            </p>
            <Link
              href="/news"
              className="mt-2 text-xs text-foreground underline underline-offset-2"
            >
              Back to news
            </Link>
          </div>
        )}
      </article>
      <LandingFooter />
    </motion.main>
  )
}
