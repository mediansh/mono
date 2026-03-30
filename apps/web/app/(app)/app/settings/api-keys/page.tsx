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
  return (
    <div className="mx-auto w-full max-w-2xl px-10 py-10">
      <div className="mb-8">
        <div className="h-5 w-24 rounded bg-muted/60" />
        <div className="mt-2 h-4 w-72 rounded bg-muted/40" />
      </div>
      <div className="rounded-[4px] border border-border bg-card">
        <div className="space-y-3 p-5">
          <div className="h-4 w-12 rounded bg-muted/40" />
          <div className="h-10 w-full rounded-[4px] bg-muted/30" />
          <div className="h-8 w-40 rounded-[4px] bg-muted/40" />
        </div>
      </div>
      <div className="mt-8">
        <div className="mb-3 h-4 w-28 rounded bg-muted/50" />
        <div className="rounded-[4px] border border-border bg-card">
          <div className="divide-y divide-border">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1">
                  <div className="h-4 w-32 rounded bg-muted/50" />
                  <div className="mt-1.5 h-3 w-44 rounded bg-muted/30" />
                </div>
                <div className="h-6 w-16 rounded-[4px] bg-muted/30" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
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
      <div className="mx-auto w-full max-w-2xl px-10 py-10">
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
    <Stagger className="mx-auto w-full max-w-2xl px-10 py-10">
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-8">
        <h2 className="text-base font-semibold">API Keys</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create API keys for the Median CLI and AI agent integrations.
        </p>
      </motion.div>

      {/* New key reveal */}
      {newKey && (
        <motion.div
          variants={fadeUp}
          className="mb-6 rounded-[4px] border border-amber-500/30 bg-amber-500/5 p-5"
        >
          <p className="mb-2 text-sm font-medium text-amber-400">
            Copy your API key now — it won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-[4px] border border-border bg-background px-3 py-2 font-mono text-xs select-all">
              {newKey}
            </code>
            <button
              type="button"
              onClick={handleCopyKey}
              className="flex size-9 shrink-0 items-center justify-center rounded-[4px] border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Copy size={14} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setNewKey(null)}
            className="mt-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Dismiss
          </button>
        </motion.div>
      )}

      {/* Generate card */}
      <motion.div variants={fadeUp} className="rounded-[4px] border border-border bg-card">
        <div className="p-5">
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-2 block text-sm font-medium">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                disabled={creating}
                placeholder='e.g. "MacBook Pro" or "CI Pipeline"'
                className="h-10 w-full rounded-[4px] border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleGenerate()
                }}
              />
            </div>
            <button
              type="button"
              disabled={creating || !label.trim()}
              onClick={handleGenerate}
              className="flex h-8 w-fit items-center justify-center gap-1.5 rounded-[4px] bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={12} weight="bold" />
              {creating ? "Generating..." : "Generate API key"}
            </button>
            <p className="text-xs text-muted-foreground">
              Use this key with <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">mdn setup</code> to connect the CLI to this workspace.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Existing keys */}
      {apiKeys.length > 0 && (
        <motion.div variants={fadeUp} className="mt-8">
          <h3 className="mb-3 text-sm font-medium">
            Active keys
            <span className="ml-1.5 text-muted-foreground">({apiKeys.length})</span>
          </h3>
          <div className="rounded-[4px] border border-border bg-card">
            <div className="divide-y divide-border">
              {apiKeys.map((key) => (
                <div
                  key={key._id}
                  className="group flex items-center justify-between px-5 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{key.label}</p>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {key.keyPrefix}
                      </code>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Created {formatDate(key.createdAt)}
                      {key.lastUsedAt && ` · Last used ${formatDate(key.lastUsedAt)}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={revokingId === key._id}
                    onClick={() => handleRevoke(key._id)}
                    className="flex size-8 items-center justify-center rounded-[4px] text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
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
