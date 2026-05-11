"use client"

import { useState, useRef } from "react"
import { useAction, useConvexAuth, useMutation } from "convex/react"
import { Image as ImageIcon } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { Facehash } from "facehash"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"
import { useInstantNavigation } from "@/hooks/use-instant-navigation"
import { useWorkspaceOptimisticMutations } from "@/hooks/use-workspace-optimistic-mutations"
import { Logo } from "@/components/logo"
import { trackWorkspaceCreated } from "@/lib/analytics"

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

export default function WorkspaceSetupPage() {
  const { navigate } = useInstantNavigation()
  const generateUploadUrl = useMutation(api.workspaces.generateUploadUrl)
  const attachScalePlan = useAction(api.earlyAccess.attachScaleForCurrentUser)
  const { createWorkspaceOptimistic } = useWorkspaceOptimisticMutations()
  const { workspaces, isLoading } = useWorkspace()
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState("")
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [iconPreview, setIconPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB")
      return
    }
    setIconFile(file)
    setIconPreview(URL.createObjectURL(file))
    if (error) setError("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError("Workspace name is required")
      return
    }
    if (isAuthLoading || !isAuthenticated) {
      setError("Still signing you in. Please try again in a moment.")
      return
    }
    setLoading(true)
    setError("")
    try {
      let iconId: string | undefined
      if (iconFile) {
        const uploadUrl = await generateUploadUrl()
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": iconFile.type },
          body: iconFile,
        })
        const data = await result.json()
        iconId = data.storageId
      }
      const workspaceId = await createWorkspaceOptimistic({
        name: name.trim(),
        iconId: iconId as any,
        iconUrl: iconPreview,
      })
      trackWorkspaceCreated({ hasLogo: !!iconId })
      // Fire-and-forget: don't block navigation on the Scale plan attach.
      // Errors here must not strand the user on /app/setup.
      attachScalePlan({ workspaceId }).catch((planError) => {
        console.error("[early-access] Failed to attach Scale plan", planError)
      })
      navigate("/app")
    } catch {
      setError("Failed to create workspace. Please try again.")
      setLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      </div>
    )
  }

  if (workspaces.length > 0) return null

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-[340px]"
      >
        <div className="mb-8 flex justify-center">
          <Logo symbolOnly className="size-9" />
        </div>

        <div className="rounded-[4px] bg-card p-5 ring-1 ring-border">
          <h1 className="text-center text-[15px] font-semibold">
            Create your workspace
          </h1>
          <p className="mt-1 text-center text-[13px] text-muted-foreground">
            Name your workspace to get started
          </p>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium">
                Logo{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
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
                className="group flex size-12 items-center justify-center overflow-hidden rounded-[4px] bg-background ring-1 ring-border transition-colors hover:bg-accent"
              >
                {iconPreview ? (
                  <img
                    src={iconPreview}
                    alt="Workspace logo"
                    className="size-full object-cover"
                  />
                ) : name.trim() ? (
                  <Facehash name={name.trim()} size={48} />
                ) : (
                  <ImageIcon
                    size={16}
                    className="text-muted-foreground transition-colors group-hover:text-foreground"
                  />
                )}
              </button>
              {iconPreview && (
                <button
                  type="button"
                  onClick={() => {
                    setIconFile(null)
                    setIconPreview(null)
                    if (fileInputRef.current) fileInputRef.current.value = ""
                  }}
                  className="w-fit text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="workspace-name"
                className="text-[13px] font-medium"
              >
                Workspace name
              </label>
              <input
                id="workspace-name"
                type="text"
                placeholder="My Workspace"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (error) setError("")
                }}
                autoFocus
                className="h-9 rounded-[4px] bg-background px-3 text-[13px] ring-1 ring-border transition-all outline-none placeholder:text-muted-foreground focus:ring-foreground/30"
              />
            </div>

            {error && <p className="text-[12px] text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={loading || isAuthLoading || !isAuthenticated || !name.trim()}
              className="mt-1 flex h-9 items-center justify-center rounded-[4px] bg-primary text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? <Spinner /> : "Create workspace"}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
