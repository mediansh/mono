"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useAction, useQuery } from "convex/react"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  CheckmarkBadge01Icon,
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
import { SettingsAccessState } from "@/components/settings-access-state"
import { LoadingState } from "@/components/loading-state"
import { useWorkspace } from "@/components/workspace-provider"
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskStatus,
} from "@/lib/task-board"
import { hasWorkspaceAdminPermission } from "@/lib/workspace-permissions"

type PreviewTeam = {
  id: string
  name: string
  key: string | null
}

type LinearWorkflowStateOption = {
  id: string
  name: string
  type: string
}

type StatusMappings = Partial<Record<TaskStatus, string>>

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

function formatWorkflowStateType(type: string) {
  return type
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
}

function serializeStatusMappings(statusMappings: StatusMappings) {
  return TASK_STATUSES.map(
    (status) => `${status}:${statusMappings[status] ?? ""}`
  ).join("|")
}

function LinearBrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <path
        fill="#5E6AD2"
        d="M1.225 61.523c-.222-.949.908-1.546 1.597-.857l36.512 36.512c.69.69.092 1.82-.857 1.597-18.425-4.323-32.93-18.827-37.252-37.252ZM.002 46.889a.99.99 0 0 0 .29.76L52.35 99.71c.201.2.478.307.76.29 2.37-.149 4.695-.46 6.963-.927.765-.157 1.03-1.096.478-1.648L2.576 39.448c-.552-.551-1.491-.286-1.648.479a50.067 50.067 0 0 0-.926 6.962ZM4.21 29.705a.988.988 0 0 0 .208 1.1l64.776 64.776c.289.29.726.375 1.1.208a49.908 49.908 0 0 0 5.185-2.684.981.981 0 0 0 .183-1.54L8.436 24.336a.981.981 0 0 0-1.541.183 49.896 49.896 0 0 0-2.684 5.185Zm8.448-11.631a.986.986 0 0 1-.045-1.354C21.78 6.46 35.111 0 49.952 0 77.592 0 100 22.407 100 50.048c0 14.84-6.46 28.172-16.72 37.338a.986.986 0 0 1-1.354-.045L12.659 18.074Z"
      />
    </svg>
  )
}

function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
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

function LinearSkeleton() {
  return <LoadingState className="h-[60vh]" />
}

function StatusMappingRow({
  status,
  value,
  states,
  disabled,
  onChange,
}: {
  status: TaskStatus
  value?: string
  states: LinearWorkflowStateOption[]
  disabled: boolean
  onChange: (status: TaskStatus, value: string) => void
}) {
  const selectValue = value && states.some((s) => s.id === value) ? value : ""

  return (
    <div className="flex items-center gap-3 px-3.5 py-2">
      <span className="w-24 shrink-0 text-[14px] text-foreground">
        {TASK_STATUS_LABELS[status]}
      </span>
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        size={12}
        strokeWidth={1.8}
        className="shrink-0 text-muted-foreground/50"
      />
      <select
        value={selectValue}
        disabled={disabled}
        onChange={(event) => onChange(status, event.target.value)}
        className="h-8 min-w-0 flex-1 rounded-[8px] border border-border bg-background pl-2.5 pr-7 text-[14px] text-foreground transition-colors outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-60"
      >
        <option value="">Automatic</option>
        {states.map((state) => (
          <option key={state.id} value={state.id}>
            {state.name} ({formatWorkflowStateType(state.type)})
          </option>
        ))}
      </select>
    </div>
  )
}

