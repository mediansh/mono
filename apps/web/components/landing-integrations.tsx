"use client"

import { motion } from "motion/react"
import { Plugs } from "@phosphor-icons/react"

const ease = [0.25, 0.1, 0.25, 1] as const

/* ─── Brand icons ─── */

function DiscordIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
    </svg>
  )
}

function LinearIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <path fill="currentColor" d="M1.225 61.523c-.222-.949.908-1.546 1.597-.857l36.512 36.512c.69.69.092 1.82-.857 1.597-18.425-4.323-32.93-18.827-37.252-37.252ZM.002 46.889a.99.99 0 0 0 .29.76L52.35 99.71c.201.2.478.307.76.29 2.37-.149 4.695-.46 6.963-.927.765-.157 1.03-1.096.478-1.648L2.576 39.448c-.552-.551-1.491-.286-1.648.479a50.067 50.067 0 0 0-.926 6.962ZM4.21 29.705a.988.988 0 0 0 .208 1.1l64.776 64.776c.289.29.726.375 1.1.208a49.908 49.908 0 0 0 5.185-2.684.981.981 0 0 0 .183-1.54L8.436 24.336a.981.981 0 0 0-1.541.183 49.896 49.896 0 0 0-2.684 5.185Zm8.448-11.631a.986.986 0 0 1-.045-1.354C21.78 6.46 35.111 0 49.952 0 77.592 0 100 22.407 100 50.048c0 14.84-6.46 28.172-16.72 37.338a.986.986 0 0 1-1.354-.045L12.659 18.074Z" />
    </svg>
  )
}

function XIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function GitHubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function CliIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )
}

/* ─── Integration data ─── */

const integrations = [
  {
    name: "Discord",
    icon: DiscordIcon,
    description: "Ingest feedback from channels automatically. Get task updates pushed back to your server.",
    capabilities: ["Auto-ingest messages", "Task notifications", "AI responses"],
  },
  {
    name: "GitHub",
    icon: GitHubIcon,
    description: "Link repositories, sync issues, and track commits and PRs tied to tasks.",
    capabilities: ["Issue sync", "PR tracking", "Commit linking"],
  },
  {
    name: "Linear",
    icon: LinearIcon,
    description: "Two-way sync between Median tasks and Linear issues. Status changes flow both directions.",
    capabilities: ["Bidirectional sync", "Status mapping", "Real-time webhooks"],
  },
  {
    name: "X (Twitter)",
    icon: XIcon,
    description: "Monitor mentions and create tasks from tweets. Stay on top of public feedback.",
    capabilities: ["Mention monitoring", "Auto task creation", "OAuth connect"],
  },
  {
    name: "CLI",
    icon: CliIcon,
    description: "Manage tasks straight from your terminal. Built for developers who live in the command line.",
    capabilities: ["Create tasks", "Update status", "API key auth"],
  },
]

/* ─── Component ─── */

export function LandingIntegrations() {
  return (
    <section id="integrations" className="scroll-mt-24 px-4 py-24">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5, ease }}
          className="mb-16 text-center"
        >
          <h2 className="flex items-center justify-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            <Plugs size="1em" weight="duotone" className="text-foreground/40" />
            Plugs into your stack
          </h2>
          <p className="mt-3 text-muted-foreground sm:text-lg">
            Connect the tools your team already uses. Feedback flows in, updates flow out.
          </p>
        </motion.div>

        {/* Integration icon strip */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease }}
          className="relative mx-auto mb-16 flex items-center justify-center"
        >
          {/* Horizontal connecting line behind everything */}
          <div className="absolute top-1/2 h-px w-full max-w-md -translate-y-1/2 bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent" />

          <div className="relative flex items-center gap-5 sm:gap-8">
            {/* Left integrations */}
            {integrations.slice(0, 2).map((integration, i) => (
              <motion.div
                key={integration.name}
                initial={{ opacity: 0, scale: 0.5 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.15 + i * 0.08, ease }}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-foreground/[0.1] bg-foreground/[0.04] backdrop-blur-sm"
              >
                <integration.icon size={20} />
              </motion.div>
            ))}

            {/* Center — Median logo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1, ease }}
              className="flex h-16 w-16 items-center justify-center rounded-2xl border border-foreground/[0.15] bg-foreground/[0.06]"
            >
              <svg viewBox="0 0 300 300" fill="currentColor" className="h-8 w-8">
                <path d="M253.339 0H46.4123C20.7798 0 0 21.304 0 47.7159V107.267C0 111.503 2.98631 114.12 7.09249 112.874L238.283 52.6993C244.256 51.0797 247.74 55.6894 245.998 61.6694L185.649 292.649C184.529 297.135 187.267 300 191.746 300H252.095C278.1 300 300 277.699 300 252.409V47.7159C300 21.304 279.096 0 253.339 0Z" />
                <path d="M0 139.531V253.526C0 278.942 20.6553 299.996 46.4123 299.996H159.768C164.247 299.996 166.362 296.259 165.118 291.898L147.822 229.232C147.076 226.865 147.2 224.747 148.445 222.38L203.691 111.251C206.802 105.021 199.336 100.412 194.857 105.146L53.8781 244.93C49.8963 249.166 43.5504 244.307 45.7901 238.701L72.1692 160.212C73.538 155.727 71.6715 151.367 66.321 150.37L7.71464 134.299C3.11074 132.679 0 135.171 0 139.531Z" />
              </svg>
            </motion.div>

            {/* Right integrations */}
            {integrations.slice(2).map((integration, i) => (
              <motion.div
                key={integration.name}
                initial={{ opacity: 0, scale: 0.5 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.35 + i * 0.08, ease }}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-foreground/[0.1] bg-foreground/[0.04] backdrop-blur-sm"
              >
                <integration.icon size={20} />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Integration cards grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.slice(0, 3).map((integration, i) => (
            <IntegrationCard key={integration.name} integration={integration} delay={i * 0.08} />
          ))}
        </div>
        <div className="mx-auto mt-4 grid max-w-[calc(66.666%+8px)] gap-4 sm:grid-cols-2">
          {integrations.slice(3).map((integration, i) => (
            <IntegrationCard key={integration.name} integration={integration} delay={(i + 3) * 0.08} />
          ))}
        </div>
      </div>
    </section>
  )
}

function IntegrationCard({
  integration,
  delay,
}: {
  integration: (typeof integrations)[number]
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.4, delay, ease }}
      className="relative overflow-hidden rounded-2xl"
    >
      {/* Gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
        }}
      />
      {/* Gradient border */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          padding: "1px",
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0.1), rgba(255,255,255,0.03))",
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
      {/* Shadow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{ boxShadow: "0 4px 24px -4px rgba(0,0,0,0.3)" }}
      />

      <div className="relative p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-foreground/[0.1] bg-foreground/[0.04]">
            <integration.icon size={18} />
          </div>
          <h3 className="text-base font-semibold">{integration.name}</h3>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {integration.description}
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {integration.capabilities.map((cap) => (
            <span
              key={cap}
              className="relative overflow-hidden rounded-full px-2.5 py-1 text-xs text-muted-foreground"
            >
              <span
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  background:
                    "linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
                }}
              />
              <span
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  padding: "1px",
                  background:
                    "linear-gradient(to bottom, rgba(255,255,255,0.1), rgba(255,255,255,0.03))",
                  WebkitMask:
                    "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                  WebkitMaskComposite: "xor",
                  maskComposite: "exclude",
                }}
              />
              <span className="relative">{cap}</span>
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
