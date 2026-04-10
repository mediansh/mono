"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import { motion } from "motion/react"
import { ArrowRight, Article } from "@phosphor-icons/react"
import { LandingFooter } from "@/components/landing-footer"
import { LandingNavbar } from "@/components/landing-navbar"
import { api } from "@/convex/_generated/api"

const ease = [0.25, 0.1, 0.25, 1] as const

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export default function NewsPage() {
  const posts = useQuery(api.blogPosts.listPublished, {})

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
          <h1 className="text-3xl font-semibold tracking-tight">News</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Product updates, announcements, and stories from the Median team.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12, ease }}
          className="mt-12"
        >
          {posts === undefined ? (
            <LoadingState />
          ) : posts.length === 0 ? (
            <EmptyState />
          ) : (
            <motion.ul
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.05 } } }}
              className="divide-y divide-foreground/[0.06]"
            >
              {posts.map((post) => (
                <motion.li
                  key={post._id}
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } },
                  }}
                  className="group"
                >
                  <Link
                    href={`/news/${post.slug}`}
                    className="block py-6 transition-colors"
                  >
                    <p className="text-xs uppercase tracking-wider text-muted-foreground/60">
                      {formatDate(post.publishedAt)}
                    </p>
                    <h2 className="mt-2 text-lg font-semibold tracking-tight transition-colors group-hover:text-foreground/70">
                      {post.title}
                    </h2>
                    {post.excerpt && (
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">
                        {post.excerpt}
                      </p>
                    )}
                    <span className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                      Read more
                      <ArrowRight size={12} />
                    </span>
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </motion.div>
      </div>
      <LandingFooter />
    </motion.main>
  )
}

function LoadingState() {
  return (
    <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-[6px] bg-foreground/[0.04] ring-1 ring-foreground/[0.06]">
        <Article size={18} className="text-muted-foreground" />
      </div>
      <div className="text-sm font-medium">Nothing here yet</div>
      <div className="max-w-xs text-xs text-muted-foreground">
        We haven&apos;t published any posts yet. Check back soon.
      </div>
    </div>
  )
}
