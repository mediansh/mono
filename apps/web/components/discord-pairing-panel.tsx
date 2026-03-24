"use client"

import { useState, type FormEvent } from "react"
import { useMutation, useQuery } from "convex/react"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  BotIcon,
  CheckmarkBadge02Icon,
  Clock01Icon,
  DiscordIcon,
  Key01Icon,
  Link01Icon,
  Unlink01Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
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

function DiscordPairingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl px-10 py-10">
      <div className="h-40 rounded-none border border-border bg-card/50" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="h-72 rounded-none border border-border bg-card/40" />
        <div className="h-72 rounded-none border border-border bg-card/30" />
      </div>
    </div>
  )
}

export function DiscordPairingPanel() {
  const { currentWorkspace } = useWorkspace()
  const [pairingCode, setPairingCode] = useState("")
  const [isPairing, setIsPairing] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  const integrationState = useQuery(
    api.discord.getWorkspaceDiscordIntegration,
    currentWorkspace ? { workspaceId: currentWorkspace._id } : "skip"
  )
  const redeemPairingCode = useMutation(api.discord.redeemPairingCode)
  const disconnectIntegration = useMutation(api.discord.disconnectWorkspaceDiscordIntegration)

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
  const integration = integrationState.integration

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
      toast.success("Discord server disconnected.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect Discord.")
    } finally {
      setIsDisconnecting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-10 py-10">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-none border border-border bg-card"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(88,101,242,0.24),transparent_42%),linear-gradient(135deg,rgba(88,101,242,0.12),transparent_55%)]" />
        <div className="relative flex flex-col gap-8 p-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 border border-white/10 bg-[#5865F2]/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-[#5865F2]">
                <HugeiconsIcon icon={BotIcon} size={16} strokeWidth={1.8} />
                Discord pairing
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                Connect a Discord server to this workspace with a one-time code.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                Run <span className="font-medium text-foreground">/pair</span> in your Discord
                server, then paste the code here to bind that server to{" "}
                <span className="font-medium text-foreground">{workspace.name}</span>.
              </p>
            </div>

            <div className="grid min-w-[220px] gap-3 text-sm">
              <div className="border border-border/70 bg-background/70 px-4 py-3 backdrop-blur">
                <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                  Workspace
                </div>
                <div className="mt-1 font-medium">{workspace.name}</div>
              </div>
              <div className="border border-border/70 bg-background/70 px-4 py-3 backdrop-blur">
                <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                  Status
                </div>
                <div className="mt-1 flex items-center gap-2 font-medium">
                  <span
                    className={`size-2 ${integration ? "bg-emerald-500" : "bg-[#5865F2]"}`}
                  />
                  {integration ? `Paired to ${integration.guildName}` : "Waiting for code"}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="border border-border bg-background/90 p-6 backdrop-blur"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <HugeiconsIcon icon={DiscordIcon} size={18} strokeWidth={1.8} />
                    Pair a server
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    The code lasts 10 minutes and can only be redeemed once.
                  </p>
                </div>
                {integration ? (
                  <div className="border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-emerald-600">
                    Connected
                  </div>
                ) : null}
              </div>

              <form onSubmit={handlePairWorkspace} className="mt-8 space-y-4">
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    <HugeiconsIcon icon={Key01Icon} size={15} strokeWidth={1.8} />
                    Pairing code
                  </span>
                  <Input
                    value={pairingCode}
                    onChange={(event) => setPairingCode(event.target.value.toUpperCase())}
                    placeholder="PASTE THE CODE FROM /PAIR"
                    className="h-12 border-border bg-card px-4 font-mono text-base tracking-[0.24em] uppercase"
                  />
                </label>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    type="submit"
                    disabled={isPairing}
                    className="h-11 bg-[#5865F2] px-5 text-sm text-white hover:bg-[#5865F2]/90"
                  >
                    <HugeiconsIcon icon={Link01Icon} size={17} strokeWidth={1.8} />
                    {isPairing ? "Pairing..." : "Pair server"}
                  </Button>
                  {integration ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isDisconnecting}
                      onClick={handleDisconnect}
                      className="h-11 px-5"
                    >
                      <HugeiconsIcon icon={Unlink01Icon} size={17} strokeWidth={1.8} />
                      {isDisconnecting ? "Disconnecting..." : "Disconnect current server"}
                    </Button>
                  ) : null}
                </div>
              </form>

              <div className="mt-8 grid gap-3 border-t border-border pt-5 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <HugeiconsIcon icon={BotIcon} size={17} strokeWidth={1.8} className="mt-0.5" />
                  <span>Add the Median bot to the Discord server you want to connect.</span>
                </div>
                <div className="flex items-start gap-3">
                  <HugeiconsIcon icon={Clock01Icon} size={17} strokeWidth={1.8} className="mt-0.5" />
                  <span>Run `/pair` in that server and copy the one-time code.</span>
                </div>
                <div className="flex items-start gap-3">
                  <HugeiconsIcon icon={CheckmarkBadge02Icon} size={17} strokeWidth={1.8} className="mt-0.5" />
                  <span>Paste it here to bind this workspace and that Discord server together.</span>
                </div>
              </div>
            </motion.div>

            <motion.aside
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-4"
            >
              <div className="border border-border bg-background p-6">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <HugeiconsIcon icon={DiscordIcon} size={18} strokeWidth={1.8} />
                  Live pairing state
                </div>

                {integration ? (
                  <div className="mt-5 space-y-4">
                    <div className="border border-border bg-card px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                        Server
                      </div>
                      <div className="mt-1 text-sm font-medium">{integration.guildName}</div>
                    </div>
                    <div className="border border-border bg-card px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                        Guild ID
                      </div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        {integration.guildId}
                      </div>
                    </div>
                    <div className="border border-border bg-card px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                        Paired at
                      </div>
                      <div className="mt-1 text-sm">{formatTimestamp(integration.pairedAt)}</div>
                    </div>
                    {integration.channelId ? (
                      <div className="border border-border bg-card px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                          Origin channel
                        </div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">
                          {integration.channelId}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-5 border border-dashed border-border bg-card/60 p-5 text-sm text-muted-foreground">
                    No Discord server is paired yet. Generate a code in Discord to start the link.
                  </div>
                )}
              </div>

              <div className="border border-border bg-card p-6">
                <div className="text-sm font-medium">What this enables</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  This pairing gives Median a stable workspace-to-server mapping, so Discord
                  automations can target the right workspace instead of relying on manual setup.
                </p>
              </div>
            </motion.aside>
          </div>
        </div>
      </motion.section>
    </div>
  )
}
