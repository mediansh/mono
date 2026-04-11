"use client"

import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { PostForm } from "@/components/cms/post-form"

export default function NewBlogPostPage() {
  const router = useRouter()
  const create = useMutation(api.blogPosts.create)

  return (
    <PostForm
      variant="blog"
      submitLabel="Create"
      onSave={async (values) => {
        const id = await create({
          title: values.title,
          slug: values.slug || undefined,
          excerpt: values.excerpt || undefined,
          content: values.content,
          status: values.status,
        })
        router.push(`/app/admin/blog/${id}`)
      }}
    />
  )
}
