"use client"

import { useState, type ReactNode } from "react"
import { useMutation, useQuery } from "convex/react"
import { Copy, Plus, Trash } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { toast } from "sonner"
import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"
import {
  hasWorkspaceAdminPermission,
} from "@/lib/workspace-permissions"
import { SettingsAccessState } from "@/components/settings-access-state"
import { LoadingState } from "@/components/loading-state"
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

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(timestamp)
}

function ApiKeysSkeleton() {
  return <LoadingState className="h-[60vh]" />
}

export default function ApiKeysSettingsPage() {
  const { currentWorkspace } = useWorkspace()
  const apiKeys = useQuery(
    api.cli.listApiKeys,
    currentWorkspace ? { workspaceId: currentWorkspace._id } : "skip"
  )
  const generateApiKey = useMutation(api.cli.generateApiKey)
  const revokeApiKey = useMutation(api.cli.revokeApiKey)

  const [label, setLabel] = useState("")
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  if (!currentWorkspace) return null
  if (!hasWorkspaceAdminPermission(currentWorkspace.role)) {
    return (
      <div className="mx-auto w-full max-w-lg px-6 py-6">
        <SettingsAccessState />
      </div>
    )
  }

  if (apiKeys === undefined) {
    return <ApiKeysSkeleton />
  }

  const workspaceId = currentWorkspace._id

  async function handleGenerate() {
    const trimmedLabel = label.trim()
    if (!trimmedLabel) return

    setCreating(true)
    try {
      const result = await generateApiKey({ workspaceId, label: trimmedLabel })
      setNewKey(result.key)
      setLabel("")
      toast.success("API key created.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create API key.")
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(keyId: Id<"cliApiKeys">) {
    setRevokingId(keyId)
    try {
      await revokeApiKey({ keyId })
      toast.success("API key revoked.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revoke API key.")
    } finally {
      setRevokingId(null)
    }
  }

  async function handleCopyKey() {
    if (!newKey) return
    await navigator.clipboard.writeText(newKey)
    toast.success("API key copied to clipboard.")
  }

  return (
    <Stagger className="mx-auto w-full max-w-lg px-6 py-6">
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-4">
        <h2 className="text-[15px] font-semibold">API Keys</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          API keys authenticate the Median CLI and the public HTTP API.
        </p>
      </motion.div>

      {/* New key modal */}
      <Dialog open={!!newKey} onOpenChange={(open) => { if (!open) setNewKey(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API key created</DialogTitle>
            <DialogDescription>
              Copy your API key now — it won't be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[8px] ring-1 ring-border bg-background px-3 py-2 font-mono text-[13px] select-all">
              {newKey}
            </code>
            <button
              type="button"
              onClick={handleCopyKey}
              className="flex size-9 shrink-0 items-center justify-center rounded-[8px] ring-1 ring-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Copy size={14} />
            </button>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Use this key with <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">mdn setup</code> to connect the CLI to this workspace.
          </p>
        </DialogContent>
      </Dialog>

      {/* Generate card */}
      <motion.div variants={fadeUp} className="rounded-[8px] ring-1 ring-border bg-card">
        <div className="p-5">
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-2 block text-[14px] font-medium">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                disabled={creating}
                placeholder='e.g. "MacBook Pro" or "CI Pipeline"'
                className="h-8 w-full rounded-[8px] ring-1 ring-border bg-background px-3 text-[14px] outline-none transition-colors placeholder:text-muted-foreground focus:ring-foreground/30 disabled:cursor-not-allowed disabled:opacity-60"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleGenerate()
                }}
              />
            </div>
            <button
              type="button"
              disabled={creating || !label.trim()}
              onClick={handleGenerate}
              className="flex h-8 w-fit items-center justify-center gap-1.5 rounded-[8px] bg-primary px-3.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={12} weight="bold" />
              {creating ? "Generating..." : "Generate API key"}
            </button>
            <p className="text-[12px] text-muted-foreground">
              Use this key with <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">mdn setup</code> to connect the CLI to this workspace.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Existing keys */}
      {apiKeys.length > 0 && (
        <motion.div variants={fadeUp} className="mt-4">
          <h3 className="mb-3 text-[14px] font-medium">
            Active keys
            <span className="ml-1.5 text-muted-foreground">({apiKeys.length})</span>
          </h3>
          <div className="rounded-[8px] ring-1 ring-border bg-card">
            <div className="divide-y divide-border">
              {apiKeys.map((key) => (
                <div
                  key={key._id}
                  className="group flex items-center justify-between px-3.5 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[14px] font-medium">{key.label}</p>
                      <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-muted-foreground">
                        {key.keyPrefix}
                      </code>
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      Created {formatDate(key.createdAt)}
                      {key.lastUsedAt && ` · Last used ${formatDate(key.lastUsedAt)}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={revokingId === key._id}
                    onClick={() => handleRevoke(key._id)}
                    className="flex size-8 items-center justify-center rounded-[8px] text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </Stagger>
  )
}
