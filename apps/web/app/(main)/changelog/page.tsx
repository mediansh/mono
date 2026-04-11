import { preloadQuery } from "convex/nextjs"
import { api } from "@/convex/_generated/api"
import { ChangelogListView } from "@/components/changelog-list-view"

export const revalidate = 60

export default async function ChangelogPage() {
  const preloaded = await preloadQuery(api.changelogEntries.listPublished, {})
  return <ChangelogListView preloaded={preloaded} />
}
