"use client"

import { useEffect, useMemo, useState } from "react"
import { useAction, useQuery } from "convex/react"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  CheckmarkBadge01Icon,
  InformationCircleIcon,
  LaptopCheckIcon,
  Link01Icon,
  RotateRight06Icon,
  Unlink01Icon,
  User03Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"
import { SettingsAccessState } from "@/components/settings-access-state"
import { hasWorkspaceAdminPermission } from "@/lib/workspace-permissions"

type PreviewTeam = {
  id: string
  name: string
  key: string | null
}

function formatTimestamp(timestamp: number | null) {
  if (!timestamp) return "Not synced yet"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp)
}

function LinearBrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <path fill="#5E6AD2" d="M1.225 61.523c-.222-.949.908-1.546 1.597-.857l36.512 36.512c.69.69.092 1.82-.857 1.597-18.425-4.323-32.93-18.827-37.252-37.252ZM.002 46.889a.99.99 0 0 0 .29.76L52.35 99.71c.201.2.478.307.76.29 2.37-.149 4.695-.46 6.963-.927.765-.157 1.03-1.096.478-1.648L2.576 39.448c-.552-.551-1.491-.286-1.648.479a50.067 50.067 0 0 0-.926 6.962ZM4.21 29.705a.988.988 0 0 0 .208 1.1l64.776 64.776c.289.29.726.375 1.1.208a49.908 49.908 0 0 0 5.185-2.684.981.981 0 0 0 .183-1.54L8.436 24.336a.981.981 0 0 0-1.541.183 49.896 49.896 0 0 0-2.684 5.185Zm8.448-11.631a.986.986 0 0 1-.045-1.354C21.78 6.46 35.111 0 49.952 0 77.592 0 100 22.407 100 50.048c0 14.84-6.46 28.172-16.72 37.338a.986.986 0 0 1-1.354-.045L12.659 18.074Z" />
    </svg>
  )
}

function LinearSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl px-10 py-10">
      <div className="mb-8 h-12 bg-muted/30" />
      <div className="h-36 border border-border bg-card/50" />
    </div>
  )
}

