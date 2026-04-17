import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { useMutation, useQuery } from "convex/react"

import { api, type Id } from "~/lib/convex"
import { PostForm } from "~/components/post-form"

export default function EditChangelogEntryPage() {
  const { id: rawId } = useParams<{ id: string }>()
  const id = rawId as Id<"changelogEntries">
  const navigate = useNavigate()

  const entry = useQuery(api.changelogEntries.getById, { id })
  const update = useMutation(api.changelogEntries.update)
  const remove = useMutation(api.changelogEntries.remove)
  const [version, setVersion] = useState("")

  useEffect(() => {
    if (entry && version === "") {
      setVersion(entry.version ?? "")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?._id])

  if (entry === undefined) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-8 text-[12px] text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (entry === null) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-8 text-[12px] text-muted-foreground">
        Entry not found.
      </div>
    )
  }

  return (
    <PostForm
      variant="changelog"
      initial={{
        title: entry.title,
        slug: entry.slug,
        excerpt: entry.excerpt ?? "",
        content: entry.content,
        status: entry.status,
      }}
      extraFields={
        <label className="block">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[12px] font-medium">Version</span>
            <span className="text-[10px] text-muted-foreground">
              Optional, e.g. v1.2.0
            </span>
          </div>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="v1.0.0"
            className="w-full border border-sidebar-border bg-background px-3 py-1.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-sidebar-border"
          />
        </label>
      }
      onSave={async (values) => {
        await update({
          id,
          title: values.title,
          slug: values.slug || undefined,
          excerpt: values.excerpt,
          content: values.content,
          version: version.trim() || undefined,
          status: values.status,
        })
      }}
      onDelete={async () => {
        await remove({ id })
        navigate("/changelog")
      }}
    />
  )
}
