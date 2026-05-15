import { notFound } from "next/navigation"
import { ChangelogEntryView } from "@/components/changelog-entry-view"
import { getNotraPostByHref, notraPostHref } from "@/lib/notra"

export const revalidate = 60

export default async function ChangelogEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getNotraPostByHref(slug)
  if (!post) notFound()
  return (
    <ChangelogEntryView
      entry={{
        id: post.id,
        href: notraPostHref(post),
        title: post.title,
        markdown: post.markdown,
        publishedAt: new Date(post.createdAt).getTime(),
      }}
    />
  )
}
