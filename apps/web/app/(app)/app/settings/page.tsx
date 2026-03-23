"use client"

import { useState, useRef, useEffect } from "react"
import { useMutation } from "convex/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Image01Icon, Delete02Icon } from "@hugeicons/core-free-icons"
import { motion, AnimatePresence } from "motion/react"
import { Facehash } from "facehash"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"
import { useRouter } from "next/navigation"
import { hasWorkspaceAdminPermission } from "@/lib/workspace-permissions"
import { SettingsAccessState } from "@/components/settings-access-state"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"

export default function GeneralSettingsPage() {
  const router = useRouter()
  const { currentWorkspace, workspaces, switchWorkspace } = useWorkspace()
  const updateWorkspace = useMutation(api.workspaces.updateWorkspace)
  const deleteWorkspace = useMutation(api.workspaces.deleteWorkspace)
  const generateUploadUrl = useMutation(api.workspaces.generateUploadUrl)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState("")
  const [iconPreview, setIconPreview] = useState<string | null>(null)
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState("")
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (currentWorkspace) {
      setName(currentWorkspace.name)
      setIconPreview(currentWorkspace.iconUrl)
    }
  }, [currentWorkspace])

  if (!currentWorkspace) return null
  if (!hasWorkspaceAdminPermission(currentWorkspace.role)) {
    return (
      <div className="mx-auto w-full max-w-2xl px-10 py-10">
        <SettingsAccessState />
      </div>
    )
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) return
    if (file.size > 5 * 1024 * 1024) return
    setIconFile(file)
    setIconPreview(URL.createObjectURL(file))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!currentWorkspace || !name.trim()) return
    setSaving(true)
    try {
      let newIconId: undefined | string = undefined
      if (iconFile) {
        const uploadUrl = await generateUploadUrl()
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": iconFile.type },
          body: iconFile,
        })
        const { storageId } = await result.json()
        newIconId = storageId
      }
      await updateWorkspace({
        workspaceId: currentWorkspace._id,
        name: name.trim(),
        ...(newIconId ? { iconId: newIconId as any } : {}),
      })
      setIconFile(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!currentWorkspace) return
    setDeleting(true)
    try {
      await deleteWorkspace({ workspaceId: currentWorkspace._id })
      const remaining = workspaces.filter((w) => w._id !== currentWorkspace._id)
      if (remaining[0]) {
        switchWorkspace(remaining[0]._id)
        router.push("/app")
      } else {
        router.push("/app/setup")
      }
    } catch {
      setDeleting(false)
    }
  }

  const hasChanges = name.trim() !== currentWorkspace.name || iconFile !== null

  return (
    <div className="mx-auto w-full max-w-2xl px-10 py-10">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-base font-semibold">General</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your workspace profile and settings.
        </p>
      </div>

      {/* Workspace profile card */}
      <form onSubmit={handleSave}>
        <div className="rounded-lg border border-border bg-card">
          {/* Logo section */}
          <div className="flex items-center gap-4 border-b border-border p-5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/50 transition-all hover:border-foreground/20 hover:shadow-sm"
            >
              {iconPreview ? (
                <img
                  src={iconPreview}
                  alt="Workspace logo"
                  className="size-full object-cover"
                />
              ) : name.trim() ? (
                <Facehash name={name.trim()} size={64} />
              ) : (
                <HugeiconsIcon
                  icon={Image01Icon}
                  size={22}
                  strokeWidth={1.5}
                  className="text-muted-foreground transition-colors group-hover:text-foreground"
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10">
                <HugeiconsIcon
                  icon={Image01Icon}
                  size={16}
                  strokeWidth={2}
                  className="text-white opacity-0 transition-opacity group-hover:opacity-100"
                />
              </div>
            </button>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Workspace logo</span>
              <span className="text-xs text-muted-foreground">
                Upload an image or use the auto-generated avatar. Max 5MB.
              </span>
            </div>
          </div>

          {/* Name section */}
          <div className="p-5">
            <label
              htmlFor="workspace-name"
              className="mb-2 block text-sm font-medium"
            >
              Workspace name
            </label>
            <input
              id="workspace-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Workspace"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>

          {/* Save bar */}
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-3">
            <p className="text-xs text-muted-foreground">
              This is your workspace&apos;s visible name.
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
                type="submit"
                disabled={saving || !hasChanges || !name.trim()}
                className="flex h-8 items-center justify-center rounded-md bg-[#0496FF] px-3.5 text-xs font-medium text-white transition-colors hover:bg-[#0496FF]/90 disabled:opacity-40"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Danger zone */}
      {currentWorkspace.role === "owner" ? (
        <div className="mt-8">
          <h3 className="mb-3 text-sm font-medium text-destructive">Danger zone</h3>
          <div className="rounded-lg border border-destructive/20 bg-card">
            <div className="flex items-center justify-between p-5">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Delete workspace</span>
                <span className="text-xs text-muted-foreground">
                  Permanently delete this workspace and all of its data.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(true)}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-destructive/30 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={1.5} />
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete confirmation modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete workspace</DialogTitle>
            <DialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {currentWorkspace.name}
              </span>{" "}
              and all of its data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-muted-foreground">
                Type{" "}
                <span className="font-medium text-foreground">
                  {currentWorkspace.name}
                </span>{" "}
                to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={currentWorkspace.name}
                className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false)
                  setDeleteConfirm("")
                }}
                className="flex h-9 flex-1 items-center justify-center rounded-lg border border-border text-sm font-medium transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirm !== currentWorkspace.name || deleting}
                onClick={handleDelete}
                className="flex h-9 flex-1 items-center justify-center rounded-lg bg-destructive text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete workspace"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
