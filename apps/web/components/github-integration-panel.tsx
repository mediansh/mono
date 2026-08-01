"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Link01Icon,
  RotateRight06Icon,
  Unlink01Icon,
} from "@hugeicons/core-free-icons"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { api } from "@/convex/_generated/api"
import { SettingsAccessState } from "@/components/settings-access-state"
import { LoadingState } from "@/components/loading-state"
import { useWorkspace } from "@/components/workspace-provider"
import { useInstantNavigation } from "@/hooks/use-instant-navigation"
import { updateOptimisticQuery } from "@/lib/convex-optimistic"
import { hasWorkspaceAdminPermission } from "@/lib/workspace-permissions"

function formatTimestamp(timestamp: number | null) {
  if (!timestamp) return "Not yet"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp)
}

function GitHubBrandIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

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

function GitHubIntegrationSkeleton() {
  return <LoadingState className="h-[60vh]" />
}

export function GitHubIntegrationPanel() {
  const { currentWorkspace } = useWorkspace()
  const { replace } = useInstantNavigation()
  const searchParams = useSearchParams()
  const [selectedRepoIds, setSelectedRepoIds] = useState<string[]>([])
  const [defaultRepoId, setDefaultRepoId] = useState<string>("")
  const [selectionInitialized, setSelectionInitialized] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)

  const integrationState = useQuery(
    api.github.getWorkspaceGitHubIntegration,
    currentWorkspace ? { workspaceId: currentWorkspace._id } : "skip"
  )
  const beginConnect = useAction(api.github.beginWorkspaceGitHubConnect)
  const saveRepositories = useAction(api.github.updateWorkspaceGitHubRepositories)
  const syncIntegration = useAction(api.github.syncWorkspaceGitHubIntegration)
  const disconnectIntegration = useAction(api.github.disconnectWorkspaceGitHubIntegration)
  const updateFeatureToggles = useMutation(
    api.github.updateWorkspaceGitHubFeatureToggles
  ).withOptimisticUpdate((localStore, args) => {
    updateOptimisticQuery(
      localStore,
      api.github.getWorkspaceGitHubIntegration,
      { workspaceId: args.workspaceId },
      (current) => {
        if (!current.integration) {
          return current
        }

        return {
          ...current,
          integration: {
            ...current.integration,
            issueSyncEnabled:
              args.issueSyncEnabled ?? current.integration.issueSyncEnabled,
            prAutomationEnabled:
              args.prAutomationEnabled ?? current.integration.prAutomationEnabled,
            commitAutomationEnabled:
              args.commitAutomationEnabled ??
              current.integration.commitAutomationEnabled,
          },
        }
      }
    )
  })

  const integration = integrationState?.integration ?? null

  useEffect(() => {
    const status = searchParams.get("github_status")
    const message = searchParams.get("github_message")
    if (!status) return

    if (status === "connected") {
      toast.success(message ?? "GitHub connected.")
    } else {
      toast.error(message ?? "Failed to connect GitHub.")
    }

    replace("/app/integrations/github")
  }, [replace, searchParams])

  useEffect(() => {
    if (integration && !selectionInitialized) {
      setSelectedRepoIds(integration.selectedRepoIds)
      setDefaultRepoId(integration.defaultRepoId ?? "")
      setSelectionInitialized(true)
      return
    }

    if (!integration && selectionInitialized) {
      setSelectedRepoIds([])
      setDefaultRepoId("")
      setSelectionInitialized(false)
    }
  }, [integration, selectionInitialized])

  const repositories = integration?.repositories ?? []
  const hasSelectionChanges = useMemo(() => {
    if (!integration) return false
    const currentIds = [...selectedRepoIds].sort().join("|")
    const savedIds = [...integration.selectedRepoIds].sort().join("|")
    return currentIds !== savedIds || defaultRepoId !== (integration.defaultRepoId ?? "")
  }, [defaultRepoId, integration, selectedRepoIds])

  if (!currentWorkspace) return null
  if (!hasWorkspaceAdminPermission(currentWorkspace.role)) {
    return (
      <div className="mx-auto w-full max-w-lg px-6 py-6">
        <SettingsAccessState />
      </div>
    )
  }
  if (integrationState === undefined) {
    return <GitHubIntegrationSkeleton />
  }

  const workspace = currentWorkspace

  function handleToggleRepo(repoId: string) {
    setSelectedRepoIds((current) => {
      if (current.includes(repoId)) {
        const next = current.filter((id) => id !== repoId)
        if (defaultRepoId === repoId) {
          setDefaultRepoId(next[0] ?? "")
        }
        return next
      }

      const next = [...current, repoId]
      if (!defaultRepoId) {
        setDefaultRepoId(repoId)
      }
      return next
    })
  }

  function handleToggleAllRepos() {
    if (repositories.length === 0) return
    const allSelected = selectedRepoIds.length === repositories.length
    if (allSelected) {
      setSelectedRepoIds([])
      setDefaultRepoId("")
    } else {
      const allIds = repositories.map((repository) => repository.id)
      setSelectedRepoIds(allIds)
      if (!defaultRepoId) {
        setDefaultRepoId(allIds[0] ?? "")
      }
    }
  }

  function handleMakeDefault(repoId: string) {
    setDefaultRepoId(repoId)
    if (!selectedRepoIds.includes(repoId)) {
      setSelectedRepoIds((current) => [...current, repoId])
    }
  }

  async function handleConnect() {
    if (!currentWorkspace) return

    setIsConnecting(true)
    try {
      const redirectUrl = typeof window !== "undefined"
        ? `${window.location.origin}/app/integrations/github`
        : "/app/integrations/github"
      const result = await beginConnect({
        workspaceId: currentWorkspace._id,
        redirectUrl,
      })
      window.location.assign(result.installUrl)
    } catch (error) {
      setIsConnecting(false)
      toast.error(
        error instanceof Error ? error.message : "Failed to start the GitHub connection."
      )
    }
  }

  async function handleSaveRepositories() {
    if (!currentWorkspace || !integration) return
    if (selectedRepoIds.length === 0) {
      toast.error("Select at least one repository.")
      return
    }
    if (!defaultRepoId || !selectedRepoIds.includes(defaultRepoId)) {
      toast.error("Choose a default repository for Median-created issues.")
      return
    }

    setIsSaving(true)
    try {
      await saveRepositories({
        workspaceId: currentWorkspace._id,
        selectedRepoIds,
        defaultRepoId,
      })
      toast.success("Saved GitHub repository settings.")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save repository settings."
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSync() {
    if (!currentWorkspace) return

    setIsSyncing(true)
    try {
      const result = await syncIntegration({
        workspaceId: currentWorkspace._id,
      })
      toast.success(
        `Synced ${result.importedCount} issue${result.importedCount === 1 ? "" : "s"} and pushed ${result.pushedCount} task${result.pushedCount === 1 ? "" : "s"}.`
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to sync GitHub."
      )
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleToggleFeature(
    field: "issueSyncEnabled" | "prAutomationEnabled" | "commitAutomationEnabled",
    checked: boolean
  ) {
    if (!currentWorkspace || !integration) return

    try {
      await updateFeatureToggles({
        workspaceId: currentWorkspace._id,
        issueSyncEnabled: field === "issueSyncEnabled" ? checked : integration.issueSyncEnabled,
        prAutomationEnabled: field === "prAutomationEnabled" ? checked : integration.prAutomationEnabled,
        commitAutomationEnabled: field === "commitAutomationEnabled" ? checked : integration.commitAutomationEnabled,
      })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update automation setting."
      )
    }
  }

  async function handleDisconnect() {
    if (!currentWorkspace) return

    setIsDisconnecting(true)
    try {
      await disconnectIntegration({
        workspaceId: currentWorkspace._id,
      })
      setDisconnectOpen(false)
      toast.success("GitHub disconnected.")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to disconnect GitHub."
      )
    } finally {
      setIsDisconnecting(false)
    }
  }

  /* ── Disconnected state ── */
  if (!integration) {
    return (
      <Stagger className="mx-auto w-full max-w-lg px-6 py-6">
        <div className="flex flex-col gap-3">
          <motion.div variants={fadeUp}>
            <h2 className="text-[15px] font-semibold tracking-tight">GitHub</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Install a GitHub App to sync issues with Median tasks and automate workflows from PRs and commits.
            </p>
          </motion.div>

          <motion.div variants={fadeUp} className="rounded-[8px] ring-1 ring-border gradient-border gradient-border-to-tl gradient-border-from-neutral-700 gradient-border-via-neutral-800 gradient-border-to-neutral-600 bg-card">
            <div className="flex items-center gap-3 p-3.5">
              <div className="flex size-8 items-center justify-center rounded-[8px] bg-foreground/5">
                <GitHubBrandIcon size={20} className="text-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="text-[14px] font-medium">Not connected</h3>
                <p className="text-[12px] text-muted-foreground">
                  Connect selected repositories to import issues and detect PR or commit references like <span className="font-mono text-foreground/70">MDN-123</span>.
                </p>
              </div>
              <Button type="button" onClick={handleConnect} disabled={isConnecting}>
                <HugeiconsIcon icon={Link01Icon} size={15} strokeWidth={1.8} />
                {isConnecting ? "Connecting..." : "Connect"}
              </Button>
            </div>

            <div className="border-t border-border bg-muted/30 px-3.5 py-2">
              <p className="text-[12px] text-muted-foreground">
                You&apos;ll be redirected to GitHub to install the Median app.
              </p>
            </div>
          </motion.div>

        </div>
      </Stagger>
    )
  }

  /* ── Connected state ── */
  return (
    <Stagger className="mx-auto w-full max-w-lg px-6 py-6">
      <div className="flex flex-col gap-3">
        <motion.div variants={fadeUp}>
          <h2 className="text-[15px] font-semibold tracking-tight">GitHub</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Manage the GitHub App installation connected to this workspace.
          </p>
        </motion.div>

        {/* Connection status card */}
        <motion.div variants={fadeUp} className="rounded-[8px] ring-1 ring-border gradient-border gradient-border-to-tl gradient-border-from-neutral-700 gradient-border-via-neutral-800 gradient-border-to-neutral-600 bg-card">
          <div className="flex items-center gap-3 p-3.5">
            <div className="flex size-8 items-center justify-center rounded-[8px] bg-foreground/5">
              <GitHubBrandIcon size={20} className="text-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[14px] font-medium">{integration.accountLogin}</h3>
              <p className="text-[12px] text-muted-foreground">
                {integration.accountType} account &middot; {integration.issueLinkCount} linked issue{integration.issueLinkCount === 1 ? "" : "s"} &middot; Last sync {formatTimestamp(integration.lastSyncedAt)}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-600">
              <span className="size-1.5 bg-emerald-500" />
              Connected
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3.5 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing}
              className="h-7 px-2 text-[12px] text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={RotateRight06Icon} size={13} strokeWidth={1.8} className={isSyncing ? "animate-spin" : ""} />
              {isSyncing ? "Syncing..." : "Sync now"}
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => setDisconnectOpen(true)}>
              <HugeiconsIcon icon={Unlink01Icon} size={13} strokeWidth={1.8} />
              Disconnect
            </Button>
          </div>
        </motion.div>

        {/* Repositories */}
        <motion.div variants={fadeUp} className="rounded-[8px] ring-1 ring-border gradient-border gradient-border-to-tl gradient-border-from-neutral-700 gradient-border-via-neutral-800 gradient-border-to-neutral-600 bg-card">
          <div className="border-b border-border px-3.5 py-2.5">
            <h3 className="text-[14px] font-medium">Repositories</h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Select which repositories sync with Median. The default repo is where new issues are created.
            </p>
          </div>

          {repositories.length > 0 && (
            <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 px-3.5 py-2">
              <span className="text-[12px] text-muted-foreground">
                {selectedRepoIds.length} of {repositories.length} selected
              </span>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleToggleAllRepos}
                className="text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                {selectedRepoIds.length === repositories.length ? "Deselect all" : "Select all"}
              </button>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto">
            {repositories.map((repository) => {
              const isSelected = selectedRepoIds.includes(repository.id)
              const isDefault = defaultRepoId === repository.id
              return (
                <div key={repository.id} className="flex items-center gap-3 border-b border-border/50 px-3.5 py-3 last:border-b-0">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleToggleRepo(repository.id)}
                    className={`flex size-3.5 shrink-0 items-center justify-center rounded-[6px] border transition-colors ${
                      isSelected ? "border-foreground bg-foreground" : "border-muted-foreground/30"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                    aria-pressed={isSelected}
                  >
                    {isSelected ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-background">
                        <path d="M2.5 5L4.5 7L7.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[14px] ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                      {repository.fullName}
                    </p>
                  </div>
                  {isSelected && (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleMakeDefault(repository.id)}
                      className={`rounded-[8px] px-2 py-0.5 text-[12px] font-medium transition-colors ${
                        isDefault
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {isDefault ? "Default" : "Set default"}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {hasSelectionChanges && (
            <div className="flex items-center justify-end border-t border-border px-3.5 py-3">
              <Button
                type="button"
                size="sm"
                onClick={handleSaveRepositories}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          )}
        </motion.div>

        {/* Automations */}
        <motion.div variants={fadeUp} className="rounded-[8px] ring-1 ring-border gradient-border gradient-border-to-tl gradient-border-from-neutral-700 gradient-border-via-neutral-800 gradient-border-to-neutral-600 bg-card">
          <div className="border-b border-border px-3.5 py-2.5">
            <h3 className="text-[14px] font-medium">Automations</h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Choose which GitHub events update task statuses automatically.
            </p>
          </div>
          <div className="divide-y divide-border/50">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] text-foreground">Issue sync</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">Keep linked tasks and GitHub issues in sync.</p>
              </div>
              <Switch
                checked={integration.issueSyncEnabled}
                onCheckedChange={(checked) => handleToggleFeature("issueSyncEnabled", checked)}
              />
            </div>
            <div className="flex items-center gap-3 px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] text-foreground">PR automation</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Open PRs mentioning <span className="font-mono text-foreground/70">MDN-123</span> set Ready. Merged PRs set Shipped.
                </p>
              </div>
              <Switch
                checked={integration.prAutomationEnabled}
                onCheckedChange={(checked) => handleToggleFeature("prAutomationEnabled", checked)}
              />
            </div>
            <div className="flex items-center gap-3 px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] text-foreground">Commit automation</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">Every pushed commit is scanned — by task code, then by AI against your board. Default-branch commits set Shipped. Other branches set In Progress.</p>
              </div>
              <Switch
                checked={integration.commitAutomationEnabled}
                onCheckedChange={(checked) => handleToggleFeature("commitAutomationEnabled", checked)}
              />
            </div>
          </div>
        </motion.div>
      </div>

      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect GitHub</DialogTitle>
            <DialogDescription>
              This will remove the connection between{" "}
              <span className="font-medium text-foreground">{integration.accountLogin}</span>{" "}
              and{" "}
              <span className="font-medium text-foreground">{workspace.name}</span>.
              It does not uninstall the GitHub App from GitHub.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setDisconnectOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" className="flex-1" disabled={isDisconnecting} onClick={handleDisconnect}>
              {isDisconnecting ? "Disconnecting..." : "Disconnect"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Stagger>
  )
}
