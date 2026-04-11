"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { motion } from "motion/react"
import { Cube } from "@phosphor-icons/react"
import { Logo } from "@/components/logo"

const ease = [0.25, 0.1, 0.25, 1] as const

const cardStyles = {
  dark: {
    bg: "linear-gradient(to bottom, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
    border: "linear-gradient(to bottom, rgba(255,255,255,0.1), rgba(255,255,255,0.03))",
    shadow: "0 4px 24px -4px rgba(0,0,0,0.3)",
  },
  light: {
    bg: "linear-gradient(to bottom, rgba(255,255,255,0.85), rgba(255,255,255,0.65))",
    border: "linear-gradient(to bottom, rgba(0,0,0,0.08), rgba(0,0,0,0.03))",
    shadow: "0 4px 24px -4px rgba(0,0,0,0.06)",
  },
}

/* ─── Graphics built with divs + Tailwind ─── */

function InboxGraphic() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="relative flex flex-col items-center gap-4">
        {/* Source cards row */}
        <div className="flex gap-3">
          {[-10, 0, 8].map((rot, i) => (
            <div
              key={i}
              className="h-8 w-20 rounded-lg border border-foreground/[0.08] bg-foreground/[0.02]"
              style={{ transform: `rotate(${rot}deg)` }}
            >
              <div className="mt-2 ml-2 h-1 w-10 rounded-full bg-foreground/[0.06]" />
            </div>
          ))}
        </div>

        {/* Connecting lines */}
        <div className="flex items-center gap-6">
          <div className="h-6 w-px bg-foreground/[0.06] -rotate-[20deg]" />
          <div className="h-6 w-px bg-foreground/[0.08]" />
          <div className="h-6 w-px bg-foreground/[0.06] rotate-[20deg]" />
        </div>

        {/* Central inbox */}
        <div className="h-12 w-36 rounded-xl border border-foreground/[0.15] bg-foreground/[0.04]">
          <div className="mt-2.5 ml-3 h-1.5 w-16 rounded-full bg-foreground/[0.1]" />
          <div className="mt-1.5 ml-3 h-1 w-24 rounded-full bg-foreground/[0.06]" />
        </div>
      </div>
    </div>
  )
}

function SparkGraphic() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="relative flex flex-col items-center gap-3">
        {/* Spark lines above */}
        <div className="flex items-end gap-3">
          <div className="h-5 w-px bg-foreground/[0.1] -rotate-[30deg]" />
          <div className="h-7 w-px bg-foreground/[0.12]" />
          <div className="h-5 w-px bg-foreground/[0.1] rotate-[30deg]" />
        </div>

        {/* Primary generated card */}
        <div className="h-14 w-40 rounded-xl border border-foreground/[0.15] bg-foreground/[0.04] shadow-[0_0_24px_rgba(255,255,255,0.02)]">
          <div className="mt-2.5 ml-3 h-1.5 w-24 rounded-full bg-foreground/[0.1]" />
          <div className="mt-1.5 ml-3 h-1 w-16 rounded-full bg-foreground/[0.06]" />
          <div className="mt-1.5 ml-3 h-1 w-28 rounded-full bg-foreground/[0.05]" />
        </div>

        {/* Stacked cards behind — implying generation */}
        <div className="-mt-2 h-3 w-36 rounded-b-lg border-x border-b border-foreground/[0.08] bg-foreground/[0.02]" />
        <div className="-mt-2 h-3 w-32 rounded-b-lg border-x border-b border-foreground/[0.04] bg-foreground/[0.01]" />
      </div>
    </div>
  )
}

function DiscordBrandIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
    </svg>
  )
}

function GithubBrandIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function LinearBrandIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <path fill="currentColor" d="M1.225 61.523c-.222-.949.908-1.546 1.597-.857l36.512 36.512c.69.69.092 1.82-.857 1.597-18.425-4.323-32.93-18.827-37.252-37.252ZM.002 46.889a.99.99 0 0 0 .29.76L52.35 99.71c.201.2.478.307.76.29 2.37-.149 4.695-.46 6.963-.927.765-.157 1.03-1.096.478-1.648L2.576 39.448c-.552-.551-1.491-.286-1.648.479a50.067 50.067 0 0 0-.926 6.962ZM4.21 29.705a.988.988 0 0 0 .208 1.1l64.776 64.776c.289.29.726.375 1.1.208a49.908 49.908 0 0 0 5.185-2.684.981.981 0 0 0 .183-1.54L8.436 24.336a.981.981 0 0 0-1.541.183 49.896 49.896 0 0 0-2.684 5.185Zm8.448-11.631a.986.986 0 0 1-.045-1.354C21.78 6.46 35.111 0 49.952 0 77.592 0 100 22.407 100 50.048c0 14.84-6.46 28.172-16.72 37.338a.986.986 0 0 1-1.354-.045L12.659 18.074Z" />
    </svg>
  )
}

function XBrandIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function CubesGraphic() {
  const satellite =
    "flex h-10 w-10 items-center justify-center rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] text-foreground/70"

  return (
    <div className="flex h-full items-center justify-center">
      <div className="relative grid grid-cols-3 grid-rows-3 place-items-center gap-2" style={{ width: 168, height: 168 }}>
        {/* Top center — GitHub */}
        <div />
        <div className={satellite}>
          <GithubBrandIcon />
        </div>
        <div />

        {/* Middle row — Discord, Median, Linear */}
        <div className={satellite}>
          <DiscordBrandIcon />
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-foreground/[0.15] bg-foreground/[0.05] text-foreground">
          <Logo symbolOnly className="text-[18px]" />
        </div>
        <div className={satellite}>
          <LinearBrandIcon />
        </div>

        {/* Bottom center — X */}
        <div />
        <div className={satellite}>
          <XBrandIcon />
        </div>
        <div />

        {/* Dashed connecting lines (absolute over the grid) */}
        {/* Vertical */}
        <div className="absolute top-[52px] left-1/2 h-5 w-px -translate-x-1/2 border-l border-dashed border-foreground/[0.08]" />
        <div className="absolute bottom-[52px] left-1/2 h-5 w-px -translate-x-1/2 border-l border-dashed border-foreground/[0.08]" />
        {/* Horizontal */}
        <div className="absolute top-1/2 left-[52px] h-px w-5 -translate-y-1/2 border-t border-dashed border-foreground/[0.08]" />
        <div className="absolute top-1/2 right-[52px] h-px w-5 -translate-y-1/2 border-t border-dashed border-foreground/[0.08]" />
      </div>
    </div>
  )
}

