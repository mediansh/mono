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

export default function NewsPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const post = useQuery(api.blogPosts.getPublishedBySlug, { slug })

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

        {post === undefined ? (
          <PostSkeleton />
        ) : post === null ? (
          <NotFound />
        ) : (
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
        )}
      </article>
      <LandingFooter />
    </motion.main>
  )
}

function PostSkeleton() {
  return (
    <div className="mt-6">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-4 h-8 w-11/12" />
      <Skeleton className="mt-3 h-8 w-3/5" />
      <div className="mt-6 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-[96%]" />
        <Skeleton className="h-3 w-[92%]" />
      </div>
      <div className="mt-10 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-[97%]" />
        <Skeleton className="h-3 w-[90%]" />
        <Skeleton className="h-3 w-[94%]" />
        <Skeleton className="h-3 w-3/4" />
      </div>
      <div className="mt-8 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-[85%]" />
        <Skeleton className="h-3 w-[93%]" />
      </div>
    </div>
  )
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[4px] bg-foreground/[0.06] ${className ?? ""}`}
    />
  )
}

function NotFound() {
  return (
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
  )
}
