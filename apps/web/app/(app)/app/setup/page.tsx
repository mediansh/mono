"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import { Image as ImageIcon } from "@phosphor-icons/react"
import { Facehash } from "facehash"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"
import { Logo } from "@/components/logo"

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

  return (
    <div className="flex min-h-svh">
      {/* Left half - Form */}
      <div className="flex w-full flex-col justify-center px-8 py-12 sm:px-12 lg:w-1/2 lg:px-20">
        <div className="mx-auto w-full max-w-sm">
          {/* Logo */}
          <div className="mb-10">
            <Logo className="text-2xl" />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Create your workspace</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Name your workspace to get started. You can optionally upload a logo.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
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
                className="group flex size-16 items-center justify-center overflow-hidden rounded-none border border-border bg-card transition-colors hover:bg-muted"
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
                  <ImageIcon
                    size={20}
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
                  className="w-fit text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="workspace-name" className="text-sm font-medium">
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
                className="h-10 rounded-none border border-border bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="mt-1 flex h-10 items-center justify-center rounded-none bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? <Spinner /> : "Create workspace"}
            </button>
          </form>
        </div>
      </div>

      {/* Right half - Branding */}
      <div className="hidden flex-col items-center justify-center bg-card border-l border-border lg:flex lg:w-1/2">
        <Logo symbolOnly className="size-32" />
      </div>
    </div>
  )
}