function TagsGraphic() {
  const tags = [
    { w: "w-44", dotOpacity: "bg-foreground/[0.2]", barW: "w-20", opacity: "border-foreground/[0.12] bg-foreground/[0.04]", barOpacity: "bg-foreground/[0.1]", x: 0 },
    { w: "w-40", dotOpacity: "bg-foreground/[0.15]", barW: "w-16", opacity: "border-foreground/[0.1] bg-foreground/[0.03]", barOpacity: "bg-foreground/[0.08]", x: 8 },
    { w: "w-36", dotOpacity: "bg-foreground/[0.1]", barW: "w-14", opacity: "border-foreground/[0.08] bg-foreground/[0.02]", barOpacity: "bg-foreground/[0.06]", x: 4 },
    { w: "w-32", dotOpacity: "bg-foreground/[0.06]", barW: "w-12", opacity: "border-foreground/[0.06] bg-foreground/[0.01]", barOpacity: "bg-foreground/[0.04]", x: 12 },
  ]

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-2.5">
        {tags.map((tag, i) => (
          <div
            key={i}
            className={`flex h-9 ${tag.w} items-center gap-2.5 rounded-full border ${tag.opacity} px-3`}
          >
            <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${tag.dotOpacity}`} />
            <div className={`h-1.5 ${tag.barW} rounded-full ${tag.barOpacity}`} />
          </div>
        ))}
      </div>
    </div>
  )
}

function LogsGraphic() {
  const widths = [120, 100, 140, 90, 110, 70]

  return (
    <div className="flex h-full items-center justify-center">
      <div className="relative flex flex-col">
        {/* Timeline line */}
        <div className="absolute top-1 bottom-1 left-[5px] w-px bg-foreground/[0.06]" />

        {widths.map((w, i) => (
          <div
            key={i}
            className="flex items-center gap-3 py-[7px]"
            style={{ opacity: 1 - i * 0.15 }}
          >
            <div className="relative z-10 h-[10px] w-[10px] shrink-0 rounded-full border border-foreground/[0.12] bg-background" />
            <div
              className="h-[3px] rounded-full bg-foreground/[0.08]"
              style={{ width: w }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function TerminalGraphic() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-56 overflow-hidden rounded-xl border border-foreground/[0.1] bg-foreground/[0.02]">
        {/* Title bar */}
        <div className="flex items-center gap-1.5 border-b border-foreground/[0.06] px-3 py-2">
          <div className="h-[7px] w-[7px] rounded-full bg-foreground/[0.15]" />
          <div className="h-[7px] w-[7px] rounded-full bg-foreground/[0.1]" />
          <div className="h-[7px] w-[7px] rounded-full bg-foreground/[0.1]" />
        </div>

        {/* Lines */}
        <div className="flex flex-col gap-2.5 p-3.5">
          {/* Prompt 1 */}
          <div className="flex items-center gap-1.5">
            <div className="h-[3px] w-3 rounded-full bg-foreground/[0.2]" />
            <div className="h-[3px] w-20 rounded-full bg-foreground/[0.1]" />
          </div>
          {/* Response */}
          <div className="pl-1">
            <div className="h-[3px] w-28 rounded-full bg-foreground/[0.04]" />
          </div>
          <div className="pl-1">
            <div className="h-[3px] w-16 rounded-full bg-foreground/[0.04]" />
          </div>
          {/* Prompt 2 */}
          <div className="flex items-center gap-1.5">
            <div className="h-[3px] w-3 rounded-full bg-foreground/[0.2]" />
            <div className="h-[3px] w-14 rounded-full bg-foreground/[0.1]" />
          </div>
          {/* Cursor */}
          <div className="flex items-center gap-1.5">
            <div className="h-[3px] w-3 rounded-full bg-foreground/[0.2]" />
            <div className="h-3 w-[5px] rounded-[1px] bg-foreground/[0.15]" />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Feature data ─── */

const features = [
  {
    title: "Every channel, one inbox",
    description:
      "Feedback from Discord, X, GitHub, and more — funneled into a single board automatically.",
    graphic: InboxGraphic,
  },
  {
    title: "AI-generated tasks",
    description:
      "Turn raw feedback into actionable, prioritized tasks with a single click.",
    graphic: SparkGraphic,
  },
  {
    title: "Native integrations",
    description:
      "Two-way sync with Linear, Discord, GitHub, and X. Changes flow both directions.",
    graphic: CubesGraphic,
  },
  {
    title: "Labels & organization",
    description:
      "Custom labels, priorities, and statuses to keep your board clean and searchable.",
    graphic: TagsGraphic,
  },
  {
    title: "Activity logs",
    description:
      "Full audit trail of every task, webhook, integration event, and team action.",
    graphic: LogsGraphic,
  },
  {
    title: "API & CLI",
    description:
      "Manage tasks from the terminal. Automate workflows with API keys and webhooks.",
    graphic: TerminalGraphic,
  },
]

/* ─── Component ─── */

export function LandingFeatures() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = !mounted || resolvedTheme === "dark"
  const card = isDark ? cardStyles.dark : cardStyles.light

  return (
    <section id="features" className="scroll-mt-24 px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5, ease }}
          className="mb-12 text-center"
        >
          <h2 className="flex items-center justify-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            <Cube size="1em" weight="duotone" className="text-foreground/40" />
            Built for how teams actually work
          </h2>
          <p className="mt-3 text-muted-foreground sm:text-lg">
            Everything you need to close the loop on user feedback.
          </p>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                duration: 0.5,
                delay: i * 0.08,
                ease,
              }}
              className="group relative overflow-hidden rounded-2xl"
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

              {/* Graphic area */}
              <div className="relative h-48 text-foreground">
                <feature.graphic />
              </div>

              {/* Text */}
              <div className="relative px-6 pb-6">
                <h3 className="text-base font-semibold">{feature.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
