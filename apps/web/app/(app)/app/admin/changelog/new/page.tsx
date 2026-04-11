"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { PostForm } from "@/components/cms/post-form"

export default function NewChangelogEntryPage() {
  const router = useRouter()
  const create = useMutation(api.changelogEntries.create)
  const [version, setVersion] = useState("")

  return (
    <PostForm
      variant="changelog"
      submitLabel="Create"
      extraFields={
        <label className="block">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[12px] font-medium">Version</span>
            <span className="text-[10px] text-muted-foreground">Optional, e.g. v1.2.0</span>
          </div>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="v1.0.0"
            className="w-full rounded-[5px] border border-sidebar-border bg-background px-3 py-1.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-sidebar-border"
          />
        </label>
      }
      onSave={async (values) => {
        const id = await create({
          title: values.title,
          slug: values.slug || undefined,
          excerpt: values.excerpt || undefined,
          content: values.content,
          version: version.trim() || undefined,
          status: values.status,
        })
        router.push(`/app/admin/changelog/${id}`)
      }}
    />
  )
}
