"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import { motion } from "motion/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Logo } from "@/components/logo"

const WORKSPACE_ICONS = [
  "🏠", "🚀", "💼", "🎯", "⚡", "🔥", "💎", "🌟",
  "🎨", "📦", "🛠️", "🧪", "📊", "🏗️", "🌐", "🤖",
  "📝", "🎵", "📸", "🎮", "🧩", "🔬", "🌿", "☕",
]

export default function WorkspaceSetupPage() {
  const router = useRouter()
  const createWorkspace = useMutation(api.workspaces.createWorkspace)

  const [name, setName] = useState("")
  const [icon, setIcon] = useState("🚀")
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError("Workspace name is required")
      return
    }

    setIsCreating(true)
    setError("")

    try {
      await createWorkspace({ name: name.trim(), icon })
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
              Pick an icon and name to get started.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              Icon
            </label>
            <div className="grid grid-cols-8 gap-1.5">
              {WORKSPACE_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={`flex size-9 items-center justify-center rounded-lg text-lg transition-colors ${
                    icon === emoji
                      ? "bg-[#0496FF]/10 ring-1.5 ring-[#0496FF]"
                      : "hover:bg-muted"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
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
            disabled={isCreating || !name.trim()}
            className="h-9 w-full bg-[#0496FF] text-white hover:bg-[#0496FF]/90"
          >
            {isCreating ? "Creating..." : "Create workspace"}
          </Button>
        </form>
      </motion.div>
    </div>
  )
}
