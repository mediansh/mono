"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Image01Icon } from "@hugeicons/core-free-icons"
import { api } from "@/convex/_generated/api"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Logo } from "@/components/logo"

export default function WorkspaceSetupPage() {
  const router = useRouter()
  const createWorkspace = useMutation(api.workspaces.createWorkspace)
  const generateUploadUrl = useMutation(api.workspaces.generateUploadUrl)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState("")
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [iconPreview, setIconPreview] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
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
    if (!iconFile) {
      setError("Please upload a logo")
      return
    }

    setIsCreating(true)
    setError("")

    try {
      const uploadUrl = await generateUploadUrl()
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": iconFile.type },
        body: iconFile,
      })
      const { storageId } = await result.json()

      await createWorkspace({ name: name.trim(), iconId: storageId })
      router.push("/app")
    } catch {
      setError("Failed to create workspace. Please try again.")
      setIsCreating(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo className="!h-6 !w-auto text-[#0496FF]" />
          <div className="text-center">
            <h1 className="text-lg font-semibold text-foreground">
              Create your workspace
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a logo and name your workspace to get started.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              Logo
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
              className="group flex size-20 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border transition-colors hover:border-[#0496FF]/50 hover:bg-[#0496FF]/5"
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
                  size={24}
                  strokeWidth={1.5}
                  className="text-muted-foreground transition-colors group-hover:text-[#0496FF]"
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
                className="w-fit text-xs text-muted-foreground hover:text-foreground"
              >
                Remove
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="workspace-name"
              className="text-xs font-medium text-muted-foreground"
            >
              Name
            </label>
            <Input
              id="workspace-name"
              placeholder="My Workspace"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (error) setError("")
              }}
              autoFocus
            />
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isCreating || !name.trim() || !iconFile}
            className="h-9 w-full bg-[#0496FF] text-white hover:bg-[#0496FF]/90"
          >
            {isCreating ? "Creating..." : "Create workspace"}
          </Button>
        </form>
      </motion.div>
    </div>
  )
}
