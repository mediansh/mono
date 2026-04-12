"use client"

import { useState, useEffect, createContext, useContext } from "react"
import { useTheme } from "next-themes"
import { motion } from "motion/react"
import {
  Plugs,
  DiscordLogo,
  GithubLogo,
  Terminal,
} from "@phosphor-icons/react"
import { LinearLogo } from "@/components/icons/linear-logo"
import { XLogoIcon } from "@/components/icons/x-logo"

type BrandIconProps = { size?: number }

const ease = [0.25, 0.1, 0.25, 1] as const

const cardStyles = {
  dark: {
    bg: "linear-gradient(to bottom, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
    border: "linear-gradient(to bottom, rgba(255,255,255,0.1), rgba(255,255,255,0.03))",
    shadow: "0 4px 24px -4px rgba(0,0,0,0.3)",
    pillBg: "linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
    pillBorder: "linear-gradient(to bottom, rgba(255,255,255,0.1), rgba(255,255,255,0.03))",
  },
  light: {
    bg: "linear-gradient(to bottom, rgba(255,255,255,0.85), rgba(255,255,255,0.65))",
    border: "linear-gradient(to bottom, rgba(0,0,0,0.08), rgba(0,0,0,0.03))",
    shadow: "0 4px 24px -4px rgba(0,0,0,0.06)",
    pillBg: "linear-gradient(to bottom, rgba(0,0,0,0.03), rgba(0,0,0,0.01))",
    pillBorder: "linear-gradient(to bottom, rgba(0,0,0,0.06), rgba(0,0,0,0.02))",
  },
}

const ThemeContext = createContext<{ card: typeof cardStyles.dark }>({ card: cardStyles.dark })

/* ─── Integration data ─── */

const integrations = [
  {
    name: "Discord",
    icon: ({ size = 20 }: BrandIconProps) => <DiscordLogo size={size} weight="fill" />,
    description: "Ingest feedback from channels automatically. Get task updates pushed back to your server.",
    capabilities: ["Auto-ingest messages", "Task notifications", "AI responses"],
  },
  {
    name: "GitHub",
    icon: ({ size = 20 }: BrandIconProps) => <GithubLogo size={size} weight="fill" />,
    description: "Link repositories, sync issues, and track commits and PRs tied to tasks.",
    capabilities: ["Issue sync", "PR tracking", "Commit linking"],
  },
  {
    name: "Linear",
    icon: ({ size = 20 }: BrandIconProps) => <LinearLogo size={size} />,
    description: "Two-way sync between Median tasks and Linear issues. Status changes flow both directions.",
    capabilities: ["Bidirectional sync", "Status mapping", "Real-time webhooks"],
  },
  {
    name: "X (Twitter)",
    icon: ({ size = 20 }: BrandIconProps) => <XLogoIcon size={size} />,
    description: "Monitor mentions and create tasks from tweets. Stay on top of public feedback.",
    capabilities: ["Mention monitoring", "Auto task creation", "OAuth connect"],
  },
  {
    name: "CLI",
    icon: ({ size = 20 }: BrandIconProps) => <Terminal size={size} />,
    description: "Manage tasks straight from your terminal. Built for developers who live in the command line.",
    capabilities: ["Create tasks", "Update status", "API key auth"],
  },
]

/* ─── Component ─── */

export function LandingIntegrations() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = !mounted || resolvedTheme === "dark"
  const card = isDark ? cardStyles.dark : cardStyles.light

  return (
    <ThemeContext.Provider value={{ card }}>
    <section id="integrations" className="scroll-mt-24 px-6 py-24 sm:px-4">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5, ease }}
          className="mb-16 text-center"
        >
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            <Plugs size="1em" weight="duotone" className="mr-2 inline-block align-middle text-foreground/40 sm:mr-3" />
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
          className="relative mx-auto mb-20 flex items-center justify-center py-4"
        >
          <div className="relative flex items-center gap-3 sm:gap-10">
            {/* Connecting line — sits behind icons, spans between first and last */}
            <div className="pointer-events-none absolute top-1/2 right-[20px] left-[20px] h-px -translate-y-1/2 bg-foreground/[0.08] sm:right-[32px] sm:left-[32px]" />

            {/* Left integrations (Discord, GitHub) */}
            {integrations.slice(0, 2).map((integration, i) => (
              <motion.div
                key={integration.name}
                initial={{ opacity: 0, scale: 0.5 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.15 + i * 0.08, ease }}
                className="relative z-10 flex h-11 w-11 items-center justify-center rounded-xl border border-foreground/[0.1] bg-background sm:h-16 sm:w-16 sm:rounded-2xl"
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
              className="relative z-10 flex h-14 w-14 items-center justify-center rounded-xl border border-foreground/[0.15] bg-background sm:h-24 sm:w-24 sm:rounded-2xl"
            >
              <svg viewBox="0 0 300 300" fill="currentColor" className="h-7 w-7 sm:h-12 sm:w-12">
                <path d="M253.339 0H46.4123C20.7798 0 0 21.304 0 47.7159V107.267C0 111.503 2.98631 114.12 7.09249 112.874L238.283 52.6993C244.256 51.0797 247.74 55.6894 245.998 61.6694L185.649 292.649C184.529 297.135 187.267 300 191.746 300H252.095C278.1 300 300 277.699 300 252.409V47.7159C300 21.304 279.096 0 253.339 0Z" />
                <path d="M0 139.531V253.526C0 278.942 20.6553 299.996 46.4123 299.996H159.768C164.247 299.996 166.362 296.259 165.118 291.898L147.822 229.232C147.076 226.865 147.2 224.747 148.445 222.38L203.691 111.251C206.802 105.021 199.336 100.412 194.857 105.146L53.8781 244.93C49.8963 249.166 43.5504 244.307 45.7901 238.701L72.1692 160.212C73.538 155.727 71.6715 151.367 66.321 150.37L7.71464 134.299C3.11074 132.679 0 135.171 0 139.531Z" />
              </svg>
            </motion.div>

            {/* Right integrations (Linear, X) */}
            {integrations.slice(2, 4).map((integration, i) => (
              <motion.div
                key={integration.name}
                initial={{ opacity: 0, scale: 0.5 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.35 + i * 0.08, ease }}
                className="relative z-10 flex h-11 w-11 items-center justify-center rounded-xl border border-foreground/[0.1] bg-background sm:h-16 sm:w-16 sm:rounded-2xl"
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
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:mx-auto lg:max-w-[calc(66.666%+8px)]">
          {integrations.slice(3).map((integration, i) => (
            <IntegrationCard key={integration.name} integration={integration} delay={(i + 3) * 0.08} />
          ))}
        </div>
      </div>
    </section>
    </ThemeContext.Provider>
  )
}

function IntegrationCard({
  integration,
  delay,
}: {
  integration: (typeof integrations)[number]
  delay: number
}) {
  const { card } = useContext(ThemeContext)

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
        style={{ background: card.bg }}
      />
      {/* Gradient border */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          padding: "1px",
          background: card.border,
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
      {/* Shadow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{ boxShadow: card.shadow }}
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
                style={{ background: card.pillBg }}
              />
              <span
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  padding: "1px",
                  background: card.pillBorder,
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
