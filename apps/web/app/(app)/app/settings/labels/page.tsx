"use client"

import { useState, useEffect, useId } from "react"
import { useMutation } from "convex/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons"
import { DEFAULT_WORKSPACE_LABELS } from "@/lib/task-board"
import { motion, AnimatePresence } from "motion/react"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"

export default function LabelsSettingsPage() {
  const { currentWorkspace } = useWorkspace()
  const updateWorkspaceLabels = useMutation(api.workspaces.updateWorkspaceLabels)
  const baseId = useId()

  const [labels, setLabels] = useState<
    { name: string; color: string; key: string }[]
  >([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [keyCounter, setKeyCounter] = useState(0)

  useEffect(() => {
    if (currentWorkspace) {
      const source = currentWorkspace.labels ?? DEFAULT_WORKSPACE_LABELS
      setLabels(source.map((l, i) => ({ ...l, key: `${baseId}-init-${i}` })))
    }
  }, [currentWorkspace, baseId])

  if (!currentWorkspace) return null

  function addLabel() {
    const nextKey = keyCounter + 1
    setKeyCounter(nextKey)
    setLabels([
      ...labels,
      { name: "", color: "#6b7280", key: `${baseId}-new-${nextKey}` },
    ])
  }

  function removeLabel(index: number) {
    setLabels(labels.filter((_, i) => i !== index))
  }

  async function handleSave() {
    if (!currentWorkspace) return
    setSaving(true)
    try {
      const cleaned = labels
        .filter((l) => l.name.trim())
        .map((l) => ({ name: l.name.trim(), color: l.color }))
      await updateWorkspaceLabels({
        workspaceId: currentWorkspace._id,
        labels: cleaned,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-10 py-10">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-base font-semibold">Labels</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the labels available for tasks in this workspace.
        </p>
      </div>

      {/* Labels card */}
      <div className="rounded-lg border border-border bg-card">
        <div className="p-5">
          <div className="flex flex-col gap-2">
              {labels.map((label, index) => (
                <div
                  key={label.key}
                  className="group flex items-center gap-2.5"
                >
                  <input
                    type="color"
                    value={label.color}
                    onChange={(e) => {
                      const next = [...labels]
                      next[index] = { ...next[index]!, color: e.target.value }
                      setLabels(next)
                    }}
                    className="size-8 shrink-0 cursor-pointer appearance-none rounded-md border border-border bg-transparent p-0.5 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-none"
                  />
                  <input
                    type="text"
                    value={label.name}
                    onChange={(e) => {
                      const next = [...labels]
                      next[index] = { ...next[index]!, name: e.target.value }
                      setLabels(next)
                    }}
                    placeholder="Label name"
                    autoFocus={label.name === ""}
                    className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                  <button
                    type="button"
                    onClick={() => removeLabel(index)}
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    <HugeiconsIcon
                      icon={Delete02Icon}
                      size={14}
                      strokeWidth={1.5}
                    />
                  </button>
                </div>
              ))}
          </div>

          <button
            type="button"
            onClick={addLabel}
            className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={1.5} />
            Add label
          </button>
        </div>

        {/* Save bar */}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {labels.length} label{labels.length !== 1 ? "s" : ""} configured
          </p>
          <div className="flex items-center gap-2">
            <AnimatePresence>
              {saved && (
                <motion.span
                  initial={{ opacity: 0, x: 4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 4 }}
                  transition={{ duration: 0.15 }}
                  className="text-xs text-emerald-500"
                >
                  Saved
                </motion.span>
              )}
            </AnimatePresence>
            <button
              type="button"
              disabled={saving || labels.some((l) => !l.name.trim())}
              onClick={handleSave}
              className="flex h-8 items-center justify-center rounded-md bg-[#0496FF] px-3.5 text-xs font-medium text-white transition-colors hover:bg-[#0496FF]/90 disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
