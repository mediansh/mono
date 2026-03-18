"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Image01Icon } from "@hugeicons/core-free-icons"
import { motion, AnimatePresence } from "motion/react"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"

export default function WorkspaceSettingsPage() {
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

      // Switch to another workspace or go to setup
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
    <div className="mx-auto w-full max-w-2xl px-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <h1 className="text-lg font-semibold">Workspace settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your workspace details and preferences.
        </p>
      </motion.div>

      <form onSubmit={handleSave} className="mt-8">
        {/* General section */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05, ease: "easeOut" }}
          className="border-b border-border pb-8"
        >
          <h2 className="text-sm font-medium">General</h2>

          <div className="mt-5 flex flex-col gap-5">
            {/* Logo */}
            <div className="flex items-start gap-4">
              <div className="w-28 shrink-0 pt-1 text-sm text-muted-foreground">
                Logo
              </div>
              <div className="flex flex-col gap-1.5">
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
                  className="group flex size-14 items-center justify-center overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-muted"
                >
                  {iconPreview ? (
                    <img
                      src={iconPreview}
                      alt="Workspace logo"
                      className="size-full object-cover"
                    />
                  ) : (
                    <HugeiconsIcon
                      icon={Image01Icon}
                      size={20}
                      strokeWidth={1.5}
                      className="text-muted-foreground transition-colors group-hover:text-foreground"
                    />
                  )}
                </button>
                <span className="text-xs text-muted-foreground">
                  Click to change
                </span>
              </div>
            </div>

            {/* Name */}
            <div className="flex items-center gap-4">
              <div className="w-28 shrink-0 text-sm text-muted-foreground">
                Name
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 w-full max-w-xs rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>
          </div>
        </motion.div>

        {/* Save button */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1, ease: "easeOut" }}
          className="mt-5 flex items-center gap-3"
        >
          <button
            type="submit"
            disabled={saving || !hasChanges || !name.trim()}
            className="flex h-9 items-center justify-center rounded-lg bg-[#0496FF] px-4 text-sm font-medium text-white transition-colors hover:bg-[#0496FF]/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : saved ? "Saved" : "Save changes"}
          </button>
          <AnimatePresence>
            {saved && (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.2 }}
                className="text-sm text-muted-foreground"
              >
                Changes saved
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      </form>

      {/* Danger zone */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15, ease: "easeOut" }}
        className="mt-10 rounded-lg border border-destructive/30 p-5"
      >
        <h2 className="text-sm font-medium text-destructive">Danger zone</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Permanently delete this workspace and all of its data. This action cannot
          be undone.
        </p>
        <button
          type="button"
          onClick={() => setDeleteModalOpen(true)}
          className="mt-4 flex h-9 items-center justify-center rounded-lg bg-destructive/10 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
        >
          Delete workspace
        </button>
      </motion.div>

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
                Type <span className="font-medium text-foreground">{currentWorkspace.name}</span> to confirm
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
