"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
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
import { updateOptimisticQuery } from "@/lib/convex-optimistic"
import { hasWorkspaceAdminPermission } from "@/lib/workspace-permissions"
import {
  trackIntegrationConnected,
  trackIntegrationDisconnected,
  trackIntegrationSettingsChanged,
} from "@/lib/analytics"

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

function DiscordPairingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-lg px-6 py-6">
      <div className="mb-4 h-8 w-32 rounded-[4px] bg-muted/40" />
      <div className="flex flex-col gap-2">
        <div className="h-10 rounded-[4px] bg-muted/30" />
        <div className="h-20 rounded-[4px] bg-muted/20" />
      </div>
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
  const disconnectIntegration = useMutation(
    api.discord.disconnectWorkspaceDiscordIntegration
  ).withOptimisticUpdate((localStore, args) => {
    updateOptimisticQuery(
      localStore,
      api.discord.getWorkspaceDiscordIntegration,
      { workspaceId: args.workspaceId },
      (current) => ({
        ...current,
        integration: null,
      })
    )
  })
  const updateSettings = useMutation(
    api.discord.updateDiscordIntegrationSettings
  ).withOptimisticUpdate((localStore, args) => {
    updateOptimisticQuery(
      localStore,
      api.discord.getWorkspaceDiscordIntegration,
      { workspaceId: args.workspaceId },
      (current) => {
        if (!current.integration) {
          return current
        }

        return {
          ...current,
          integration: {
            ...current.integration,
            additionalContext:
              args.additionalContext !== undefined
                ? args.additionalContext.trim()
                : current.integration.additionalContext,
            respondForMeMode:
              args.respondForMeMode ??
              (args.respondForMe !== undefined
                ? args.respondForMe
                  ? "all"
                  : "off"
                : current.integration.respondForMeMode),
            respondForMeChannelIds:
              args.respondForMeChannelIds ?? current.integration.respondForMeChannelIds,
          },
        }
      }
    )
  })

  // Settings state — synced from server, debounced writes
  const [additionalContext, setAdditionalContext] = useState("")
  const [respondForMeMode, setRespondForMeMode] = useState<"off" | "all" | "specific">("off")
  const [respondChannelIds, setRespondChannelIds] = useState<string[]>([])
  const [channelSearch, setChannelSearch] = useState("")
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
      trackIntegrationSettingsChanged({ platform: "discord", setting: "respond_mode" })
    } catch {
      setRespondForMeMode(previousMode)
      toast.error("Failed to update setting.")
    }
  }

  const guildChannels = integration?.guildChannels ?? []

  const filteredChannels = channelSearch
    ? guildChannels.filter((ch) =>
        ch.name.toLowerCase().includes(channelSearch.toLowerCase())
      )
    : guildChannels

  // Group channels by category
  const channelsByCategory = filteredChannels.reduce<
    Map<string, typeof filteredChannels>
  >((acc, ch) => {
    const key = ch.parentName ?? ""
    const group = acc.get(key) ?? []
    group.push(ch)
    acc.set(key, group)
    return acc
  }, new Map())

  function handleToggleChannel(channelId: string) {
    const isSelected = respondChannelIds.includes(channelId)
    const updated = isSelected
      ? respondChannelIds.filter((id) => id !== channelId)
      : [...respondChannelIds, channelId]
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
      <div className="mx-auto w-full max-w-lg px-6 py-6">
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
      trackIntegrationConnected({ platform: "discord" })
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
      trackIntegrationDisconnected({ platform: "discord" })
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
      <Stagger
        className="mx-auto w-full max-w-lg px-6 py-6"
      >
        <div className="flex flex-col gap-3">
          <motion.div variants={fadeUp}>
            <h2 className="text-[14px] font-semibold tracking-tight">Discord</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Manage the Discord server paired to this workspace.
            </p>
          </motion.div>

          {/* Connection status card */}
          <motion.div variants={fadeUp} className="rounded-[4px] ring-1 ring-border bg-card">
            <div className="flex items-center gap-3 p-3.5">
              <div className="flex size-8 items-center justify-center rounded-[4px] bg-[#5865F2]/10">
                <DiscordBrandIcon size={20} className="text-[#5865F2]" />
              </div>
              <div className="flex-1">
                <h3 className="text-[13px] font-medium">{integration.guildName}</h3>
                <p className="text-[11px] text-muted-foreground">
                  Paired {formatTimestamp(integration.pairedAt)}
                  {integration.channelId ? (
                    <span className="ml-1 text-muted-foreground/60">
                      &middot; Channel {integration.channelId}
                    </span>
                  ) : null}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                <span className="size-1.5 bg-emerald-500" />
                Connected
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3.5 py-2">
              <p className="text-[11px] text-muted-foreground">
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
          </motion.div>

          {/* Additional context */}
          <motion.div
            variants={fadeUp}
            className="rounded-[4px] ring-1 ring-border bg-card"
          >
            <div className="flex items-center gap-3 border-b border-border px-3.5 py-2.5">
              <HugeiconsIcon icon={TextIcon} size={15} strokeWidth={1.8} className="text-muted-foreground" />
              <div className="flex-1">
                <h3 className="text-[13px] font-medium">Additional context</h3>
                <p className="text-[11px] text-muted-foreground">
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
                className="resize-none text-[13px]"
              />
              <p className="mt-2 text-[11px] text-muted-foreground/60">
                This context is passed to the AI when scanning messages. Changes save automatically.
              </p>
            </div>
          </motion.div>

          {/* Respond for me */}
          <motion.div
            variants={fadeUp}
            className="rounded-[4px] ring-1 ring-border bg-card"
          >
            <div className="flex items-center gap-3 border-b border-border px-3.5 py-2.5">
              <HugeiconsIcon icon={SentIcon} size={15} strokeWidth={1.8} className="text-muted-foreground" />
              <div className="flex-1">
                <h3 className="text-[13px] font-medium">Respond for me</h3>
                <p className="text-[11px] text-muted-foreground">
                  Automatically reply in Discord when a request is received and when the change ships.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-0.5 px-3.5 py-3">
              {(["off", "all", "specific"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleRespondModeChange(mode)}
                  className="flex items-center gap-3 rounded-[4px] px-2 py-2 text-left text-[13px] transition-colors hover:bg-muted/50"
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
              <div
                className="border-t border-border"
              >
                {guildChannels.length === 0 ? (
                  <div className="px-3.5 py-3">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
                      <svg className="size-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                        <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      Syncing channels from Discord...
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {/* Filter input */}
                    {guildChannels.length > 8 ? (
                      <div className="px-3.5 pt-2.5 pb-1">
                        <Input
                          value={channelSearch}
                          onChange={(event) => setChannelSearch(event.target.value)}
                          placeholder="Filter channels..."
                          className="h-7 text-xs"
                        />
                      </div>
                    ) : null}

                    {/* Channel list */}
                    <div className="max-h-56 overflow-y-auto px-1.5 py-1.5">
                      {filteredChannels.length === 0 ? (
                        <p className="px-3 py-2 text-[11px] text-muted-foreground/50">
                          No channels match "{channelSearch}"
                        </p>
                      ) : (
                        Array.from(channelsByCategory.entries()).map(
                          ([category, channels]) => (
                            <div key={category || "__uncategorized"}>
                              {category ? (
                                <div className="mt-1.5 mb-0.5 px-2.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40 first:mt-0">
                                  {category}
                                </div>
                              ) : null}
                              {channels.map((ch) => {
                                const isSelected = respondChannelIds.includes(ch.id)
                                return (
                                  <button
                                    key={ch.id}
                                    type="button"
                                    onClick={() => handleToggleChannel(ch.id)}
                                    className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-muted/50"
                                  >
                                    <span
                                      className={`flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
                                        isSelected
                                          ? "border-foreground bg-foreground"
                                          : "border-muted-foreground/30"
                                      }`}
                                    >
                                      {isSelected ? (
                                        <svg
                                          width="10"
                                          height="10"
                                          viewBox="0 0 10 10"
                                          fill="none"
                                          className="text-background"
                                        >
                                          <path
                                            d="M2.5 5L4.5 7L7.5 3"
                                            stroke="currentColor"
                                            strokeWidth="1.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                          />
                                        </svg>
                                      ) : null}
                                    </span>
                                    <span className="text-muted-foreground/50">#</span>
                                    <span
                                      className={
                                        isSelected
                                          ? "text-foreground"
                                          : "text-muted-foreground"
                                      }
                                    >
                                      {ch.name}
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                          )
                        )
                      )}
                    </div>

                    {/* Selected count footer */}
                    {respondChannelIds.length > 0 ? (
                      <div className="border-t border-border px-3.5 py-1.5">
                        <p className="text-[11px] text-muted-foreground/60">
                          {respondChannelIds.length} channel{respondChannelIds.length !== 1 ? "s" : ""} selected
                        </p>
                      </div>
                    ) : (
                      <div className="border-t border-border px-3.5 py-1.5">
                        <p className="text-[11px] text-muted-foreground/60">
                          Select the channels where Median should auto-reply.
                        </p>
                      </div>
                    )}
                  </div>
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
                className="flex h-8 flex-1 items-center justify-center rounded-[4px] border border-border text-[13px] font-medium transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDisconnecting}
                onClick={handleDisconnect}
                className="flex h-8 flex-1 items-center justify-center rounded-[4px] bg-destructive text-[13px] font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {isDisconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </Stagger>
    )
  }

  /* ── Disconnected state: pairing form + how it works ── */
  return (
    <Stagger
      className="mx-auto w-full max-w-lg px-6 py-6"
    >
      <div className="flex flex-col gap-3">
        <motion.div variants={fadeUp}>
          <h2 className="text-[14px] font-semibold tracking-tight">Discord</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Pair a Discord server to this workspace with a one-time code.
          </p>
        </motion.div>

        {/* Connection card with pairing form */}
        <motion.div variants={fadeUp} className="rounded-[4px] ring-1 ring-border bg-card">
          <div className="flex items-center gap-3 p-3.5">
            <div className="flex size-8 items-center justify-center rounded-[4px] bg-[#5865F2]/10">
              <DiscordBrandIcon size={20} className="text-[#5865F2]" />
            </div>
            <div className="flex-1">
              <h3 className="text-[13px] font-medium">Not connected</h3>
              <p className="text-[11px] text-muted-foreground">
                Run <span className="font-medium text-foreground">/pair</span> in Discord and paste the code below.
              </p>
            </div>
          </div>

          <form onSubmit={handlePairWorkspace} className="border-t border-border p-3.5">
            <label htmlFor="pairing-code" className="mb-2 block text-[13px] font-medium">
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

          <div className="flex items-center border-t border-border bg-muted/30 px-3.5 py-2">
            <p className="text-[11px] text-muted-foreground">
              Codes expire after 10 minutes and can only be used once.
            </p>
          </div>
        </motion.div>

        {/* Invite bot */}
        <motion.div variants={fadeUp} className="flex items-center justify-between rounded-[4px] ring-1 ring-border bg-card px-3.5 py-3">
          <div>
            <p className="text-[13px] font-medium text-foreground">Don&apos;t have the bot yet?</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Add the Median bot to your Discord server to get started.
            </p>
          </div>
          <a
            href="https://discord.com/oauth2/authorize?client_id=1485985112427597975&permissions=4503894369577088&integration_type=0&scope=bot"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm">
              <DiscordBrandIcon size={14} />
              Invite bot
            </Button>
          </a>
        </motion.div>
      </div>
    </Stagger>
  )
}
