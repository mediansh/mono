import { notFound } from "next/navigation"
import { preloadQuery, preloadedQueryResult } from "convex/nextjs"
import { api } from "@/convex/_generated/api"
import { ChangelogEntryView } from "@/components/changelog-entry-view"

export const revalidate = 60

export default async function ChangelogEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const preloaded = await preloadQuery(api.changelogEntries.getPublishedBySlug, {
    slug,
  })
  if (preloadedQueryResult(preloaded) === null) {
    notFound()
  }
  return <ChangelogEntryView preloaded={preloaded} />
}
