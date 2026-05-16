"use client"

import { useState, type ReactNode } from "react"
import { motion } from "motion/react"
import { FloppyDisk, Trash } from "@phosphor-icons/react"
import { RichTextEditor, type RichTextValue } from "@/components/rich-text-editor"
import { cn } from "@workspace/ui/lib/utils"

export type PostFormValues = {
  title: string
  slug: string
  excerpt: string
  content: RichTextValue
  status: "draft" | "published"
  extra?: Record<string, string>
}

type PostFormProps = {
  variant: "blog" | "changelog"
  initial?: Partial<PostFormValues>
  onSave: (values: PostFormValues) => Promise<void> | void
  onDelete?: () => Promise<void> | void
  submitLabel?: string
  extraFields?: ReactNode
}

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const } },
}

export function PostForm({
  variant,
  initial,
  onSave,
  onDelete,
  submitLabel = "Save",
  extraFields,
}: PostFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "")
  const [slug, setSlug] = useState(initial?.slug ?? "")
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "")
  const [content, setContent] = useState<RichTextValue>(initial?.content ?? "")
  const [status, setStatus] = useState<"draft" | "published">(initial?.status ?? "draft")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!title.trim()) {
      setError("Title is required")
      return
    }
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        slug: slug.trim(),
        excerpt: excerpt.trim(),
        content,
        status,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    const ok = window.confirm(
      `Delete this ${variant === "blog" ? "post" : "entry"}? This cannot be undone.`,
    )
    if (!ok) return
    setDeleting(true)
    try {
      await onDelete()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.04 } } }}
      className="mx-auto max-w-3xl px-8 py-8"
    >
      <motion.div variants={fadeUp} className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[16px] font-semibold leading-tight">
            {initial ? "Edit" : "New"} {variant === "blog" ? "post" : "changelog entry"}
          </h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {status === "draft" ? "Draft — not visible publicly." : "Published."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="flex h-7 items-center gap-1.5 rounded-[8px] px-2 text-[13px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
            >
              <Trash size={13} />
              <span>Delete</span>
            </button>
          )}
          <button
            type="submit"
            disabled={saving || deleting}
            className="flex h-7 items-center gap-1.5 rounded-[8px] bg-foreground px-2.5 text-[13px] font-medium text-background transition-colors hover:bg-foreground/90 disabled:pointer-events-none disabled:opacity-40"
          >
            <FloppyDisk size={13} weight="fill" />
            <span>{saving ? "Saving…" : submitLabel}</span>
          </button>
        </div>
      </motion.div>

      {error && (
        <motion.div
          variants={fadeUp}
          className="mb-4 rounded-[9px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive"
        >
          {error}
        </motion.div>
      )}

      <motion.div variants={fadeUp} className="space-y-4">
        <Field label="Title">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={variant === "blog" ? "Announcing…" : "What's new"}
            className={inputClass}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Slug" hint="Auto-generated from title if blank.">
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-post"
              className={inputClass}
            />
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "draft" | "published")}
              className={cn(inputClass, "cursor-pointer")}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </Field>
        </div>

        {extraFields}

        <Field label="Excerpt" hint="Short summary used for previews.">
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            rows={2}
            className={cn(inputClass, "min-h-[60px] resize-y")}
          />
        </Field>

        <FieldGroup label="Content">
          <RichTextEditor
            defaultValue={initial?.content ?? ""}
            onChange={setContent}
            placeholder={
              variant === "blog" ? "Start writing your post…" : "Describe what changed…"
            }
          />
        </FieldGroup>
      </motion.div>
    </motion.form>
  )
}

const inputClass =
  "w-full rounded-[9px] border border-sidebar-border bg-background px-3 py-1.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:ring-1 focus:ring-sidebar-border"

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[13px] font-medium">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

// Same look as Field, but renders a <div> instead of a <label>. Use this for
// children that contain their own interactive controls (like the rich text
// editor's toolbar buttons) — otherwise clicks anywhere in the group get
// forwarded by the label to the first button inside.
function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[13px] font-medium">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
