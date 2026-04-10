import { notFound } from "next/navigation"
import { preloadQuery, preloadedQueryResult } from "convex/nextjs"
import { api } from "@/convex/_generated/api"
import { NewsPostView } from "@/components/news-post-view"

export const revalidate = 60

export default async function NewsPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const preloaded = await preloadQuery(api.blogPosts.getPublishedBySlug, { slug })
  if (preloadedQueryResult(preloaded) === null) {
    notFound()
  }
  return <NewsPostView preloaded={preloaded} />
}
