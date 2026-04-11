"use client"

import { use } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { PostForm } from "@/components/cms/post-form"

export default function EditBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: rawId } = use(params)
  const id = rawId as Id<"blogPosts">
  const router = useRouter()

  const post = useQuery(api.blogPosts.getById, { id })
  const update = useMutation(api.blogPosts.update)
  const remove = useMutation(api.blogPosts.remove)

  if (post === undefined) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-8 text-[12px] text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (post === null) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-8 text-[12px] text-muted-foreground">
        Post not found.
      </div>
    )
  }

  return (
    <PostForm
      variant="blog"
      initial={{
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt ?? "",
        content: post.content,
        status: post.status,
      }}
      onSave={async (values) => {
        await update({
          id,
          title: values.title,
          slug: values.slug || undefined,
          excerpt: values.excerpt,
          content: values.content,
          status: values.status,
        })
      }}
      onDelete={async () => {
        await remove({ id })
        router.push("/app/admin/blog")
      }}
    />
  )
}
