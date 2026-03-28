"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useAction, useQuery } from "convex/react"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkBadge01Icon,
  InformationCircleIcon,
  Link01Icon,
  RotateRight06Icon,
  Unlink01Icon,
} from "@hugeicons/core-free-icons"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { api } from "@/convex/_generated/api"
import { SettingsAccessState } from "@/components/settings-access-state"
import { useWorkspace } from "@/components/workspace-provider"
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
  return (
    <div className="mx-auto w-full max-w-2xl px-10 py-10">
      <div className="mb-8 h-12 bg-muted/30" />
      <div className="h-36 border border-border bg-card/50" />
    </div>
  )
}

function RepoSelectionRow({
  id,
  name,
  subtitle,
  selected,
  isDefault,
  disabled,
  onToggle,
  onMakeDefault,
}: {
  id: string
  name: string
  subtitle: string
  selected: boolean
  isDefault: boolean
  disabled: boolean
  onToggle: (id: string) => void
  onMakeDefault: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3 last:border-b-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onToggle(id)}
        className={`flex size-4 shrink-0 items-center justify-center rounded-none border transition-colors ${
          selected ? "border-foreground bg-foreground text-background" : "border-border bg-background text-transparent"
        } disabled:cursor-not-allowed disabled:opacity-60`}
        aria-pressed={selected}
      >
        <span className="text-[10px] leading-none">✓</span>
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <button
        type="button"
        disabled={disabled || !selected}
        onClick={() => onMakeDefault(id)}
        className={`rounded-none border px-2 py-1 text-[11px] font-medium transition-colors ${
          isDefault
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-background text-muted-foreground hover:text-foreground"
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {isDefault ? "Default" : "Set default"}
      </button>
    </div>
  )
}

export function GitHubIntegrationPanel() {
  const { currentWorkspace } = useWorkspace()
  const router = useRouter()
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

  const integration = integrationState?.integration ?? null
  const callbackUrl = integrationState?.callbackUrl ?? null
  const webhookUrl = integrationState?.webhookUrl ?? null

  useEffect(() => {
    const status = searchParams.get("github_status")
    const message = searchParams.get("github_message")
    if (!status) return

    if (status === "connected") {
      toast.success(message ?? "GitHub connected.")
    } else {
      toast.error(message ?? "Failed to connect GitHub.")
    }

    router.replace("/app/integrations/github")
  }, [router, searchParams])

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
      <div className="mx-auto w-full max-w-2xl px-10 py-10">
        <SettingsAccessState />
      </div>
    )
  }
  if (integrationState === undefined) {
    return <GitHubIntegrationSkeleton />
  }

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

  if (!integration) {
    return (
      <Stagger className="mx-auto w-full max-w-2xl px-10 py-10">
        <div className="flex flex-col gap-6">
          <motion.div variants={fadeUp}>
            <h2 className="text-lg font-semibold tracking-tight">GitHub</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Install a GitHub App to sync issues one-to-one with Median tasks and drive Ready/Shipped automatically from PRs and commits.
            </p>
          </motion.div>

          <motion.div variants={fadeUp} className="rounded-none border border-border bg-card">
            <div className="flex items-center gap-4 p-5">
              <div className="flex size-10 items-center justify-center rounded-none bg-foreground/5">
                <GitHubBrandIcon size={20} className="text-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium">Not connected</h3>
                <p className="text-xs text-muted-foreground">
                  Connect selected repositories to import issues and detect PR or commit references like <span className="font-mono">MDN-123</span>.
                </p>
              </div>
              <Button
                type="button"
                onClick={handleConnect}
                disabled={isConnecting}
                className="rounded-none"
              >
                <HugeiconsIcon icon={Link01Icon} size={16} strokeWidth={1.8} className="mr-2" />
                {isConnecting ? "Connecting..." : "Connect"}
              </Button>
            </div>
          </motion.div>

          <motion.div variants={fadeUp} className="rounded-none border border-border bg-card/60 p-5">
            <div className="flex items-start gap-3">
              <HugeiconsIcon icon={InformationCircleIcon} size={18} strokeWidth={1.8} className="mt-0.5 text-muted-foreground" />
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Open pull requests mentioning a task code move that task to Ready.</p>
                <p>Merged pull requests or default-branch commits mentioning a task code move that task to Shipped.</p>
                <p>Median-created tasks automatically create linked GitHub issues in the default repository you choose after installation.</p>
              </div>
            </div>
          </motion.div>

          {(callbackUrl || webhookUrl) && (
            <motion.div variants={fadeUp} className="rounded-none border border-border bg-card/60 p-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">GitHub App Configuration</p>
              <div className="space-y-2">
                {callbackUrl && (
                  <div>
                    <p className="text-xs text-muted-foreground">Setup URL (post-installation redirect)</p>
                    <p className="mt-0.5 break-all font-mono text-xs text-foreground">{callbackUrl}</p>
                  </div>
                )}
                {webhookUrl && (
                  <div>
                    <p className="text-xs text-muted-foreground">Webhook URL</p>
                    <p className="mt-0.5 break-all font-mono text-xs text-foreground">{webhookUrl}</p>
                  </div>
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Ensure these URLs match the Setup URL and Webhook URL in your GitHub App settings.
              </p>
            </motion.div>
          )}
        </div>
      </Stagger>
    )
  }

  return (
    <Stagger className="mx-auto w-full max-w-2xl px-10 py-10">
      <div className="flex flex-col gap-6">
        <motion.div variants={fadeUp}>
          <h2 className="text-lg font-semibold tracking-tight">GitHub</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage the GitHub App installation connected to this workspace.
          </p>
        </motion.div>

        <motion.div variants={fadeUp} className="rounded-none border border-border bg-card">
          <div className="flex items-center gap-4 p-5">
            <div className="flex size-10 items-center justify-center rounded-none bg-foreground/5">
              <GitHubBrandIcon size={20} className="text-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-medium">{integration.accountLogin}</h3>
              <p className="text-xs text-muted-foreground">
                {integration.accountType} account connected {formatTimestamp(integration.connectedAt)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSync}
                disabled={isSyncing}
                className="rounded-none"
              >
                <HugeiconsIcon icon={RotateRight06Icon} size={16} strokeWidth={1.8} className="mr-2" />
                {isSyncing ? "Syncing..." : "Sync now"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDisconnectOpen(true)}
                className="rounded-none"
              >
                <HugeiconsIcon icon={Unlink01Icon} size={16} strokeWidth={1.8} className="mr-2" />
                Disconnect
              </Button>
            </div>
          </div>
          <div className="grid gap-px border-t border-border bg-border sm:grid-cols-3">
            <div className="bg-card px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Issue Links</p>
              <p className="mt-1 text-sm text-foreground">{integration.issueLinkCount}</p>
            </div>
            <div className="bg-card px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Repositories</p>
              <p className="mt-1 text-sm text-foreground">{integration.selectedRepoIds.length} selected</p>
            </div>
            <div className="bg-card px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Last Sync</p>
              <p className="mt-1 text-sm text-foreground">{formatTimestamp(integration.lastSyncedAt)}</p>
            </div>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="rounded-none border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h3 className="text-sm font-medium">Repository Selection</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Selected repositories participate in issue sync and PR or commit detection. The default repository is where Median-created tasks open new GitHub issues.
            </p>
          </div>
          <div>
            {repositories.map((repository) => (
              <RepoSelectionRow
                key={repository.id}
                id={repository.id}
                name={repository.fullName}
                subtitle={`${repository.isPrivate ? "Private" : "Public"}${repository.defaultBranch ? ` • default branch ${repository.defaultBranch}` : ""}`}
                selected={selectedRepoIds.includes(repository.id)}
                isDefault={defaultRepoId === repository.id}
                disabled={isSaving}
                onToggle={handleToggleRepo}
                onMakeDefault={handleMakeDefault}
              />
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border px-5 py-4">
            <p className="text-xs text-muted-foreground">
              Default repo: {repositories.find((repository) => repository.id === defaultRepoId)?.fullName ?? "None"}
            </p>
            <Button
              type="button"
              onClick={handleSaveRepositories}
              disabled={isSaving || !hasSelectionChanges}
              className="rounded-none"
            >
              <HugeiconsIcon icon={CheckmarkBadge01Icon} size={16} strokeWidth={1.8} className="mr-2" />
              {isSaving ? "Saving..." : "Save selection"}
            </Button>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="rounded-none border border-border bg-card/60 p-5">
          <div className="flex items-start gap-3">
            <HugeiconsIcon icon={InformationCircleIcon} size={18} strokeWidth={1.8} className="mt-0.5 text-muted-foreground" />
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Ready automation: any open PR mentioning a task code such as <span className="font-mono">MDN-123</span> moves that task to Ready.</p>
              <p>Shipped automation: merged PRs or default-branch commits mentioning the task code move it to Shipped.</p>
              <p>Issue sync: linked tasks and issues stay one-to-one, and manual sync re-imports selected repositories before pushing local task changes back to GitHub.</p>
            </div>
          </div>
        </motion.div>
      </div>

      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent className="rounded-none">
          <DialogHeader>
            <DialogTitle>Disconnect GitHub?</DialogTitle>
            <DialogDescription>
              This removes the workspace installation metadata and Median-side links. It does not uninstall the GitHub App from GitHub.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDisconnectOpen(false)} className="rounded-none">
              Cancel
            </Button>
            <Button type="button" onClick={handleDisconnect} disabled={isDisconnecting} className="rounded-none">
              <HugeiconsIcon icon={Unlink01Icon} size={16} strokeWidth={1.8} className="mr-2" />
              {isDisconnecting ? "Disconnecting..." : "Disconnect"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Stagger>
  )
}
