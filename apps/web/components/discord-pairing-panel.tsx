"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { useMutation, useQuery } from "convex/react"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  InformationCircleIcon,
  Link01Icon,
  Unlink01Icon,
  SentIcon,
  TextIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"
import { SettingsAccessState } from "@/components/settings-access-state"
import { hasWorkspaceAdminPermission } from "@/lib/workspace-permissions"

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp)
}

function DiscordBrandIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
    </svg>
  )
}

function DiscordPairingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl px-10 py-10">
      <div className="mb-8 h-12 bg-muted/30" />
      <div className="h-36 border border-border bg-card/50" />
    </div>
  )
}

export function DiscordPairingPanel() {
  const { currentWorkspace } = useWorkspace()
  const [pairingCode, setPairingCode] = useState("")
  const [isPairing, setIsPairing] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)

  const integrationState = useQuery(
    api.discord.getWorkspaceDiscordIntegration,
    currentWorkspace ? { workspaceId: currentWorkspace._id } : "skip"
  )
  const redeemPairingCode = useMutation(api.discord.redeemPairingCode)
  const disconnectIntegration = useMutation(api.discord.disconnectWorkspaceDiscordIntegration)
  const updateSettings = useMutation(api.discord.updateDiscordIntegrationSettings)

  // Settings state — synced from server, debounced writes
  const [additionalContext, setAdditionalContext] = useState("")
  const [respondForMeMode, setRespondForMeMode] = useState<"off" | "all" | "specific">("off")
  const [respondChannelIds, setRespondChannelIds] = useState<string[]>([])
  const [channelIdInput, setChannelIdInput] = useState("")
  const [settingsInitialized, setSettingsInitialized] = useState(false)
  const contextSaveTimer = useRef<NodeJS.Timeout | null>(null)

  const integration = integrationState?.integration ?? null

  // Sync server state into local state on first load
  useEffect(() => {
    if (integration && !settingsInitialized) {
      setAdditionalContext(integration.additionalContext)
      setRespondForMeMode(integration.respondForMeMode)
      setRespondChannelIds(integration.respondForMeChannelIds)
      setSettingsInitialized(true)
    }
    if (!integration && settingsInitialized) {
      setSettingsInitialized(false)
    }
  }, [integration, settingsInitialized])

  const saveContext = useCallback(
    (value: string) => {
      if (!currentWorkspace) return
      if (contextSaveTimer.current) clearTimeout(contextSaveTimer.current)
      contextSaveTimer.current = setTimeout(() => {
        void updateSettings({
          workspaceId: currentWorkspace._id,
          additionalContext: value,
        })
      }, 800)
    },
    [currentWorkspace, updateSettings]
  )

  function handleContextChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value
    setAdditionalContext(value)
    saveContext(value)
  }

  async function handleRespondModeChange(mode: "off" | "all" | "specific") {
    const previousMode = respondForMeMode
    setRespondForMeMode(mode)
    if (!currentWorkspace) return
    try {
      await updateSettings({
        workspaceId: currentWorkspace._id,
        respondForMeMode: mode,
      })
    } catch {
      setRespondForMeMode(previousMode)
      toast.error("Failed to update setting.")
    }
  }

  function handleAddChannelId() {
    const id = channelIdInput.trim().replace(/\D/g, "")
    if (!id || respondChannelIds.includes(id)) {
      setChannelIdInput("")
      return
    }
    const updated = [...respondChannelIds, id]
    setRespondChannelIds(updated)
    setChannelIdInput("")
    if (!currentWorkspace) return
    void updateSettings({
      workspaceId: currentWorkspace._id,
      respondForMeChannelIds: updated,
    })
  }

  function handleRemoveChannelId(id: string) {
    const updated = respondChannelIds.filter((channelId) => channelId !== id)
    setRespondChannelIds(updated)
    if (!currentWorkspace) return
    void updateSettings({
      workspaceId: currentWorkspace._id,
      respondForMeChannelIds: updated,
    })
  }

  if (!currentWorkspace) return null
  if (!hasWorkspaceAdminPermission(currentWorkspace.role)) {
    return (
      <div className="mx-auto w-full max-w-2xl px-10 py-10">
        <SettingsAccessState />
      </div>
    )
  }
  if (integrationState === undefined) {
    return <DiscordPairingSkeleton />
  }

  const workspace = currentWorkspace

  async function handlePairWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!pairingCode.trim()) {
      toast.error("Enter the pairing code from Discord.")
      return
    }

    setIsPairing(true)
    try {
      const result = await redeemPairingCode({
        workspaceId: workspace._id,
        code: pairingCode,
      })
      setPairingCode("")
      toast.success(`${result.guildName} is now paired to ${workspace.name}.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to pair Discord server.")
    } finally {
      setIsPairing(false)
    }
  }

  async function handleDisconnect() {
    setIsDisconnecting(true)
    try {
      await disconnectIntegration({ workspaceId: workspace._id })
      setDisconnectOpen(false)
      toast.success("Discord server disconnected.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect Discord.")
    } finally {
      setIsDisconnecting(false)
    }
  }

  /* ── Connected state: status card + settings + disconnect ── */
  if (integration) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto w-full max-w-2xl px-10 py-10"
      >
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Discord</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage the Discord server paired to this workspace.
            </p>
          </div>

          {/* Connection status card */}
          <div className="rounded-none border border-border bg-card">
            <div className="flex items-center gap-4 p-5">
              <div className="flex size-10 items-center justify-center rounded-none bg-[#5865F2]/10">
                <DiscordBrandIcon size={20} className="text-[#5865F2]" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium">{integration.guildName}</h3>
                <p className="text-xs text-muted-foreground">
                  Paired {formatTimestamp(integration.pairedAt)}
                  {integration.channelId ? (
                    <span className="ml-1 text-muted-foreground/60">
                      &middot; Channel {integration.channelId}
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
                Automations from this server are routed to {workspace.name}.
              </p>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setDisconnectOpen(true)}
              >
                <HugeiconsIcon icon={Unlink01Icon} size={13} strokeWidth={1.8} />
                Disconnect
              </Button>
            </div>
          </div>

          {/* Additional context */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-none border border-border bg-card"
          >
            <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
              <HugeiconsIcon icon={TextIcon} size={15} strokeWidth={1.8} className="text-muted-foreground" />
              <div className="flex-1">
                <h3 className="text-sm font-medium">Additional context</h3>
                <p className="text-xs text-muted-foreground">
                  Describe your product so the AI can better classify feedback.
                </p>
              </div>
            </div>
            <div className="p-5">
              <Textarea
                value={additionalContext}
                onChange={handleContextChange}
                placeholder="e.g. Median is a project management tool for small teams. Key features include task boards, Discord integration, and AI-powered feedback triage..."
                rows={4}
                className="resize-none text-sm"
              />
              <p className="mt-2 text-[11px] text-muted-foreground/60">
                This context is passed to the AI when scanning messages. Changes save automatically.
              </p>
            </div>
          </motion.div>

          {/* Respond for me */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-none border border-border bg-card"
          >
            <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
              <HugeiconsIcon icon={SentIcon} size={15} strokeWidth={1.8} className="text-muted-foreground" />
              <div className="flex-1">
                <h3 className="text-sm font-medium">Respond for me</h3>
                <p className="text-xs text-muted-foreground">
                  Automatically reply in Discord when a request is received and when the change ships.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-0.5 px-5 py-3">
              {(["off", "all", "specific"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleRespondModeChange(mode)}
                  className="flex items-center gap-3 rounded-none px-2 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                      respondForMeMode === mode
                        ? "border-foreground bg-foreground"
                        : "border-muted-foreground/40"
                    }`}
                  >
                    {respondForMeMode === mode ? (
                      <span className="size-1.5 rounded-full bg-background" />
                    ) : null}
                  </span>
                  <span className={respondForMeMode === mode ? "text-foreground" : "text-muted-foreground"}>
                    {mode === "off" && "Off"}
                    {mode === "all" && "All channels"}
                    {mode === "specific" && "Specific channels only"}
                  </span>
                </button>
              ))}
            </div>

            {respondForMeMode === "specific" ? (
              <div className="border-t border-border px-5 py-3">
                <div className="flex gap-2">
                  <Input
                    value={channelIdInput}
                    onChange={(event) => setChannelIdInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        handleAddChannelId()
                      }
                    }}
                    placeholder="Paste a channel ID"
                    className="h-8 flex-1 font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddChannelId}
                    disabled={!channelIdInput.trim()}
                    className="h-8"
                  >
                    Add
                  </Button>
                </div>

                {respondChannelIds.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {respondChannelIds.map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1.5 border border-border bg-muted/50 px-2 py-0.5 font-mono text-xs text-muted-foreground"
                      >
                        {id}
                        <button
                          type="button"
                          onClick={() => handleRemoveChannelId(id)}
                          className="text-muted-foreground/60 transition-colors hover:text-foreground"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-muted-foreground/60">
                    Right-click a channel in Discord and select "Copy Channel ID" to get the ID.
                  </p>
                )}
              </div>
            ) : null}
          </motion.div>
        </div>

        <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Disconnect Discord</DialogTitle>
              <DialogDescription>
                This will unpair{" "}
                <span className="font-medium text-foreground">{integration.guildName}</span>{" "}
                from{" "}
                <span className="font-medium text-foreground">{workspace.name}</span>.
                Discord automations will stop routing to this workspace.
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
      </motion.div>
    )
  }

  /* ── Disconnected state: pairing form + how it works ── */
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto w-full max-w-2xl px-10 py-10"
    >
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Discord</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pair a Discord server to this workspace with a one-time code.
          </p>
        </div>

        {/* Connection card with pairing form */}
        <div className="rounded-none border border-border bg-card">
          <div className="flex items-center gap-4 p-5">
            <div className="flex size-10 items-center justify-center rounded-none bg-[#5865F2]/10">
              <DiscordBrandIcon size={20} className="text-[#5865F2]" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium">Not connected</h3>
              <p className="text-xs text-muted-foreground">
                Run <span className="font-medium text-foreground">/pair</span> in Discord and paste the code below.
              </p>
            </div>
          </div>

          <form onSubmit={handlePairWorkspace} className="border-t border-border p-5">
            <label htmlFor="pairing-code" className="mb-2 block text-sm font-medium">
              Pairing code
            </label>
            <div className="flex gap-2">
              <Input
                id="pairing-code"
                value={pairingCode}
                onChange={(event) => setPairingCode(event.target.value.toUpperCase())}
                placeholder="PASTE CODE FROM /PAIR"
                className="h-9 flex-1 font-mono tracking-[0.12em] uppercase"
              />
              <Button
                type="submit"
                disabled={isPairing}
                className="h-9 bg-[#5865F2] px-4 text-white hover:bg-[#5865F2]/90"
              >
                <HugeiconsIcon icon={Link01Icon} size={15} strokeWidth={1.8} />
                {isPairing ? "Pairing..." : "Pair"}
              </Button>
            </div>
          </form>

          <div className="flex items-center border-t border-border bg-muted/30 px-5 py-3">
            <p className="text-xs text-muted-foreground">
              Codes expire after 10 minutes and can only be used once.
            </p>
          </div>
        </div>

        {/* How it works — only when not connected */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-none border border-dashed border-border p-5"
        >
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <HugeiconsIcon icon={InformationCircleIcon} size={14} strokeWidth={1.8} />
            How it works
          </div>
          <div className="grid gap-2.5 text-sm text-muted-foreground">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-[10px] font-semibold text-muted-foreground/60">1</span>
              <span>Add the Median bot to your Discord server.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-[10px] font-semibold text-muted-foreground/60">2</span>
              <span>Run <span className="font-medium text-foreground">/pair</span> and copy the one-time code.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-[10px] font-semibold text-muted-foreground/60">3</span>
              <span>Paste it above to bind {workspace.name} to that server.</span>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
