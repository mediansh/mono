"use client"

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  InformationCircleIcon,
  Link01Icon,
  TextIcon,
  Unlink01Icon,
} from "@hugeicons/core-free-icons"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
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

function XBrandIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
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

function XIntegrationSkeleton() {
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

export function XIntegrationPanel() {
  const { currentWorkspace } = useWorkspace()
  const { replace } = useInstantNavigation()
  const searchParams = useSearchParams()
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [additionalContext, setAdditionalContext] = useState("")
  const [settingsInitialized, setSettingsInitialized] = useState(false)
  const contextSaveTimer = useRef<NodeJS.Timeout | null>(null)

  const integrationState = useQuery(
    api.x.getWorkspaceXIntegration,
    currentWorkspace ? { workspaceId: currentWorkspace._id } : "skip"
  )
  const beginConnect = useAction(api.x.beginWorkspaceXConnect)
  const disconnectIntegration = useAction(api.x.disconnectWorkspaceXIntegration)
  const updateSettings = useMutation(api.x.updateXIntegrationSettings).withOptimisticUpdate(
    (localStore, args) => {
      updateOptimisticQuery(
        localStore,
        api.x.getWorkspaceXIntegration,
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
            },
          }
        }
      )
    }
  )

  const integration = integrationState?.integration ?? null
  const workspaceId = currentWorkspace?._id ?? null

  useEffect(() => {
    if (integration && !settingsInitialized) {
      setAdditionalContext(integration.additionalContext)
      setSettingsInitialized(true)
    }
    if (!integration && settingsInitialized) {
      setAdditionalContext("")
      setSettingsInitialized(false)
    }
  }, [integration, settingsInitialized])

  useEffect(() => {
    const status = searchParams.get("x_status")
    const message = searchParams.get("x_message")
    if (!status) return

    if (status === "connected") {
      toast.success(message ?? "X account connected.")
    } else {
      toast.error(message ?? "Failed to connect X.")
    }

    replace("/app/integrations/x")
  }, [replace, searchParams])

  if (!currentWorkspace) return null
  if (!hasWorkspaceAdminPermission(currentWorkspace.role)) {
    return (
      <div className="mx-auto w-full max-w-lg px-6 py-6">
        <SettingsAccessState />
      </div>
    )
  }
  if (integrationState === undefined) {
    return <XIntegrationSkeleton />
  }

  function saveContext(value: string) {
    if (!workspaceId) return
    if (contextSaveTimer.current) clearTimeout(contextSaveTimer.current)
    contextSaveTimer.current = setTimeout(() => {
      void updateSettings({
        workspaceId,
        additionalContext: value,
      })
    }, 800)
  }

  function handleContextChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value
    setAdditionalContext(value)
    saveContext(value)
  }

  async function handleConnect() {
    if (!workspaceId) return
    setIsConnecting(true)
    try {
      const redirectUrl = typeof window !== "undefined"
        ? `${window.location.origin}/app/integrations/x`
        : "/app/integrations/x"
      const result = await beginConnect({
        workspaceId,
        redirectUrl,
      })
      window.location.assign(result.authorizeUrl)
    } catch (error) {
      setIsConnecting(false)
      toast.error(error instanceof Error ? error.message : "Failed to start the X connection.")
    }
  }

  async function handleDisconnect() {
    if (!workspaceId) return
    setIsDisconnecting(true)
    try {
      await disconnectIntegration({ workspaceId })
      setDisconnectOpen(false)
      toast.success("X account disconnected.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect X.")
    } finally {
      setIsDisconnecting(false)
    }
  }

  const workspace = currentWorkspace

  if (integration) {
    return (
      <Stagger className="mx-auto w-full max-w-lg px-6 py-6">
        <div className="flex flex-col gap-3">
          <motion.div variants={fadeUp}>
            <h2 className="text-[14px] font-semibold tracking-tight">X (Twitter)</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Manage the X account connected to this workspace.
            </p>
          </motion.div>

          <motion.div variants={fadeUp} className="rounded-[4px] ring-1 ring-border bg-card">
            <div className="flex items-center gap-3 p-3.5">
              <div className="flex size-8 items-center justify-center overflow-hidden rounded-[4px] bg-foreground/5">
                {integration.profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={integration.profileImageUrl}
                    alt={integration.username}
                    className="size-full object-cover"
                  />
                ) : (
                  <XBrandIcon size={20} className="text-foreground" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-[13px] font-medium">
                  {integration.name ?? `@${integration.username}`}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  @{integration.username} connected {formatTimestamp(integration.connectedAt)}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                <span className="size-1.5 bg-emerald-500" />
                Connected
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3.5 py-2">
              <p className="text-[11px] text-muted-foreground">
                Median is watching mentions and replies for {workspace.name}.
              </p>
              <Button type="button" variant="destructive" size="sm" onClick={() => setDisconnectOpen(true)}>
                <HugeiconsIcon icon={Unlink01Icon} size={13} strokeWidth={1.8} />
                Disconnect
              </Button>
            </div>
          </motion.div>

          <motion.div variants={fadeUp} className="rounded-[4px] ring-1 ring-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-3.5 py-2.5">
              <HugeiconsIcon icon={TextIcon} size={15} strokeWidth={1.8} className="text-muted-foreground" />
              <div className="flex-1">
                <h3 className="text-[13px] font-medium">Additional context</h3>
                <p className="text-[11px] text-muted-foreground">
                  Describe your product so the AI can better interpret incoming X feedback.
                </p>
              </div>
            </div>
            <div className="p-5">
              <Textarea
                value={additionalContext}
                onChange={handleContextChange}
                placeholder="e.g. Median is a project management tool for small teams. Common feedback themes include task management workflows, collaboration handoffs, and integration pain points..."
                rows={4}
                className="resize-none text-[13px]"
              />
              <p className="mt-2 text-[11px] text-muted-foreground/60">
                This context is used when Median classifies mentions and replies into request tasks. Changes save automatically.
              </p>
            </div>
          </motion.div>
        </div>

        <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Disconnect X</DialogTitle>
              <DialogDescription>
                This will stop routing mentions and replies from{" "}
                <span className="font-medium text-foreground">@{integration.username}</span> into{" "}
                <span className="font-medium text-foreground">{workspace.name}</span>.
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

  return (
    <Stagger className="mx-auto w-full max-w-lg px-6 py-6">
      <div className="flex flex-col gap-3">
        <motion.div variants={fadeUp}>
          <h2 className="text-[14px] font-semibold tracking-tight">X (Twitter)</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Connect an X account and turn mentions or replies into request tasks automatically.
          </p>
        </motion.div>

        <motion.div variants={fadeUp} className="rounded-[4px] ring-1 ring-border bg-card">
          <div className="flex items-center gap-3 p-3.5">
            <div className="flex size-8 items-center justify-center rounded-[4px] bg-foreground/5">
              <XBrandIcon size={20} className="text-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="text-[13px] font-medium">Not connected</h3>
              <p className="text-[11px] text-muted-foreground">
                Authorize an X account to start collecting feedback for this workspace.
              </p>
            </div>
            <Button type="button" onClick={handleConnect} disabled={isConnecting}>
              <HugeiconsIcon icon={Link01Icon} size={15} strokeWidth={1.8} />
              {isConnecting ? "Redirecting..." : "Connect"}
            </Button>
          </div>

          <div className="border-t border-border bg-muted/30 px-3.5 py-2">
            <p className="text-[11px] text-muted-foreground">
              Median will subscribe to inbound mentions and replies on the connected account.
            </p>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="flex items-start gap-3 rounded-[4px] ring-1 ring-border bg-card px-3.5 py-3">
          <HugeiconsIcon icon={InformationCircleIcon} size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[13px] font-medium text-foreground">Use your brand account</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              When authorizing, sign in with your company or product account on X &mdash; not a personal one.
              Median monitors mentions and replies directed at the connected account, so it should be the
              account your customers interact with.
            </p>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="rounded-[4px] ring-1 ring-border ring-dashed p-3.5">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <HugeiconsIcon icon={InformationCircleIcon} size={14} strokeWidth={1.8} />
            How it works
          </div>
          <div className="grid gap-2.5 text-[12px] text-muted-foreground">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-[10px] font-semibold text-muted-foreground/60">1</span>
              <span>Authorize the X account you want Median to monitor.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-[10px] font-semibold text-muted-foreground/60">2</span>
              <span>Median stores inbound mentions and replies through the X webhook.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-[10px] font-semibold text-muted-foreground/60">3</span>
              <span>The AI classifies those posts the same way Discord feedback becomes request tasks.</span>
            </div>
          </div>
        </motion.div>
      </div>
    </Stagger>
  )
}
