"use client"

import { useState, useEffect, useId } from "react"
import { Plus, Trash } from "@phosphor-icons/react"
import { motion, AnimatePresence } from "motion/react"
import { DEFAULT_WORKSPACE_LABELS } from "@/lib/task-board"
import { useWorkspace } from "@/components/workspace-provider"
import { useWorkspaceOptimisticMutations } from "@/hooks/use-workspace-optimistic-mutations"
import { hasWorkspaceAdminPermission } from "@/lib/workspace-permissions"
import { SettingsAccessState } from "@/components/settings-access-state"
import { trackLabelsSaved } from "@/lib/analytics"

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const } },
}

export default function LabelsSettingsPage() {
  const { currentWorkspace } = useWorkspace()
  const { updateWorkspaceLabelsOptimistic } = useWorkspaceOptimisticMutations()
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
  if (!hasWorkspaceAdminPermission(currentWorkspace.role)) {
    return (
      <div className="mx-auto w-full max-w-lg px-6 py-6">
        <SettingsAccessState />
      </div>
    )
  }

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
      await updateWorkspaceLabelsOptimistic({
        workspaceId: currentWorkspace._id,
        labels: cleaned,
        previousWorkspace: currentWorkspace,
      })
      trackLabelsSaved({ labelCount: cleaned.length })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      className="mx-auto w-full max-w-lg px-6 py-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-4">
        <h2 className="text-[14px] font-semibold">Labels</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Manage the labels available for tasks in this workspace.
        </p>
      </motion.div>

      {/* Labels card */}
      <motion.div variants={fadeUp} className="rounded-[4px] ring-1 ring-border bg-card">
        <div className="p-5">
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {labels.map((label, index) => (
                <motion.div
                  key={label.key}
                  exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                  transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
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
                    className="size-8 shrink-0 cursor-pointer appearance-none rounded-[4px] border border-border bg-transparent p-0.5 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[4px] [&::-webkit-color-swatch]:border-none"
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
                    className="h-8 w-full rounded-[4px] ring-1 ring-border bg-background px-2.5 text-[13px] outline-none transition-colors placeholder:text-muted-foreground focus:ring-foreground/30"
                  />
                  <button
                    type="button"
                    onClick={() => removeLabel(index)}
                    className="flex size-8 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 max-md:opacity-100"
                  >
                    <Trash size={14} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={addLabel}
            className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-[4px] border border-dashed border-border text-[11px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <Plus size={13} />
            Add label
          </button>
        </div>

        {/* Save bar */}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3.5 py-2">
          <p className="text-[11px] text-muted-foreground">
            {labels.length} label{labels.length !== 1 ? "s" : ""} configured
          </p>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="text-xs text-emerald-500">
                Saved
              </span>
            )}
            <button
              type="button"
              disabled={saving || labels.some((l) => !l.name.trim())}
              onClick={handleSave}
              className="flex h-8 items-center justify-center rounded-[4px] bg-primary px-3.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
