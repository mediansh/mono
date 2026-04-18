import { useNavigate } from "react-router"
import { useMutation } from "convex/react"

import { api } from "~/lib/convex"
import { PostForm } from "~/components/post-form"

export default function NewBlogPostPage() {
  const navigate = useNavigate()
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
        navigate(`/blog/${id}`)
      }}
    />
  )
}
