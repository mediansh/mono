"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { motion } from "motion/react"
import {
  Cube,
  CheckCircle,
  XCircle,
  DiscordLogo,
  GithubLogo,
} from "@phosphor-icons/react"
import { Logo } from "@/components/logo"
import { LinearLogo } from "@/components/icons/linear-logo"
import { XLogoIcon } from "@/components/icons/x-logo"

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
  const sources = [
    { Icon: DiscordLogo, text: "bug on onboarding", rot: -10 },
    { Icon: XLogoIcon, text: "dark mode pls", rot: 0 },
    { Icon: GithubLogo, text: "sync issue", rot: 8 },
  ]

  return (
    <div className="flex h-full items-center justify-center">
      <div className="relative flex flex-col items-center gap-4">
        {/* Source cards row */}
        <div className="flex gap-3">
          {sources.map((item, i) => {
            const { Icon } = item
            return (
              <div
                key={i}
                className="flex h-8 w-20 items-center gap-2 overflow-hidden rounded-lg border border-foreground/[0.08] bg-foreground/[0.02] px-2 text-foreground/35"
                style={{ transform: `rotate(${item.rot}deg)` }}
              >
                <Icon size={10} weight="fill" />
                <span className="truncate text-[7px] leading-none text-foreground/30">
                  {item.text}
                </span>
              </div>
            )
          })}
        </div>

        {/* Connecting lines */}
        <div className="flex items-center gap-6">
          <div className="h-6 w-px bg-foreground/[0.06] -rotate-[20deg]" />
          <div className="h-6 w-px bg-foreground/[0.08]" />
          <div className="h-6 w-px bg-foreground/[0.06] rotate-[20deg]" />
        </div>

        {/* Central inbox */}
        <div className="flex h-12 w-36 flex-col justify-center gap-[3px] overflow-hidden rounded-xl border border-foreground/[0.15] bg-foreground/[0.04] px-3">
          <span className="text-[8px] font-semibold leading-none text-foreground/60">
            Inbox
          </span>
          <span className="truncate text-[7px] leading-none text-foreground/30">
            3 new feedback items
          </span>
        </div>
      </div>
    </div>
  )
}

function SparkGraphic() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="relative flex flex-col items-center gap-2">
        {/* Spark lines above — AI generation indicator */}
        <div className="flex items-end gap-3">
          <div className="h-4 w-px bg-foreground/[0.12] -rotate-[30deg]" />
          <div className="h-6 w-px bg-foreground/[0.15]" />
          <div className="h-4 w-px bg-foreground/[0.12] rotate-[30deg]" />
        </div>

        {/* Notification card */}
        <div className="w-56 overflow-hidden rounded-xl border border-foreground/[0.15] bg-foreground/[0.04] shadow-[0_0_24px_rgba(255,255,255,0.02)]">
          {/* Body */}
          <div className="flex items-start gap-2 px-3 pt-3 pb-2">
            <p className="flex-1 text-[10px] font-semibold leading-snug text-foreground/85">
              Fix onboarding bug blocking new signup flow
            </p>
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-foreground/[0.1] bg-foreground/[0.05] text-foreground/70">
              <DiscordLogo size={10} weight="fill" />
            </div>
          </div>
          {/* Meta row */}
          <div className="flex items-center justify-between border-t border-foreground/[0.08] px-3 py-1.5 text-[8px] text-foreground/35">
            <span>Mar 10</span>
            <span>MED-42</span>
          </div>
          {/* Actions */}
          <div className="grid grid-cols-2 border-t border-foreground/[0.08] text-[9px] font-medium">
            <div className="flex items-center justify-center gap-1 py-1.5 text-emerald-400/85">
              <CheckCircle weight="fill" size={10} />
              Accept
            </div>
            <div className="flex items-center justify-center gap-1 border-l border-foreground/[0.08] py-1.5 text-rose-400/85">
              <XCircle weight="fill" size={10} />
              Deny
            </div>
          </div>
        </div>
      </div>
    </div>
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
          <GithubLogo size={16} weight="fill" />
        </div>
        <div />

        {/* Middle row — Discord, Median, Linear */}
        <div className={satellite}>
          <DiscordLogo size={16} weight="fill" />
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-foreground/[0.15] bg-foreground/[0.05] text-foreground">
          <Logo symbolOnly className="text-[18px]" />
        </div>
        <div className={satellite}>
          <LinearLogo size={16} />
        </div>

        {/* Bottom center — X */}
        <div />
        <div className={satellite}>
          <XLogoIcon size={16} />
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
    { label: "customer request", w: "w-44", dotOpacity: "bg-foreground/[0.2]", textOpacity: "text-foreground/55", opacity: "border-foreground/[0.12] bg-foreground/[0.04]" },
    { label: "feature request", w: "w-40", dotOpacity: "bg-foreground/[0.15]", textOpacity: "text-foreground/45", opacity: "border-foreground/[0.1] bg-foreground/[0.03]" },
    { label: "in review", w: "w-36", dotOpacity: "bg-foreground/[0.1]", textOpacity: "text-foreground/35", opacity: "border-foreground/[0.08] bg-foreground/[0.02]" },
    { label: "bug", w: "w-32", dotOpacity: "bg-foreground/[0.06]", textOpacity: "text-foreground/30", opacity: "border-foreground/[0.06] bg-foreground/[0.01]" },
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
            <span className={`truncate text-[10px] leading-none ${tag.textOpacity}`}>
              {tag.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LogsGraphic() {
  const entries = [
    "Task created",
    "Imported from Discord",
    "Status changed to In Progress",
    "Synced to Linear",
    "Reply sent to user",
    "Webhook received",
  ]

  return (
    <div className="flex h-full items-center justify-center">
      <div className="relative flex flex-col">
        {/* Timeline line — centered on the 10px dot column */}
        <div className="pointer-events-none absolute top-1 bottom-1 left-[5px] w-px -translate-x-1/2 bg-foreground/[0.06]" />

        {entries.map((entry, i) => (
          <div
            key={i}
            className="flex items-center gap-3 py-[5px]"
            style={{ opacity: 1 - i * 0.15 }}
          >
            <div className="relative z-10 h-[10px] w-[10px] shrink-0 rounded-full border border-foreground/[0.12] bg-background" />
            <span className="whitespace-nowrap text-[9px] leading-none text-foreground/45">
              {entry}
            </span>
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
        <div className="flex flex-col gap-2 p-3.5 font-mono">
          {/* Prompt 1 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] leading-none text-foreground/40">$</span>
            <span className="truncate text-[8px] leading-none text-foreground/55">
              median sync --source discord
            </span>
          </div>
          {/* Response */}
          <div className="pl-1">
            <span className="truncate text-[8px] leading-none text-foreground/30">
              webhook received
            </span>
          </div>
          <div className="pl-1">
            <span className="truncate text-[8px] leading-none text-foreground/30">
              task.created
            </span>
          </div>
          {/* Prompt 2 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] leading-none text-foreground/40">$</span>
            <span className="truncate text-[8px] leading-none text-foreground/55">
              linear.push=true
            </span>
          </div>
          {/* Cursor */}
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] leading-none text-foreground/40">$</span>
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
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            <Cube size="1em" weight="duotone" className="mr-2 inline-block align-middle text-foreground/40 sm:mr-3" />
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
