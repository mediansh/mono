"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useMutation, useQuery } from "convex/react"
import { motion } from "motion/react"
import {
  Info,
  LinkBreak,
  LinkSimple,
  PaperPlaneTilt,
  TextT,
} from "@phosphor-icons/react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
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
import { LoadingState } from "@/components/loading-state"
import { updateOptimisticQuery } from "@/lib/convex-optimistic"
import { hasWorkspaceAdminPermission } from "@/lib/workspace-permissions"
import {
  ChannelMultiSelect,
  type IntegrationChannelOption,
} from "@/components/channel-multi-select"
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

function SlackBrandIcon({
  size = 20,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
    >
      <path
        fill="#E01E5A"
        d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"
      />
      <path
        fill="#36C5F0"
        d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"
      />
      <path
        fill="#2EB67D"
        d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"
      />
      <path
        fill="#ECB22E"
        d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"
      />
    </svg>
  )
}

function Stagger({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
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
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const },
  },
}

function SlackIntegrationSkeleton() {
  return <LoadingState className="h-[60vh]" />
}

export function SlackIntegrationPanel() {
  const { currentWorkspace } = useWorkspace()
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)

  const integrationState = useQuery(
    api.slack.getWorkspaceSlackIntegration,
    currentWorkspace ? { workspaceId: currentWorkspace._id } : "skip"
  )
  const initiateOAuth = useMutation(api.slack.initiateSlackOAuth)
  const disconnectIntegration = useMutation(
    api.slack.disconnectWorkspaceSlackIntegration
  ).withOptimisticUpdate((localStore, args) => {
    updateOptimisticQuery(
      localStore,
      api.slack.getWorkspaceSlackIntegration,
      { workspaceId: args.workspaceId },
      (current) => ({
        ...current,
        integration: null,
      })
    )
  })
  const updateSettings = useMutation(
    api.slack.updateSlackIntegrationSettings
  ).withOptimisticUpdate((localStore, args) => {
    updateOptimisticQuery(
      localStore,
      api.slack.getWorkspaceSlackIntegration,
      { workspaceId: args.workspaceId },
      (current) => {
        if (!current.integration) return current
        return {
          ...current,
          integration: {
            ...current.integration,
            additionalContext:
              args.additionalContext !== undefined
                ? args.additionalContext.trim()
                : current.integration.additionalContext,
            feedbackCollectionEnabled:
              args.feedbackCollectionEnabled !== undefined
                ? args.feedbackCollectionEnabled
                : current.integration.feedbackCollectionEnabled,
            feedbackChannelId:
              args.feedbackChannelId !== undefined
                ? args.feedbackChannelId
                : current.integration.feedbackChannelId,
            notificationChannelId:
              args.notificationChannelId !== undefined
                ? args.notificationChannelId
                : current.integration.notificationChannelId,
            respondForMeMode:
              args.respondForMeMode ??
              (args.respondForMe !== undefined
                ? args.respondForMe
                  ? "all"
                  : "off"
                : current.integration.respondForMeMode),
            respondForMeChannelIds:
              args.respondForMeChannelIds ??
              current.integration.respondForMeChannelIds,
            feedbackIgnoredChannelIds:
              args.feedbackIgnoredChannelIds ??
              current.integration.feedbackIgnoredChannelIds,
          },
        }
      }
    )
  })

  // Settings state
  const [additionalContext, setAdditionalContext] = useState("")
  const [feedbackCollectionEnabled, setFeedbackCollectionEnabled] =
    useState(false)
  const [feedbackChannelId, setFeedbackChannelId] = useState("")
  const [notificationChannelId, setNotificationChannelId] = useState("")
  const [respondForMeMode, setRespondForMeMode] = useState<
    "off" | "all" | "specific"
  >("off")
  const [respondChannelIds, setRespondChannelIds] = useState<string[]>([])
  const [feedbackIgnoredChannelIds, setFeedbackIgnoredChannelIds] = useState<string[]>([])
  const [settingsInitialized, setSettingsInitialized] = useState(false)
  const contextSaveTimer = useRef<NodeJS.Timeout | null>(null)

  const integration = integrationState?.integration ?? null

  // Handle OAuth callback status from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const slackStatus = params.get("slack_status")
    const slackMessage = params.get("slack_message")
    if (slackStatus && slackMessage) {
      if (slackStatus === "success") {
        toast.success(slackMessage)
        trackIntegrationConnected({ platform: "slack" })
      } else {
        toast.error(slackMessage)
      }
      // Clean URL
      const url = new URL(window.location.href)
      url.searchParams.delete("slack_status")
      url.searchParams.delete("slack_message")
      window.history.replaceState({}, "", url.toString())
    }
  }, [])

  // Sync server state into local state on first load
  useEffect(() => {
    if (integration && !settingsInitialized) {
      setAdditionalContext(integration.additionalContext)
      setFeedbackCollectionEnabled(integration.feedbackCollectionEnabled)
      setFeedbackChannelId(integration.feedbackChannelId ?? "")
      setNotificationChannelId(integration.notificationChannelId ?? "")
      setRespondForMeMode(integration.respondForMeMode)
      setRespondChannelIds(integration.respondForMeChannelIds)
      setFeedbackIgnoredChannelIds(integration.feedbackIgnoredChannelIds)
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
      trackIntegrationSettingsChanged({
        platform: "slack",
        setting: "respond_mode",
      })
    } catch {
      setRespondForMeMode(previousMode)
      toast.error("Failed to update setting.")
    }
  }

  async function handleFeedbackCollectionToggle(enabled: boolean) {
    const previous = feedbackCollectionEnabled
    setFeedbackCollectionEnabled(enabled)
    if (!currentWorkspace) return
    try {
      await updateSettings({
        workspaceId: currentWorkspace._id,
        feedbackCollectionEnabled: enabled,
      })
      trackIntegrationSettingsChanged({
        platform: "slack",
        setting: "feedback_collection",
      })
    } catch {
      setFeedbackCollectionEnabled(previous)
      toast.error("Failed to update setting.")
    }
  }

  async function handleFeedbackChannelChange(channelId: string) {
    setFeedbackChannelId(channelId)
    if (!currentWorkspace) return
    void updateSettings({
      workspaceId: currentWorkspace._id,
      feedbackChannelId: channelId,
    })
  }

  async function handleNotificationChannelChange(channelId: string) {
    setNotificationChannelId(channelId)
    if (!currentWorkspace) return
    void updateSettings({
      workspaceId: currentWorkspace._id,
      notificationChannelId: channelId,
    })
  }

  const teamChannels: IntegrationChannelOption[] = integration?.teamChannels ?? []

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

  function handleToggleIgnoredChannel(channelId: string) {
    const isSelected = feedbackIgnoredChannelIds.includes(channelId)
    const updated = isSelected
      ? feedbackIgnoredChannelIds.filter((id) => id !== channelId)
      : [...feedbackIgnoredChannelIds, channelId]
    setFeedbackIgnoredChannelIds(updated)
    if (!currentWorkspace) return
    void updateSettings({
      workspaceId: currentWorkspace._id,
      feedbackIgnoredChannelIds: updated,
    })
    trackIntegrationSettingsChanged({
      platform: "slack",
      setting: "ignored_channels",
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
    return <SlackIntegrationSkeleton />
  }

  const workspace = currentWorkspace

  async function handleConnect() {
    setIsConnecting(true)
    try {
      const result = await initiateOAuth({
        workspaceId: workspace._id,
        redirectUrl: window.location.href.split("?")[0]!,
      })
      window.location.href = result.authorizeUrl
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to start Slack authorization."
      )
      setIsConnecting(false)
    }
  }

  async function handleDisconnect() {
    setIsDisconnecting(true)
    try {
      await disconnectIntegration({ workspaceId: workspace._id })
      setDisconnectOpen(false)
      trackIntegrationDisconnected({ platform: "slack" })
      toast.success("Slack workspace disconnected.")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to disconnect Slack."
      )
    } finally {
      setIsDisconnecting(false)
    }
  }

  /* ── Connected state ── */
  if (integration) {
    return (
      <div className="h-full overflow-y-auto">
        <Stagger className="mx-auto w-full max-w-lg px-6 py-6">
          <div className="flex flex-col gap-3">
            <motion.div variants={fadeUp}>
              <h2 className="text-[15px] font-semibold tracking-tight">
                Slack
              </h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Manage the Slack workspace connected to this workspace.
              </p>
            </motion.div>

            {/* Connection status card */}
            <motion.div
              variants={fadeUp}
              className="rounded-[8px] gradient-border gradient-border-to-tl gradient-border-from-neutral-700 gradient-border-via-neutral-800 gradient-border-to-neutral-600 bg-card ring-1 ring-border"
            >
              <div className="flex items-center gap-3 p-3.5">
                <div className="flex size-8 items-center justify-center rounded-[8px] bg-muted ring-1 ring-border">
                  <SlackBrandIcon size={18} />
                </div>
                <div className="flex-1">
                  <h3 className="text-[14px] font-medium">
                    {integration.teamName}
                  </h3>
                  <p className="text-[12px] text-muted-foreground">
                    Connected {formatTimestamp(integration.connectedAt)}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-600">
                  <span className="size-1.5 bg-emerald-500" />
                  Connected
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3.5 py-2">
                <p className="text-[12px] text-muted-foreground">
                  Automations from this Slack workspace are routed to{" "}
                  {workspace.name}.
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setDisconnectOpen(true)}
                >
                  <LinkBreak size={13} />
                  Disconnect
                </Button>
              </div>
            </motion.div>

            {/* Feature request notifications */}
            <motion.div
              variants={fadeUp}
              className="rounded-[8px] gradient-border gradient-border-to-tl gradient-border-from-neutral-700 gradient-border-via-neutral-800 gradient-border-to-neutral-600 bg-card ring-1 ring-border"
            >
              <div className="flex items-center gap-3 border-b border-border px-3.5 py-2.5">
                <PaperPlaneTilt size={15} className="text-muted-foreground" />
                <div className="flex-1">
                  <h3 className="text-[14px] font-medium">
                    Feature request notifications
                  </h3>
                  <p className="text-[12px] text-muted-foreground">
                    Send new feature requests to a Slack channel with
                    accept/deny buttons.
                  </p>
                </div>
              </div>
              <div className="p-3.5">
                <label className="mb-1.5 block text-[13px] font-medium">
                  Notification channel
                </label>
                {teamChannels.length === 0 ? (
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground/60">
                    <svg
                      className="size-3.5 animate-spin"
                      viewBox="0 0 16 16"
                      fill="none"
                    >
                      <circle
                        cx="8"
                        cy="8"
                        r="6"
                        stroke="currentColor"
                        strokeWidth="2"
                        opacity="0.25"
                      />
                      <path
                        d="M14 8a6 6 0 0 0-6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    Syncing channels from Slack...
                  </div>
                ) : (
                  <select
                    value={notificationChannelId}
                    onChange={(e) =>
                      handleNotificationChannelChange(e.target.value)
                    }
                    className="h-8 w-full rounded-[8px] border border-border bg-background px-2 text-[13px] text-foreground"
                  >
                    <option value="">Disabled — no notifications</option>
                    {teamChannels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        #{ch.name}
                      </option>
                    ))}
                  </select>
                )}
                <p className="mt-1.5 text-[12px] text-muted-foreground/60">
                  When a new feature request arrives, a message with accept and
                  deny buttons will be posted here.
                </p>
              </div>
            </motion.div>

            {/* Feedback collection */}
            <motion.div
              variants={fadeUp}
              className="rounded-[8px] gradient-border gradient-border-to-tl gradient-border-from-neutral-700 gradient-border-via-neutral-800 gradient-border-to-neutral-600 bg-card ring-1 ring-border"
            >
              <div className="flex items-center gap-3 border-b border-border px-3.5 py-2.5">
                <Info size={15} className="text-muted-foreground" />
                <div className="flex-1">
                  <h3 className="text-[14px] font-medium">
                    Feedback collection
                  </h3>
                  <p className="text-[12px] text-muted-foreground">
                    Scan Slack messages for product feedback and automatically
                    create tasks.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleFeedbackCollectionToggle(!feedbackCollectionEnabled)
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                    feedbackCollectionEnabled
                      ? "bg-foreground"
                      : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`inline-block size-3.5 rounded-full bg-background transition-transform ${
                      feedbackCollectionEnabled
                        ? "translate-x-[18px]"
                        : "translate-x-[3px]"
                    }`}
                  />
                </button>
              </div>

              {feedbackCollectionEnabled ? (
                <div className="flex flex-col gap-3 p-3.5">
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium">
                      Feedback channel
                    </label>
                    {teamChannels.length === 0 ? (
                      <div className="flex items-center gap-2 text-[12px] text-muted-foreground/60">
                        <svg
                          className="size-3.5 animate-spin"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <circle
                            cx="8"
                            cy="8"
                            r="6"
                            stroke="currentColor"
                            strokeWidth="2"
                            opacity="0.25"
                          />
                          <path
                            d="M14 8a6 6 0 0 0-6-6"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                        Syncing channels from Slack...
                      </div>
                    ) : (
                      <select
                        value={feedbackChannelId}
                        onChange={(e) =>
                          handleFeedbackChannelChange(e.target.value)
                        }
                        className="h-8 w-full rounded-[8px] border border-border bg-background px-2 text-[13px] text-foreground"
                      >
                        <option value="">All channels</option>
                        {teamChannels.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            #{ch.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="mt-1 text-[12px] text-muted-foreground/60">
                      Limit feedback scanning to a specific channel, or scan all
                      channels.
                    </p>
                  </div>

                  <div className="rounded-[8px] border border-border">
                    <div className="flex items-center gap-3 border-b border-border px-3.5 py-2.5">
                      <Info size={15} className="text-muted-foreground" />
                      <div className="flex-1">
                        <h4 className="text-[14px] font-medium">
                          Ignored channels
                        </h4>
                        <p className="text-[12px] text-muted-foreground">
                          Skip feedback processing for selected Slack channels.
                        </p>
                      </div>
                    </div>
                    <ChannelMultiSelect
                      channels={teamChannels}
                      selectedChannelIds={feedbackIgnoredChannelIds}
                      onToggleChannel={handleToggleIgnoredChannel}
                      loadingLabel="Syncing channels from Slack..."
                      emptySelectionLabel="Select channels that Median should ignore during feedback processing."
                      selectedCountLabel={(count) =>
                        `${count} ignored channel${count !== 1 ? "s" : ""} selected`
                      }
                    />
                  </div>
                </div>
              ) : null}
            </motion.div>

            {/* Additional context */}
            {feedbackCollectionEnabled ? (
              <motion.div
                variants={fadeUp}
                className="rounded-[8px] gradient-border gradient-border-to-tl gradient-border-from-neutral-700 gradient-border-via-neutral-800 gradient-border-to-neutral-600 bg-card ring-1 ring-border"
              >
                <div className="flex items-center gap-3 border-b border-border px-3.5 py-2.5">
                  <TextT size={15} className="text-muted-foreground" />
                  <div className="flex-1">
                    <h3 className="text-[14px] font-medium">
                      Additional context
                    </h3>
                    <p className="text-[12px] text-muted-foreground">
                      Describe your product so the AI can better classify
                      feedback.
                    </p>
                  </div>
                </div>
                <div className="p-5">
                  <Textarea
                    value={additionalContext}
                    onChange={handleContextChange}
                    placeholder="e.g. Median is a project management tool for small teams. Key features include task boards, Slack integration, and AI-powered feedback triage..."
                    rows={4}
                    className="resize-none text-[14px]"
                  />
                  <p className="mt-2 text-[12px] text-muted-foreground/60">
                    This context is passed to the AI when scanning messages.
                    Changes save automatically.
                  </p>
                </div>
              </motion.div>
            ) : null}

            {/* Respond for me */}
            {feedbackCollectionEnabled ? (
              <motion.div
                variants={fadeUp}
                className="rounded-[8px] gradient-border gradient-border-to-tl gradient-border-from-neutral-700 gradient-border-via-neutral-800 gradient-border-to-neutral-600 bg-card ring-1 ring-border"
              >
                <div className="flex items-center gap-3 border-b border-border px-3.5 py-2.5">
                  <PaperPlaneTilt size={15} className="text-muted-foreground" />
                  <div className="flex-1">
                    <h3 className="text-[14px] font-medium">Respond for me</h3>
                    <p className="text-[12px] text-muted-foreground">
                      Automatically reply in Slack when a request is received
                      and when the change ships.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-0.5 px-3.5 py-3">
                  {(["off", "all", "specific"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleRespondModeChange(mode)}
                      className="flex items-center gap-3 rounded-[8px] px-2 py-2 text-left text-[14px] transition-colors hover:bg-muted/50"
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
                      <span
                        className={
                          respondForMeMode === mode
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }
                      >
                        {mode === "off" && "Off"}
                        {mode === "all" && "All channels"}
                        {mode === "specific" && "Specific channels only"}
                      </span>
                    </button>
                  ))}
                </div>

                {respondForMeMode === "specific" ? (
                  <div className="border-t border-border">
                    <ChannelMultiSelect
                      channels={teamChannels}
                      selectedChannelIds={respondChannelIds}
                      onToggleChannel={handleToggleChannel}
                      loadingLabel="Syncing channels from Slack..."
                      emptySelectionLabel="Select the channels where Median should auto-reply."
                      selectedCountLabel={(count) =>
                        `${count} channel${count !== 1 ? "s" : ""} selected`
                      }
                    />
                  </div>
                ) : null}
              </motion.div>
            ) : null}
          </div>

          <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Disconnect Slack</DialogTitle>
                <DialogDescription>
                  This will disconnect{" "}
                  <span className="font-medium text-foreground">
                    {integration.teamName}
                  </span>{" "}
                  from{" "}
                  <span className="font-medium text-foreground">
                    {workspace.name}
                  </span>
                  . Slack automations will stop routing to this workspace.
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
      </div>
    )
  }

  /* ── Disconnected state: OAuth connect ── */
  return (
    <Stagger className="mx-auto w-full max-w-lg px-6 py-6">
      <div className="flex flex-col gap-3">
        <motion.div variants={fadeUp}>
          <h2 className="text-[15px] font-semibold tracking-tight">Slack</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Connect a Slack workspace to receive feedback and send
            notifications.
          </p>
        </motion.div>

        {/* Connection card */}
        <motion.div
          variants={fadeUp}
          className="rounded-[8px] gradient-border gradient-border-to-tl gradient-border-from-neutral-700 gradient-border-via-neutral-800 gradient-border-to-neutral-600 bg-card ring-1 ring-border"
        >
          <div className="flex items-center gap-3 p-3.5">
            <div className="flex size-8 items-center justify-center rounded-[8px] bg-muted ring-1 ring-border">
              <SlackBrandIcon size={18} />
            </div>
            <div className="flex-1">
              <h3 className="text-[14px] font-medium">Not connected</h3>
              <p className="text-[12px] text-muted-foreground">
                Connect your Slack workspace to get started.
              </p>
            </div>
          </div>

          <div className="border-t border-border p-3.5">
            <Button
              type="button"
              onClick={handleConnect}
              disabled={isConnecting}
              className="h-9 w-full bg-[#4A154B] text-white hover:bg-[#4A154B]/90"
            >
              <LinkSimple size={15} />
              {isConnecting ? "Connecting..." : "Connect to Slack"}
            </Button>
          </div>

          <div className="flex items-center border-t border-border bg-muted/30 px-3.5 py-2">
            <p className="text-[12px] text-muted-foreground">
              You&apos;ll be redirected to Slack to authorize the Median app.
            </p>
          </div>
        </motion.div>

        {/* Info card */}
        <motion.div
          variants={fadeUp}
          className="flex items-start gap-2.5 rounded-[8px] gradient-border gradient-border-to-tl gradient-border-from-neutral-700 gradient-border-via-neutral-800 gradient-border-to-neutral-600 bg-card px-3.5 py-3 ring-1 ring-border"
        >
          <Info size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">
              What does this integration do?
            </p>
            <ul className="mt-1.5 flex flex-col gap-1 text-[12px] text-muted-foreground">
              <li>
                Scan Slack messages for product feedback and auto-create tasks
              </li>
              <li>
                Send feature request notifications with accept/deny buttons
              </li>
              <li>Auto-reply when feedback is acknowledged or shipped</li>
            </ul>
          </div>
        </motion.div>
      </div>
    </Stagger>
  )
}