export function LinearIntegrationPanel() {
  const { currentWorkspace } = useWorkspace()
  const [apiKey, setApiKey] = useState("")
  const [previewTeams, setPreviewTeams] = useState<PreviewTeam[]>([])
  const [previewUser, setPreviewUser] = useState<{
    name: string | null
    email: string | null
  } | null>(null)
  const [selectedTeamId, setSelectedTeamId] = useState("")
  const [workflowStates, setWorkflowStates] = useState<
    LinearWorkflowStateOption[]
  >([])
  const [draftStatusMappings, setDraftStatusMappings] =
    useState<StatusMappings>({})
  const [isLoadingTeams, setIsLoadingTeams] = useState(false)
  const [isLoadingWorkflowStates, setIsLoadingWorkflowStates] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSavingMappings, setIsSavingMappings] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)

  const integrationState = useQuery(
    api.linear.getWorkspaceLinearIntegration,
    currentWorkspace ? { workspaceId: currentWorkspace._id } : "skip"
  )
  const previewLinearTeams = useAction(api.linear.previewLinearTeams)
  const loadWorkflowStates = useAction(
    api.linear.getWorkspaceLinearWorkflowStates
  )
  const connectLinear = useAction(api.linear.connectWorkspaceLinearIntegration)
  const updateLinearStatusMappings = useAction(
    api.linear.updateWorkspaceLinearStatusMappings
  )
  const disconnectLinear = useAction(
    api.linear.disconnectWorkspaceLinearIntegration
  )
  const syncLinear = useAction(api.linear.syncWorkspaceLinearIntegration)

  const selectedTeam = useMemo(
    () => previewTeams.find((team) => team.id === selectedTeamId) ?? null,
    [previewTeams, selectedTeamId]
  )
  const integration = integrationState?.integration ?? null
  const workspaceId = currentWorkspace?._id ?? null

  useEffect(() => {
    if (!selectedTeamId && previewTeams[0]) {
      setSelectedTeamId(previewTeams[0].id)
    }
  }, [previewTeams, selectedTeamId])

  useEffect(() => {
    if (!workspaceId || integrationState === undefined || !integration) {
      setWorkflowStates([])
      setDraftStatusMappings({})
      return
    }

    const connectedWorkspaceId = workspaceId
    setDraftStatusMappings(integration.statusMappings)

    let isActive = true

    async function loadConnectedWorkflowStates() {
      setIsLoadingWorkflowStates(true)
      try {
        const result = await loadWorkflowStates({
          workspaceId: connectedWorkspaceId,
        })
        if (!isActive) return
        setWorkflowStates(result.states)
      } catch (error) {
        if (!isActive) return
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load Linear workflow states."
        )
      } finally {
        if (isActive) {
          setIsLoadingWorkflowStates(false)
        }
      }
    }

    void loadConnectedWorkflowStates()

    return () => {
      isActive = false
    }
  }, [integration, integrationState, loadWorkflowStates, workspaceId])

  if (!currentWorkspace) return null
  if (!hasWorkspaceAdminPermission(currentWorkspace.role)) {
    return (
      <div className="mx-auto w-full max-w-lg px-6 py-6">
        <SettingsAccessState />
      </div>
    )
  }
  if (integrationState === undefined) {
    return <LinearSkeleton />
  }

  const workspace = currentWorkspace
  const savedStatusMappings = integration?.statusMappings ?? {}
  const hasMappingChanges =
    integration !== null &&
    serializeStatusMappings(draftStatusMappings) !==
      serializeStatusMappings(savedStatusMappings)
  const missingMappedStatuses = integration
    ? TASK_STATUSES.filter((status) => {
        const mappedStateId = integration.statusMappings[status]
        return (
          !!mappedStateId &&
          !workflowStates.some((state) => state.id === mappedStateId)
        )
      })
    : []

  function updateDraftStatus(status: TaskStatus, value: string) {
    setDraftStatusMappings((current) => {
      const next = { ...current }
      if (value) {
        next[status] = value
      } else {
        delete next[status]
      }
      return next
    })
  }

  async function handlePreviewTeams() {
    if (!apiKey.trim()) {
      toast.error("Enter a Linear API key first.")
      return
    }

    setIsLoadingTeams(true)
    try {
      if (!currentWorkspace) {
        toast.error("No workspace selected.")
        return
      }
      const result = await previewLinearTeams({
        workspaceId: currentWorkspace._id,
        apiKey: apiKey.trim(),
      })
      setPreviewTeams(result.teams)
      setPreviewUser({
        name: result.viewer.name,
        email: result.viewer.email,
      })
      setSelectedTeamId(result.teams[0]?.id ?? "")
      toast.success(
        `Loaded ${result.teams.length} Linear team${result.teams.length === 1 ? "" : "s"}.`
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load Linear teams."
      )
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
      toast.error(
        error instanceof Error ? error.message : "Failed to connect Linear."
      )
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleSaveMappings() {
    if (!integration) {
      return
    }

    setIsSavingMappings(true)
    try {
      await updateLinearStatusMappings({
        workspaceId: workspace._id,
        statusMappings: draftStatusMappings,
      })
      toast.success(
        "Saved Linear status mappings. Run sync now to apply them to existing tasks."
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save Linear status mappings."
      )
    } finally {
      setIsSavingMappings(false)
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
      toast.error(
        error instanceof Error ? error.message : "Failed to sync Linear."
      )
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
      toast.error(
        error instanceof Error ? error.message : "Failed to disconnect Linear."
      )
    } finally {
      setIsDisconnecting(false)
    }
  }

  if (integration) {
    return (
      <Stagger className="mx-auto w-full max-w-lg px-6 py-6 flex flex-col gap-3">
          <motion.div variants={fadeUp}>
            <h2 className="text-[15px] font-semibold tracking-tight">Linear</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Manage the Linear team synced to this workspace.
            </p>
          </motion.div>

          <motion.div variants={fadeUp} className="rounded-[8px] ring-1 ring-border bg-card">
            <div className="flex items-center gap-3 p-3.5">
              <div className="flex size-8 items-center justify-center rounded-[8px] bg-[#5E6AD2]/10">
                <LinearBrandMark size={20} />
              </div>
              <div className="flex-1">
                <h3 className="text-[14px] font-medium">{integration.teamName}</h3>
                <p className="text-[12px] text-muted-foreground">
                  {integration.teamKey
                    ? `${integration.teamKey} team`
                    : "Selected team"}{" "}
                  synced to {workspace.name}
                  {integration.linearUserEmail ? (
                    <span className="ml-1 text-muted-foreground/60">
                      &middot; {integration.linearUserEmail}
                    </span>
                  ) : null}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-600">
                <span className="size-1.5 bg-emerald-500" />
                Connected
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3.5 py-2">
              <p className="text-[12px] text-muted-foreground">
                Last synced {formatTimestamp(integration.lastSyncedAt)}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSyncNow}
                  disabled={isSyncing}
                >
                  <HugeiconsIcon
                    icon={RotateRight06Icon}
                    size={13}
                    strokeWidth={1.8}
                  />
                  {isSyncing ? "Syncing..." : "Sync now"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => setDisconnectOpen(true)}
                >
                  <HugeiconsIcon
                    icon={Unlink01Icon}
                    size={13}
                    strokeWidth={1.8}
                  />
                  Disconnect
                </Button>
              </div>
            </div>
          </motion.div>

          <motion.div variants={fadeUp} className="rounded-[8px] ring-1 ring-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-2.5">
              <h3 className="text-[14px] font-medium">Status mapping</h3>
              {hasMappingChanges && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveMappings}
                  disabled={isSavingMappings}
                >
                  <HugeiconsIcon
                    icon={CheckmarkBadge01Icon}
                    size={13}
                    strokeWidth={1.8}
                  />
                  {isSavingMappings ? "Saving..." : "Save"}
                </Button>
              )}
            </div>

            {isLoadingWorkflowStates ? (
              <div className="divide-y divide-border/50 py-1">
                {TASK_STATUSES.map((status) => (
                  <div key={status} className="flex items-center gap-3 px-3.5 py-2">
                    <div className="h-4 w-24 shrink-0 rounded-[8px] bg-muted/40" />
                    <div className="h-3 w-3 shrink-0 rounded-[8px] bg-muted/30" />
                    <div className="h-8 flex-1 rounded-[8px] bg-muted/30" />
                  </div>
                ))}
              </div>
            ) : workflowStates.length > 0 ? (
              <>
                <div className="divide-y divide-border/50 py-1">
                  {TASK_STATUSES.map((status) => (
                    <StatusMappingRow
                      key={status}
                      status={status}
                      value={draftStatusMappings[status]}
                      states={workflowStates}
                      disabled={isSavingMappings}
                      onChange={updateDraftStatus}
                    />
                  ))}
                </div>

                {missingMappedStatuses.length > 0 && (
                  <div className="border-t border-border bg-muted/30 px-3.5 py-2">
                    <p className="text-[12px] text-muted-foreground">
                      {missingMappedStatuses
                        .map((s) => TASK_STATUS_LABELS[s])
                        .join(", ")}{" "}
                      mapped to deleted Linear states — using automatic mapping
                      until updated.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="px-3.5 py-6 text-[13px] text-muted-foreground">
                No workflow states found for this team.
              </div>
            )}
          </motion.div>

        <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Disconnect Linear</DialogTitle>
              <DialogDescription>
                This will disconnect{" "}
                <span className="font-medium text-foreground">
                  {integration.teamName}
                </span>{" "}
                from{" "}
                <span className="font-medium text-foreground">
                  {workspace.name}
                </span>
                . Future syncing will stop but existing Median tasks will
                remain.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDisconnectOpen(false)}
                className="flex h-8 flex-1 items-center justify-center rounded-[8px] border border-border text-[14px] font-medium transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDisconnecting}
                onClick={handleDisconnect}
                className="text-destructive-foreground flex h-8 flex-1 items-center justify-center rounded-[8px] bg-destructive text-[14px] font-medium transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {isDisconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </Stagger>
    )
  }

  return (
    <Stagger className="mx-auto w-full max-w-lg px-6 py-6 flex flex-col gap-3">
        <motion.div variants={fadeUp}>
          <h2 className="text-[15px] font-semibold tracking-tight">Linear</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Connect a Linear team to this workspace and keep tasks synced in
            both directions.
          </p>
        </motion.div>

        <div className="rounded-[8px] ring-1 ring-border bg-card">
          <div className="flex items-center gap-3 p-3.5">
            <div className="flex size-8 items-center justify-center rounded-[8px] bg-[#5E6AD2]/10">
              <LinearBrandMark size={20} />
            </div>
            <div className="flex-1">
              <h3 className="text-[14px] font-medium">Not connected</h3>
              <p className="text-[12px] text-muted-foreground">
                Enter a Linear personal API key to get started.
              </p>
            </div>
          </div>

          <div className="space-y-4 border-t border-border p-3.5">
            <div>
              <label
                htmlFor="linear-api-key"
                className="mb-2 block text-[14px] font-medium"
              >
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
                  <HugeiconsIcon
                    icon={LaptopCheckIcon}
                    size={15}
                    strokeWidth={1.8}
                  />
                  {isLoadingTeams ? "Loading..." : "Load teams"}
                </Button>
              </div>
            </div>

            {previewTeams.length > 0 ? (
              <div>
                <label
                  htmlFor="linear-team"
                  className="mb-2 block text-[14px] font-medium"
                >
                  Team
                </label>
                <select
                  id="linear-team"
                  value={selectedTeamId}
                  onChange={(event) => setSelectedTeamId(event.target.value)}
                  className="h-9 w-full rounded-[8px] border border-border bg-background pl-3 pr-7 text-[14px] transition-colors outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
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
              <div className="flex items-center gap-3 border border-border bg-muted/30 px-3.5 py-2.5">
                <HugeiconsIcon
                  icon={User03Icon}
                  size={14}
                  strokeWidth={1.8}
                  className="text-muted-foreground"
                />
                <div className="text-[14px]">
                  <span className="text-foreground">
                    {previewUser.name ??
                      previewUser.email ??
                      "Authenticated user"}
                  </span>
                  {selectedTeam ? (
                    <span className="ml-1.5 text-muted-foreground">
                      &middot; {selectedTeam.name}
                      {selectedTeam.key ? ` (${selectedTeam.key})` : ""}
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

          <div className="flex items-center border-t border-border bg-muted/30 px-3.5 py-2">
            <p className="text-[12px] text-muted-foreground">
              API keys can be created at Linear &rarr; Settings &rarr; API
              &rarr; Personal API keys.
            </p>
          </div>
        </div>
    </Stagger>
  )
}
