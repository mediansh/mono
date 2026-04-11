"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { motion } from "motion/react"
import { Cube } from "@phosphor-icons/react"

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

function CubesGraphic() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="relative grid grid-cols-3 grid-rows-3 place-items-center gap-2" style={{ width: 168, height: 168 }}>
        {/* Top center */}
        <div />
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-foreground/[0.1] bg-foreground/[0.03]">
          <div className="h-3 w-3 rounded bg-foreground/[0.08]" />
        </div>
        <div />

        {/* Middle row */}
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-foreground/[0.1] bg-foreground/[0.03]">
          <div className="h-3 w-3 rounded bg-foreground/[0.08]" />
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-foreground/[0.15] bg-foreground/[0.05]">
          <div className="h-4 w-4 rounded bg-foreground/[0.1]" />
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-foreground/[0.1] bg-foreground/[0.03]">
          <div className="h-3 w-3 rounded bg-foreground/[0.08]" />
        </div>

        {/* Bottom center */}
        <div />
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-foreground/[0.1] bg-foreground/[0.03]">
          <div className="h-3 w-3 rounded bg-foreground/[0.08]" />
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
