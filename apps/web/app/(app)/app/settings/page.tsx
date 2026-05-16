"use client"

import { useState, useRef, useEffect, type ReactNode } from "react"
import { useMutation } from "convex/react"
import { Image, Trash } from "@phosphor-icons/react"
import { Facehash } from "facehash"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"
import { useInstantNavigation } from "@/hooks/use-instant-navigation"
import { useWorkspaceOptimisticMutations } from "@/hooks/use-workspace-optimistic-mutations"
import { hasWorkspaceAdminPermission } from "@/lib/workspace-permissions"
import { trackWorkspaceUpdated, trackWorkspaceDeleted } from "@/lib/analytics"
import { SettingsAccessState } from "@/components/settings-access-state"
import { motion } from "motion/react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"

function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const } },
}

export default function GeneralSettingsPage() {
  const { navigate } = useInstantNavigation()
  const { currentWorkspace, workspaces, switchWorkspace } = useWorkspace()
  const generateUploadUrl = useMutation(api.workspaces.generateUploadUrl)
  const { deleteWorkspaceOptimistic, updateWorkspaceOptimistic } =
    useWorkspaceOptimisticMutations()

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
      <div className="mx-auto w-full max-w-lg px-6 py-6">
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
      await updateWorkspaceOptimistic({
        workspaceId: currentWorkspace._id,
        previousWorkspace: currentWorkspace,
        name: name.trim(),
        ...(newIconId
          ? {
              iconId: newIconId as any,
              iconUrl: iconPreview,
            }
          : {}),
      })
      const changedFields: string[] = []
      if (name.trim() !== currentWorkspace.name) changedFields.push("name")
      if (newIconId) changedFields.push("icon")
      trackWorkspaceUpdated({ fields: changedFields })
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
    const remaining = workspaces.filter((w) => w._id !== currentWorkspace._id)
    setDeleting(true)
    try {
      await deleteWorkspaceOptimistic({
        workspace: currentWorkspace,
        fallbackWorkspaceId: remaining[0]?._id ?? null,
        index: workspaces.findIndex((workspace) => workspace._id === currentWorkspace._id),
      })
      trackWorkspaceDeleted()
      setDeleteModalOpen(false)
      setDeleteConfirm("")
      toast.success("Workspace deleted")
      if (remaining[0]) {
        switchWorkspace(remaining[0]._id)
        navigate("/app")
      } else {
        navigate("/app/setup")
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong while deleting the workspace."
      toast.error(message)
      setDeleting(false)
    }
  }

  const hasChanges = name.trim() !== currentWorkspace.name || iconFile !== null

  return (
    <Stagger className="mx-auto w-full max-w-lg px-6 py-6">
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-4">
        <h2 className="text-[15px] font-semibold">General</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Manage your workspace profile and settings.
        </p>
      </motion.div>

      {/* Workspace profile card */}
      <motion.form variants={fadeUp} onSubmit={handleSave}>
        <div className="rounded-[8px] ring-1 ring-border shine bg-card">
          {/* Logo section */}
          <div className="flex items-center gap-3 border-b border-border p-3.5">
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
              className="group relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[8px] ring-1 ring-border bg-muted/50 transition-all hover:border-foreground/20 hover:shadow-sm"
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
                <Image
                  size={22}
                  className="text-muted-foreground transition-colors group-hover:text-foreground"
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10">
                <Image
                  size={16}
                  className="text-white opacity-0 transition-opacity group-hover:opacity-100"
                />
              </div>
            </button>
            <div className="flex flex-col gap-1">
              <span className="text-[14px] font-medium">Workspace logo</span>
              <span className="text-[12px] text-muted-foreground">
                Upload an image or use the auto-generated avatar. Max 5MB.
              </span>
            </div>
          </div>

          {/* Name section */}
          <div className="p-5">
            <label
              htmlFor="workspace-name"
              className="mb-2 block text-[14px] font-medium"
            >
              Workspace name
            </label>
            <input
              id="workspace-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Workspace"
              className="h-8 w-full rounded-[8px] ring-1 ring-border bg-background px-3 text-[14px] outline-none transition-colors placeholder:text-muted-foreground focus:ring-foreground/30"
            />
          </div>

          {/* Save bar */}
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3.5 py-2">
            <p className="text-[12px] text-muted-foreground">
              This is your workspace&apos;s visible name.
            </p>
            <div className="flex items-center gap-2">
              {saved && (
                <span className="text-xs text-emerald-500">
                  Saved
                </span>
              )}
              <button
                type="submit"
                disabled={saving || !hasChanges || !name.trim()}
                className="flex h-8 items-center justify-center rounded-[8px] bg-primary px-3.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </motion.form>

      {/* Danger zone */}
      {currentWorkspace.role === "owner" ? (
        <motion.div variants={fadeUp} className="mt-4">
          <h3 className="mb-3 text-[14px] font-medium text-destructive">Danger zone</h3>
          <div className="rounded-[8px] ring-1 ring-destructive/20 bg-card">
            <div className="flex items-center justify-between p-3.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[14px] font-medium">Delete workspace</span>
                <span className="text-[12px] text-muted-foreground">
                  Permanently delete this workspace and all of its data.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(true)}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] ring-1 ring-destructive/30 px-3 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash size={13} />
                Delete
              </button>
            </div>
          </div>
        </motion.div>
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
              <label className="text-[13px] text-muted-foreground">
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
                className="h-8 rounded-[8px] ring-1 ring-border shine bg-card px-3 text-[14px] outline-none transition-colors placeholder:text-muted-foreground focus:ring-foreground/30"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false)
                  setDeleteConfirm("")
                }}
                className="flex h-8 flex-1 items-center justify-center rounded-[8px] ring-1 ring-border text-[14px] font-medium transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirm !== currentWorkspace.name || deleting}
                onClick={handleDelete}
                className="flex h-8 flex-1 items-center justify-center rounded-[8px] bg-destructive text-[14px] font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete workspace"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Stagger>
  )
}
