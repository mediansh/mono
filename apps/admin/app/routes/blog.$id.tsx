import { useNavigate, useParams } from "react-router"
import { useMutation, useQuery } from "convex/react"

import { api, type Id } from "~/lib/convex"
import { PostForm } from "~/components/post-form"

export default function EditBlogPostPage() {
  const { id: rawId } = useParams<{ id: string }>()
  const id = rawId as Id<"blogPosts">
  const navigate = useNavigate()

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
        navigate("/blog")
      }}
    />
  )
}
