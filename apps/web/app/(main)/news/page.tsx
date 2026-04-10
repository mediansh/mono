import { preloadQuery } from "convex/nextjs"
import { api } from "@/convex/_generated/api"
import { NewsListView } from "@/components/news-list-view"

export const revalidate = 60

export default async function NewsPage() {
  const preloaded = await preloadQuery(api.blogPosts.listPublished, {})
  return <NewsListView preloaded={preloaded} />
}
