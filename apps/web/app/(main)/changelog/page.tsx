import { ChangelogListView } from "@/components/changelog-list-view"
import { listNotraPosts, notraPostHref } from "@/lib/notra"

export const revalidate = 60

export default async function ChangelogPage() {
  const posts = await listNotraPosts({ limit: 100 })
  const entries = posts.map((post) => ({
    id: post.id,
    href: notraPostHref(post),
    title: post.title,
    markdown: post.markdown,
    publishedAt: new Date(post.createdAt).getTime(),
  }))
  return <ChangelogListView entries={entries} />
}
