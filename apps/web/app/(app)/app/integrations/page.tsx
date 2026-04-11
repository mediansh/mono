"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { useAction } from "convex/react"
import { Warning } from "@phosphor-icons/react"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"

const integrations = [
  {
    label: "Discord",
    description: "Receive task updates and interact with your workspace via Discord.",
    href: "/app/integrations/discord",
    icon: DiscordIcon,
  },
  {
    label: "Linear",
    description: "Sync tasks and issues between Median and Linear.",
    href: "/app/integrations/linear",
    icon: LinearIcon,
  },
  {
    label: "X (Twitter)",
    description: "Monitor mentions and post updates from your workspace.",
    href: "/app/integrations/x",
    icon: XIcon,
  },
  {
    label: "GitHub",
    description: "Connect repositories and link pull requests to tasks.",
    href: "/app/integrations/github",
    icon: GitHubIcon,
  },
  {
    label: "CLI",
    description: "Manage your workspace from the command line.",
    href: "/app/integrations/cli",
    icon: CliIcon,
  },
]

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const } },
}

export default function IntegrationsPage() {
  const { currentWorkspace } = useWorkspace()
  const getQuotaStatus = useAction(api.billing.getWorkspaceQuotaStatus)
  const [eventsPaused, setEventsPaused] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!currentWorkspace) {
      setEventsPaused(false)
      return
    }
    void (async () => {
      try {
        const quota = await getQuotaStatus({ workspaceId: currentWorkspace._id })
        if (!cancelled) {
          setEventsPaused(quota.eventsExhausted && quota.overagesDisabled)
        }
      } catch {
        if (!cancelled) setEventsPaused(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentWorkspace?._id, getQuotaStatus])

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      className="mx-auto max-w-3xl px-6 py-10"
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-lg font-semibold">Integrations</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Connect your workspace to the tools you already use.
        </p>
      </motion.div>

      {eventsPaused && (
        <motion.div
          variants={fadeUp}
          className="mt-5 flex items-start gap-2.5 rounded-[4px] bg-amber-500/5 p-3 ring-1 ring-amber-500/20"
        >
          <Warning size={14} weight="fill" className="mt-0.5 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-foreground">
              Ingest paused — you&apos;re out of events
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Discord scanning, Linear, GitHub, and X webhooks are not syncing new
              events because overages are disabled for this workspace.{" "}
              <Link
                href="/app/billing"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Manage billing
              </Link>{" "}
              to upgrade or re-enable overages.
            </p>
          </div>
        </motion.div>
      )}

      <motion.div
        variants={fadeUp}
        className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {integrations.map((item) => {
          const showPaused = eventsPaused && item.label !== "CLI"
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground ring-1 ring-border">
                <item.icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-medium">{item.label}</p>
                  {showPaused && (
                    <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 ring-1 ring-amber-500/20">
                      Paused
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </Link>
          )
        })}
      </motion.div>
    </motion.div>
  )
}

// ── Platform icons (inline SVGs for brand accuracy) ──

function DiscordIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
    </svg>
  )
}

function LinearIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <path fill="currentColor" d="M1.225 61.523c-.222-.949.908-1.546 1.597-.857l36.512 36.512c.69.69.092 1.82-.857 1.597-18.425-4.323-32.93-18.827-37.252-37.252ZM.002 46.889a.99.99 0 0 0 .29.76L52.35 99.71c.201.2.478.307.76.29 2.37-.149 4.695-.46 6.963-.927.765-.157 1.03-1.096.478-1.648L2.576 39.448c-.552-.551-1.491-.286-1.648.479a50.067 50.067 0 0 0-.926 6.962ZM4.21 29.705a.988.988 0 0 0 .208 1.1l64.776 64.776c.289.29.726.375 1.1.208a49.908 49.908 0 0 0 5.185-2.684.981.981 0 0 0 .183-1.54L8.436 24.336a.981.981 0 0 0-1.541.183 49.896 49.896 0 0 0-2.684 5.185Zm8.448-11.631a.986.986 0 0 1-.045-1.354C21.78 6.46 35.111 0 49.952 0 77.592 0 100 22.407 100 50.048c0 14.84-6.46 28.172-16.72 37.338a.986.986 0 0 1-1.354-.045L12.659 18.074Z" />
    </svg>
  )
}

function XIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function GitHubIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function CliIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )
}