export function LinearIntegrationPanel() {
  const { currentWorkspace } = useWorkspace()
  const [apiKey, setApiKey] = useState("")
  const [previewTeams, setPreviewTeams] = useState<PreviewTeam[]>([])
  const [previewUser, setPreviewUser] = useState<{ name: string | null; email: string | null } | null>(
    null
  )
  const [selectedTeamId, setSelectedTeamId] = useState("")
  const [isLoadingTeams, setIsLoadingTeams] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)

  const integrationState = useQuery(
    api.linear.getWorkspaceLinearIntegration,
    currentWorkspace ? { workspaceId: currentWorkspace._id } : "skip"
  )
  const previewLinearTeams = useAction(api.linear.previewLinearTeams)
  const connectLinear = useAction(api.linear.connectWorkspaceLinearIntegration)
  const disconnectLinear = useAction(api.linear.disconnectWorkspaceLinearIntegration)
  const syncLinear = useAction(api.linear.syncWorkspaceLinearIntegration)

  const selectedTeam = useMemo(
    () => previewTeams.find((team) => team.id === selectedTeamId) ?? null,
    [previewTeams, selectedTeamId]
  )

  useEffect(() => {
    if (!selectedTeamId && previewTeams[0]) {
      setSelectedTeamId(previewTeams[0].id)
    }
  }, [previewTeams, selectedTeamId])

  if (!currentWorkspace) return null
  if (!hasWorkspaceAdminPermission(currentWorkspace.role)) {
    return (
      <div className="mx-auto w-full max-w-2xl px-10 py-10">
        <SettingsAccessState />
      </div>
    )
  }
  if (integrationState === undefined) {
    return <LinearSkeleton />
  }

  const workspace = currentWorkspace
  const integration = integrationState.integration

  async function handlePreviewTeams() {
    if (!apiKey.trim()) {
      toast.error("Enter a Linear API key first.")
      return
    }

    setIsLoadingTeams(true)
    try {
      const result = await previewLinearTeams({ apiKey: apiKey.trim() })
      setPreviewTeams(result.teams)
      setPreviewUser({
        name: result.viewer.name,
        email: result.viewer.email,
      })
      setSelectedTeamId(result.teams[0]?.id ?? "")
      toast.success(`Loaded ${result.teams.length} Linear team${result.teams.length === 1 ? "" : "s"}.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load Linear teams.")
    } finally {
      setIsLoadingTeams(false)
    }
  }

  async function handleConnect() {
    if (!apiKey.trim()) {
      toast.error("Enter a Linear API key first.")
      return
    }
    if (!selectedTeamId) {
      toast.error("Choose a Linear team to connect.")
      return
    }

    setIsConnecting(true)
    try {
      const result = await connectLinear({
        workspaceId: workspace._id,
        apiKey: apiKey.trim(),
        teamId: selectedTeamId,
      })
      setApiKey("")
      setPreviewTeams([])
      setPreviewUser(null)
      setSelectedTeamId("")
      toast.success(
        `Connected ${result.teamName} and synced ${result.syncResult.importedCount} Linear issue${result.syncResult.importedCount === 1 ? "" : "s"}.`
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect Linear.")
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleSyncNow() {
    setIsSyncing(true)
    try {
      const result = await syncLinear({ workspaceId: workspace._id })
      toast.success(
        `Synced ${result.importedCount} Linear issue${result.importedCount === 1 ? "" : "s"} and pushed ${result.pushedCount} Median task${result.pushedCount === 1 ? "" : "s"}.`
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sync Linear.")
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleDisconnect() {
    setIsDisconnecting(true)
    try {
      await disconnectLinear({ workspaceId: workspace._id })
      setDisconnectOpen(false)
      toast.success("Linear disconnected.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect Linear.")
    } finally {
      setIsDisconnecting(false)
    }
  }

  /* ── Connected state ── */
  if (integration) {
    return (
      <div className="mx-auto w-full max-w-2xl px-10 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="flex flex-col gap-6"
        >
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Linear</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage the Linear team synced to this workspace.
            </p>
          </div>

          {/* Connection status card */}
          <div className="rounded-none border border-border bg-card">
            <div className="flex items-center gap-4 p-5">
              <div className="flex size-10 items-center justify-center rounded-none bg-[#5E6AD2]/10">
                <LinearBrandMark size={20} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium">{integration.teamName}</h3>
                <p className="text-xs text-muted-foreground">
                  {integration.teamKey ? `${integration.teamKey} team` : "Selected team"} synced
                  to {workspace.name}
                  {integration.linearUserEmail ? (
                    <span className="ml-1 text-muted-foreground/60">
                      &middot; {integration.linearUserEmail}
                    </span>
                  ) : null}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <span className="size-1.5 bg-emerald-500" />
                Connected
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-3">
              <p className="text-xs text-muted-foreground">
                Last synced {formatTimestamp(integration.lastSyncedAt)}
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={handleSyncNow} disabled={isSyncing}>
                  <HugeiconsIcon icon={RotateRight06Icon} size={13} strokeWidth={1.8} />
                  {isSyncing ? "Syncing..." : "Sync now"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => setDisconnectOpen(true)}
                >
                  <HugeiconsIcon icon={Unlink01Icon} size={13} strokeWidth={1.8} />
                  Disconnect
                </Button>
              </div>
            </div>
          </div>

          {/* Status mapping */}
          <div className="rounded-none border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
              <HugeiconsIcon icon={ArrowRight01Icon} size={15} strokeWidth={1.8} className="text-muted-foreground" />
              <div className="flex-1">
                <h3 className="text-sm font-medium">Status mapping</h3>
                <p className="text-xs text-muted-foreground">
                  How Median statuses translate to Linear workflow states.
                </p>
              </div>
            </div>
            <div className="divide-y divide-border">
              {[
                { median: "Requests", linear: "Backlog" },
                { median: "Todo", linear: "Unstarted" },
                { median: "In progress", linear: "Started" },
                { median: "Ready", linear: "Review" },
                { median: "Shipped", linear: "Done" },
              ].map((row) => (
                <div key={row.median} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="text-foreground">{row.median}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={1.8} />
                    {row.linear}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-border bg-muted/30 px-5 py-3">
              <p className="text-xs text-muted-foreground">
                Any started state containing &ldquo;review&rdquo; maps to Ready on the Median board.
              </p>
            </div>
          </div>

          {/* How it works */}
          <div className="rounded-none border border-dashed border-border p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <HugeiconsIcon icon={InformationCircleIcon} size={14} strokeWidth={1.8} />
              How it works
            </div>
            <div className="grid gap-2.5 text-sm text-muted-foreground">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-[10px] font-semibold text-muted-foreground/60">1</span>
                <span>New Median tasks create or update matching Linear issues inside this team.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-[10px] font-semibold text-muted-foreground/60">2</span>
                <span>Linear issue updates arrive through a webhook and patch the matching Median task.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-[10px] font-semibold text-muted-foreground/60">3</span>
                <span>The manual sync button backfills existing issues and pushes unsynced Median work.</span>
              </div>
            </div>
          </div>
        </motion.div>

        <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Disconnect Linear</DialogTitle>
              <DialogDescription>
                This will disconnect{" "}
                <span className="font-medium text-foreground">{integration.teamName}</span>{" "}
                from{" "}
                <span className="font-medium text-foreground">{workspace.name}</span>.
                Future syncing will stop but existing Median tasks will remain.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDisconnectOpen(false)}
                className="flex h-9 flex-1 items-center justify-center rounded-none border border-border text-sm font-medium transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDisconnecting}
                onClick={handleDisconnect}
                className="flex h-9 flex-1 items-center justify-center rounded-none bg-destructive text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {isDisconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  /* ── Disconnected state ── */
  return (
    <div className="mx-auto w-full max-w-2xl px-10 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="flex flex-col gap-6"
      >
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Linear</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect a Linear team to this workspace and keep tasks synced in both directions.
          </p>
        </div>

        {/* Connection card */}
        <div className="rounded-none border border-border bg-card">
          <div className="flex items-center gap-4 p-5">
            <div className="flex size-10 items-center justify-center rounded-none bg-[#5E6AD2]/10">
              <LinearBrandMark size={20} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium">Not connected</h3>
              <p className="text-xs text-muted-foreground">
                Enter a Linear personal API key to get started.
              </p>
            </div>
          </div>

          <div className="space-y-4 border-t border-border p-5">
            <div>
              <label htmlFor="linear-api-key" className="mb-2 block text-sm font-medium">
                Personal API key
              </label>
              <div className="flex gap-2">
                <Input
                  id="linear-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="lin_api_..."
                  className="h-9 flex-1"
                />
                <Button
                  type="button"
                  onClick={handlePreviewTeams}
                  disabled={isLoadingTeams}
                  className="h-9"
                >
                  <HugeiconsIcon icon={LaptopCheckIcon} size={15} strokeWidth={1.8} />
                  {isLoadingTeams ? "Loading..." : "Load teams"}
                </Button>
              </div>
            </div>

            {previewTeams.length > 0 ? (
              <div>
                <label htmlFor="linear-team" className="mb-2 block text-sm font-medium">
                  Team
                </label>
                <select
                  id="linear-team"
                  value={selectedTeamId}
                  onChange={(event) => setSelectedTeamId(event.target.value)}
                  className="h-9 w-full rounded-none border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                >
                  {previewTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.key ? `${team.name} (${team.key})` : team.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {previewUser ? (
              <div className="flex items-center gap-3 border border-border bg-muted/30 px-4 py-3">
                <HugeiconsIcon icon={User03Icon} size={14} strokeWidth={1.8} className="text-muted-foreground" />
                <div className="text-sm">
                  <span className="text-foreground">
                    {previewUser.name ?? previewUser.email ?? "Authenticated user"}
                  </span>
                  {selectedTeam ? (
                    <span className="ml-1.5 text-muted-foreground">
                      &middot; {selectedTeam.name}{selectedTeam.key ? ` (${selectedTeam.key})` : ""}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {previewTeams.length > 0 ? (
              <Button
                type="button"
                onClick={handleConnect}
                disabled={isConnecting || !selectedTeamId || !apiKey.trim()}
                className="h-9 bg-[#5E6AD2] px-4 text-white hover:bg-[#5E6AD2]/90"
              >
                <HugeiconsIcon icon={Link01Icon} size={15} strokeWidth={1.8} />
                {isConnecting ? "Connecting..." : "Connect and sync"}
              </Button>
            ) : null}
          </div>

          <div className="flex items-center border-t border-border bg-muted/30 px-5 py-3">
            <p className="text-xs text-muted-foreground">
              API keys can be created at Linear &rarr; Settings &rarr; API &rarr; Personal API keys.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="rounded-none border border-dashed border-border p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <HugeiconsIcon icon={InformationCircleIcon} size={14} strokeWidth={1.8} />
            How it works
          </div>
          <div className="grid gap-2.5 text-sm text-muted-foreground">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-[10px] font-semibold text-muted-foreground/60">1</span>
              <span>Enter your Linear API key and select the team to sync with.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-[10px] font-semibold text-muted-foreground/60">2</span>
              <span>Median runs an initial sync and creates a webhook for live updates.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-[10px] font-semibold text-muted-foreground/60">3</span>
              <span>Tasks stay mirrored: requests become backlog, shipped maps to done.</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
