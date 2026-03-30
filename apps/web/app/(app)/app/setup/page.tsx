"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import { Image as ImageIcon } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { Facehash } from "facehash"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"
import { Logo } from "@/components/logo"
import { trackWorkspaceCreated } from "@/lib/analytics"

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export default function WorkspaceSetupPage() {
  const router = useRouter()
  const createWorkspace = useMutation(api.workspaces.createWorkspace)
  const generateUploadUrl = useMutation(api.workspaces.generateUploadUrl)
  const { workspaces, isLoading } = useWorkspace()

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

      await createWorkspace({ name: name.trim(), iconId: iconId as any })
      trackWorkspaceCreated({ hasLogo: !!iconId })
      router.push("/app")
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

  if (workspaces.length > 0) {
    return null
  }

  const inputClass = "h-9 rounded-[4px] bg-card px-3 text-[13px] ring-1 ring-border outline-none transition-all placeholder:text-muted-foreground focus:ring-foreground/30"
  const buttonClass = "mt-1 flex h-9 items-center justify-center rounded-[4px] bg-primary text-[13px] font-medium text-primary-foreground ring-1 ring-primary-foreground/10 transition-colors hover:bg-primary/90 disabled:opacity-50"

  return (
    <div className="flex h-svh bg-card p-1.5">
      {/* Left half - Form */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        className="flex w-full flex-col justify-center rounded-[4px] bg-background px-8 py-12 ring-1 ring-border sm:px-12 lg:w-1/2 lg:px-20"
      >
        <div className="mx-auto w-full max-w-sm">
          {/* Logo */}
          <div className="mb-10">
            <Logo className="text-2xl" />
          </div>

          <h1 className="text-xl font-semibold tracking-tight">Create your workspace</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Name your workspace to get started. You can optionally upload a logo.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium">
                Logo <span className="text-muted-foreground font-normal">(optional)</span>
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
                className="group flex size-14 items-center justify-center overflow-hidden rounded-[4px] bg-card ring-1 ring-border transition-colors hover:bg-muted"
              >
                {iconPreview ? (
                  <img
                    src={iconPreview}
                    alt="Workspace logo"
                    className="size-full object-cover"
                  />
                ) : name.trim() ? (
                  <Facehash name={name.trim()} size={56} />
                ) : (
                  <ImageIcon
                    size={18}
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

            <div className="flex flex-col gap-1.5">
              <label htmlFor="workspace-name" className="text-[13px] font-medium">
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
                className={inputClass}
              />
            </div>

            {error && (
              <p className="text-[13px] text-destructive">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className={buttonClass}
            >
              {loading ? <Spinner /> : "Create workspace"}
            </button>
          </form>
        </div>
      </motion.div>

      {/* Right half - Branding */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
        className="hidden flex-col items-center justify-center lg:flex lg:w-1/2"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <Logo symbolOnly className="size-28" />
        </motion.div>
      </motion.div>
    </div>
  )
}
