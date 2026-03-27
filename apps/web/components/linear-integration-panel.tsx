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
    <div className="mx-auto w-full max-w-3xl px-10 py-10">
      <div className="space-y-4">
        <div className="h-14 rounded-none border border-border bg-muted/25" />
        <div className="h-52 rounded-none border border-border bg-muted/20" />
        <div className="h-36 rounded-none border border-border bg-muted/15" />
      </div>
    </div>
  )
}

function MappingRow({
  median,
  linear,
}: {
  median: string
  linear: string
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/70 py-3 text-sm last:border-b-0">
      <span className="text-foreground/90">{median}</span>
      <span className="flex items-center gap-2 text-muted-foreground">
        <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.8} />
        {linear}
      </span>
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
      <div className="mx-auto w-full max-w-3xl px-10 py-10">
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

  if (integration) {
    return (
      <div className="mx-auto w-full max-w-3xl px-10 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="space-y-6"
        >
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Linear</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Keep this workspace mirrored with one Linear team. Backlog requests stay requests,
              review maps to ready, and done maps to shipped.
            </p>
          </div>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.3, ease: "easeOut" }}
            className="relative overflow-hidden rounded-none border border-border bg-card"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(94,106,210,0.18),_transparent_42%),linear-gradient(135deg,rgba(94,106,210,0.1),transparent_48%)]" />
            <div className="absolute right-0 top-0 h-36 w-36 border-l border-b border-[#5E6AD2]/15 bg-[linear-gradient(135deg,rgba(94,106,210,0.18),transparent)]" />
            <div className="relative flex flex-col gap-6 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="flex size-12 items-center justify-center rounded-none border border-[#5E6AD2]/20 bg-[#5E6AD2]/8">
                    <LinearBrandMark size={24} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-base font-semibold text-foreground">
                        {integration.teamName}
                      </h3>
                      <span className="inline-flex items-center gap-1.5 border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-emerald-700">
                        <span className="size-1.5 bg-emerald-500" />
                        Connected
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {integration.teamKey ? `${integration.teamKey} team` : "Selected team"} synced
                      to {workspace.name}.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={handleSyncNow} disabled={isSyncing}>
                    <HugeiconsIcon icon={RotateRight06Icon} size={14} strokeWidth={1.8} />
                    {isSyncing ? "Syncing..." : "Sync now"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => setDisconnectOpen(true)}
                  >
                    <HugeiconsIcon icon={Unlink01Icon} size={14} strokeWidth={1.8} />
                    Disconnect
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="border border-border/80 bg-background/60 p-4">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    <HugeiconsIcon icon={User03Icon} size={14} strokeWidth={1.8} />
                    Account
                  </div>
                  <p className="text-sm font-medium text-foreground">{integration.linearUserName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {integration.linearUserEmail ?? integration.maskedApiKey}
                  </p>
                </div>

                <div className="border border-border/80 bg-background/60 p-4">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    <HugeiconsIcon icon={Link01Icon} size={14} strokeWidth={1.8} />
                    Auth
                  </div>
                  <p className="text-sm font-medium text-foreground">{integration.maskedApiKey}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Connected {formatTimestamp(integration.connectedAt)}
                  </p>
                </div>

                <div className="border border-border/80 bg-background/60 p-4">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    <HugeiconsIcon icon={CheckmarkBadge01Icon} size={14} strokeWidth={1.8} />
                    Last sync
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {formatTimestamp(integration.lastSyncedAt)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Webhooks keep issue changes flowing back into Median.
                  </p>
                </div>
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3, ease: "easeOut" }}
            className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"
          >
            <div className="border border-border bg-card p-6">
              <div className="mb-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Status mapping
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Median statuses are translated into Linear workflow categories. Any started state
                  containing "review" is treated as ready on the Median board.
                </p>
              </div>

              <div>
                <MappingRow median="Requests" linear="Backlog" />
                <MappingRow median="Todo" linear="Unstarted" />
                <MappingRow median="In progress" linear="Started" />
                <MappingRow median="Ready" linear="Review" />
                <MappingRow median="Shipped" linear="Done" />
              </div>
            </div>

            <div className="border border-border bg-card p-6">
              <div className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                <HugeiconsIcon icon={InformationCircleIcon} size={14} strokeWidth={1.8} />
                How it works
              </div>
              <div className="space-y-4 text-sm text-muted-foreground">
                <div className="border border-border/70 bg-background/40 p-4">
                  New Median tasks create or update matching Linear issues inside this team.
                </div>
                <div className="border border-border/70 bg-background/40 p-4">
                  Linear issue updates arrive through a webhook and patch the matching Median task.
                </div>
                <div className="border border-border/70 bg-background/40 p-4">
                  The manual sync button backfills existing issues and pushes unsynced Median work.
                </div>
              </div>
            </div>
          </motion.section>
        </motion.div>

        <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Disconnect Linear</DialogTitle>
              <DialogDescription>
                This stops future syncing for <span className="text-foreground">{integration.teamName}</span>.
                Existing Median tasks will remain.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDisconnectOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
              >
                {isDisconnecting ? "Disconnecting..." : "Disconnect"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-10 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="space-y-6"
      >
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Linear</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Connect one Linear team to this workspace and keep tasks synced in both directions.
          </p>
        </div>

        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.3, ease: "easeOut" }}
          className="overflow-hidden rounded-none border border-border bg-card"
        >
          <div className="border-b border-border bg-[linear-gradient(135deg,rgba(94,106,210,0.12),transparent_55%)] p-6">
            <div className="flex items-start gap-4">
              <div className="flex size-12 items-center justify-center rounded-none border border-[#5E6AD2]/20 bg-[#5E6AD2]/8">
                <LinearBrandMark size={24} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Link a Linear team</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  This setup uses a Linear personal API key, creates a workspace-specific webhook,
                  then runs an initial 1:1 sync.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Personal API key
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="lin_api_..."
                    className="h-11 rounded-none"
                  />
                  <Button
                    type="button"
                    onClick={handlePreviewTeams}
                    disabled={isLoadingTeams}
                    className="h-11 shrink-0"
                  >
                    <HugeiconsIcon icon={LaptopCheckIcon} size={14} strokeWidth={1.8} />
                    {isLoadingTeams ? "Loading..." : "Load teams"}
                  </Button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Team
                </label>
                <select
                  value={selectedTeamId}
                  onChange={(event) => setSelectedTeamId(event.target.value)}
                  disabled={previewTeams.length === 0}
                  className="h-11 w-full rounded-none border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {previewTeams.length === 0 ? (
                    <option value="">Load teams first</option>
                  ) : null}
                  {previewTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.key ? `${team.name} (${team.key})` : team.name}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                type="button"
                onClick={handleConnect}
                disabled={isConnecting || !selectedTeamId || !apiKey.trim()}
                className="h-11 w-full sm:w-auto"
              >
                <HugeiconsIcon icon={Link01Icon} size={14} strokeWidth={1.8} />
                {isConnecting ? "Connecting..." : "Connect and sync"}
              </Button>
            </div>

            <div className="space-y-4">
              <div className="border border-border bg-background/40 p-5">
                <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  <HugeiconsIcon icon={InformationCircleIcon} size={14} strokeWidth={1.8} />
                  What happens next
                </div>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Requests become backlog items in Linear.</p>
                  <p>Ready maps to review-oriented started states in Linear.</p>
                  <p>Shipped maps to done, and existing issues are backfilled into Median.</p>
                </div>
              </div>

              <div className="border border-border bg-background/40 p-5">
                <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  <HugeiconsIcon icon={User03Icon} size={14} strokeWidth={1.8} />
                  Preview
                </div>
                {previewUser || selectedTeam ? (
                  <div className="space-y-2 text-sm">
                    <p className="text-foreground">
                      {previewUser?.name ?? previewUser?.email ?? "Authenticated user"}
                    </p>
                    <p className="text-muted-foreground">
                      {selectedTeam
                        ? `Connecting ${selectedTeam.name}${selectedTeam.key ? ` (${selectedTeam.key})` : ""}`
                        : "Choose a team after loading access."}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Load your Linear teams to verify the key and choose where Median should sync.
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.section>
      </motion.div>
    </div>
  )
}
