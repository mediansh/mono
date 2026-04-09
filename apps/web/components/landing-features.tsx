"use client"

import { motion } from "motion/react"

const ease = [0.25, 0.1, 0.25, 1] as const

/* ─── CSS/HTML-based illustrations ─── */

function InboxGraphic() {
  return (
    <div className="relative flex h-48 items-center justify-center text-foreground">
      {/* Central card */}
      <div className="relative z-10 h-16 w-36 rounded-xl border border-foreground/[0.12] bg-foreground/[0.04]">
        <div className="mt-3 ml-3 h-2 w-16 rounded-full bg-foreground/[0.1]" />
        <div className="mt-2 ml-3 h-1.5 w-24 rounded-full bg-foreground/[0.06]" />
      </div>
      {/* Top-left pill */}
      <div
        className="absolute z-0 h-10 w-28 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03]"
        style={{ top: "24px", left: "calc(50% - 100px)", transform: "rotate(-12deg)" }}
      >
        <div className="mt-2.5 ml-2.5 h-1.5 w-14 rounded-full bg-foreground/[0.08]" />
      </div>
      {/* Top-center pill */}
      <div
        className="absolute z-0 h-10 w-28 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03]"
        style={{ top: "18px", left: "calc(50% - 14px)", transform: "rotate(6deg)" }}
      >
        <div className="mt-2.5 ml-2.5 h-1.5 w-16 rounded-full bg-foreground/[0.08]" />
      </div>
      {/* Top-right pill */}
      <div
        className="absolute z-0 h-10 w-24 rounded-lg border border-foreground/[0.06] bg-foreground/[0.02]"
        style={{ top: "30px", right: "calc(50% - 110px)", transform: "rotate(14deg)" }}
      >
        <div className="mt-2.5 ml-2.5 h-1.5 w-12 rounded-full bg-foreground/[0.06]" />
      </div>
      {/* Converging lines */}
      <div
        className="absolute h-px w-12 bg-foreground/[0.08]"
        style={{ top: "62px", left: "calc(50% - 68px)", transform: "rotate(35deg)" }}
      />
      <div
        className="absolute h-px w-10 bg-foreground/[0.08]"
        style={{ top: "56px", left: "calc(50% + 2px)", transform: "rotate(-20deg)" }}
      />
      <div
        className="absolute h-px w-10 bg-foreground/[0.06]"
        style={{ top: "64px", right: "calc(50% - 76px)", transform: "rotate(-40deg)" }}
      />
    </div>
  )
}

function SparkGraphic() {
  return (
    <div className="relative flex h-48 items-center justify-center text-foreground">
      {/* Concentric rings */}
      <div className="absolute h-32 w-32 rounded-full border border-foreground/[0.04]" />
      <div className="absolute h-24 w-24 rounded-full border border-foreground/[0.06]" />
      <div className="absolute h-16 w-16 rounded-full border border-foreground/[0.08]" />
      <div className="absolute h-8 w-8 rounded-full border border-foreground/[0.12]" />
      {/* Central dot */}
      <div className="absolute h-3 w-3 rounded-full bg-foreground/[0.2]" />
      {/* Radiating lines — cardinal */}
      <div className="absolute h-px w-20 bg-foreground/[0.1]" style={{ top: "50%", left: "calc(50% + 16px)" }} />
      <div className="absolute h-px w-20 bg-foreground/[0.1]" style={{ top: "50%", right: "calc(50% + 16px)" }} />
      <div className="absolute h-20 w-px bg-foreground/[0.1]" style={{ left: "50%", top: "calc(50% - 80px)" }} />
      <div className="absolute h-20 w-px bg-foreground/[0.1]" style={{ left: "50%", bottom: "calc(50% - 80px)" }} />
      {/* Radiating lines — diagonal */}
      <div
        className="absolute h-px w-16 bg-foreground/[0.06]"
        style={{ top: "calc(50% - 28px)", left: "calc(50% + 12px)", transform: "rotate(-45deg)", transformOrigin: "left center" }}
      />
      <div
        className="absolute h-px w-16 bg-foreground/[0.06]"
        style={{ top: "calc(50% - 28px)", right: "calc(50% + 12px)", transform: "rotate(45deg)", transformOrigin: "right center" }}
      />
      <div
        className="absolute h-px w-16 bg-foreground/[0.06]"
        style={{ top: "calc(50% + 28px)", left: "calc(50% + 12px)", transform: "rotate(45deg)", transformOrigin: "left center" }}
      />
      <div
        className="absolute h-px w-16 bg-foreground/[0.06]"
        style={{ top: "calc(50% + 28px)", right: "calc(50% + 12px)", transform: "rotate(-45deg)", transformOrigin: "right center" }}
      />
      {/* Endpoint dots */}
      <div className="absolute h-1.5 w-1.5 rounded-full bg-foreground/[0.15]" style={{ top: "calc(50% - 1px)", right: "calc(50% - 96px)" }} />
      <div className="absolute h-1.5 w-1.5 rounded-full bg-foreground/[0.15]" style={{ top: "calc(50% - 1px)", left: "calc(50% - 96px)" }} />
      <div className="absolute h-1.5 w-1.5 rounded-full bg-foreground/[0.15]" style={{ left: "calc(50% - 1px)", top: "calc(50% - 80px)" }} />
      <div className="absolute h-1.5 w-1.5 rounded-full bg-foreground/[0.15]" style={{ left: "calc(50% - 1px)", bottom: "calc(50% - 80px)" }} />
    </div>
  )
}

function CubesGraphic() {
  return (
    <div className="relative flex h-48 items-center justify-center text-foreground">
      {/* Grid of connected squares */}
      <div className="relative" style={{ width: "180px", height: "140px" }}>
        {/* Connecting lines */}
        <div className="absolute h-px w-10 bg-foreground/[0.08]" style={{ top: "30px", left: "42px" }} />
        <div className="absolute h-px w-10 bg-foreground/[0.08]" style={{ top: "30px", left: "92px" }} />
        <div className="absolute h-10 w-px bg-foreground/[0.08]" style={{ top: "42px", left: "30px" }} />
        <div className="absolute h-10 w-px bg-foreground/[0.08]" style={{ top: "42px", left: "82px" }} />
        <div className="absolute h-10 w-px bg-foreground/[0.08]" style={{ top: "42px", left: "134px" }} />
        <div className="absolute h-px w-10 bg-foreground/[0.08]" style={{ top: "102px", left: "42px" }} />

        {/* Square 1 — top left */}
        <div
          className="absolute flex items-center justify-center rounded-lg border border-foreground/[0.12] bg-foreground/[0.04]"
          style={{ width: "36px", height: "36px", top: "12px", left: "12px" }}
        >
          <div className="h-3 w-3 rounded bg-foreground/[0.1]" />
        </div>
        {/* Square 2 — top center */}
        <div
          className="absolute flex items-center justify-center rounded-lg border border-foreground/[0.1] bg-foreground/[0.03]"
          style={{ width: "36px", height: "36px", top: "12px", left: "64px" }}
        >
          <div className="h-3 w-3 rounded bg-foreground/[0.08]" />
        </div>
        {/* Square 3 — top right */}
        <div
          className="absolute flex items-center justify-center rounded-lg border border-foreground/[0.1] bg-foreground/[0.03]"
          style={{ width: "36px", height: "36px", top: "12px", left: "116px" }}
        >
          <div className="h-3 w-3 rounded bg-foreground/[0.08]" />
        </div>
        {/* Square 4 — bottom left */}
        <div
          className="absolute flex items-center justify-center rounded-lg border border-foreground/[0.08] bg-foreground/[0.02]"
          style={{ width: "36px", height: "36px", top: "84px", left: "12px" }}
        >
          <div className="h-3 w-3 rounded bg-foreground/[0.06]" />
        </div>
        {/* Square 5 — bottom center */}
        <div
          className="absolute flex items-center justify-center rounded-lg border border-foreground/[0.08] bg-foreground/[0.02]"
          style={{ width: "36px", height: "36px", top: "84px", left: "64px" }}
        >
          <div className="h-3 w-3 rounded bg-foreground/[0.06]" />
        </div>
      </div>
    </div>
  )
}

function TagsGraphic() {
  return (
    <div className="relative flex h-48 items-center justify-center text-foreground">
      <div className="flex flex-col gap-2.5">
        {/* Tag 1 — most prominent */}
        <div className="flex h-9 w-44 items-center gap-2.5 rounded-full border border-foreground/[0.12] bg-foreground/[0.04] px-3">
          <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-foreground/[0.2]" />
          <div className="h-1.5 w-20 rounded-full bg-foreground/[0.1]" />
        </div>
        {/* Tag 2 */}
        <div
          className="flex h-9 w-40 items-center gap-2.5 rounded-full border border-foreground/[0.1] bg-foreground/[0.03] px-3"
          style={{ transform: "translateX(8px)" }}
        >
          <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-foreground/[0.15]" />
          <div className="h-1.5 w-16 rounded-full bg-foreground/[0.08]" />
        </div>
        {/* Tag 3 */}
        <div
          className="flex h-9 w-36 items-center gap-2.5 rounded-full border border-foreground/[0.08] bg-foreground/[0.02] px-3"
          style={{ transform: "translateX(4px)" }}
        >
          <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-foreground/[0.12]" />
          <div className="h-1.5 w-14 rounded-full bg-foreground/[0.06]" />
        </div>
        {/* Tag 4 — faintest */}
        <div
          className="flex h-9 w-32 items-center gap-2.5 rounded-full border border-foreground/[0.06] bg-foreground/[0.01] px-3"
          style={{ transform: "translateX(12px)" }}
        >
          <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-foreground/[0.08]" />
          <div className="h-1.5 w-12 rounded-full bg-foreground/[0.04]" />
        </div>
      </div>
    </div>
  )
}

function LogsGraphic() {
  return (
    <div className="relative flex h-48 items-center justify-center text-foreground">
      <div className="flex flex-col gap-0">
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const opacity = 1 - i * 0.16
          return (
            <div key={i} className="flex items-center gap-3 px-2 py-1.5" style={{ opacity }}>
              {/* Timeline dot */}
              <div className="relative flex shrink-0 items-center justify-center">
                <div className="h-2 w-2 rounded-full border border-foreground/[0.15] bg-foreground/[0.05]" />
                {i < 5 && (
                  <div className="absolute top-2 left-1/2 h-4 w-px -translate-x-1/2 bg-foreground/[0.06]" />
                )}
              </div>
              {/* Content line */}
              <div
                className="h-1.5 rounded-full bg-foreground/[0.08]"
                style={{ width: `${100 - i * 10}px` }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TerminalGraphic() {
  return (
    <div className="relative flex h-48 items-center justify-center text-foreground">
      <div className="w-56 overflow-hidden rounded-xl border border-foreground/[0.1] bg-foreground/[0.03]">
        {/* Title bar */}
        <div className="flex items-center gap-1.5 border-b border-foreground/[0.06] px-3 py-2.5">
          <div className="h-2 w-2 rounded-full bg-foreground/[0.15]" />
          <div className="h-2 w-2 rounded-full bg-foreground/[0.1]" />
          <div className="h-2 w-2 rounded-full bg-foreground/[0.1]" />
        </div>
        {/* Terminal body */}
        <div className="flex flex-col gap-3 p-4">
          {/* Line 1 — prompt + command */}
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-4 rounded-full bg-foreground/[0.2]" />
            <div className="h-1.5 w-24 rounded-full bg-foreground/[0.1]" />
          </div>
          {/* Line 2 — response */}
          <div className="flex items-center gap-2 pl-1">
            <div className="h-1.5 w-32 rounded-full bg-foreground/[0.05]" />
          </div>
          {/* Line 3 — response */}
          <div className="flex items-center gap-2 pl-1">
            <div className="h-1.5 w-20 rounded-full bg-foreground/[0.05]" />
          </div>
          {/* Line 4 — prompt + command */}
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-4 rounded-full bg-foreground/[0.2]" />
            <div className="h-1.5 w-16 rounded-full bg-foreground/[0.1]" />
          </div>
          {/* Line 5 — cursor */}
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-4 rounded-full bg-foreground/[0.2]" />
            <div className="h-3.5 w-1.5 bg-foreground/[0.15]" />
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
    span: "col-span-1" as const,
  },
  {
    title: "AI-generated tasks",
    description:
      "Turn raw feedback into actionable, prioritized tasks with a single click.",
    graphic: SparkGraphic,
    span: "col-span-1" as const,
  },
  {
    title: "Native integrations",
    description:
      "Two-way sync with Linear, Discord, GitHub, and X. Changes flow both directions.",
    graphic: CubesGraphic,
    span: "col-span-1" as const,
  },
  {
    title: "Labels & organization",
    description:
      "Custom labels, priorities, and statuses to keep your board clean and searchable.",
    graphic: TagsGraphic,
    span: "col-span-1" as const,
  },
  {
    title: "Activity logs",
    description:
      "Full audit trail of every task, webhook, integration event, and team action.",
    graphic: LogsGraphic,
    span: "col-span-1" as const,
  },
  {
    title: "API & CLI",
    description:
      "Manage tasks from the terminal. Automate workflows with API keys and webhooks.",
    graphic: TerminalGraphic,
    span: "col-span-1" as const,
  },
]

/* ─── Component ─── */

export function LandingFeatures() {
  return (
    <section className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5, ease }}
          className="mb-12 text-center"
        >
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
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
              className={`group relative overflow-hidden rounded-2xl border border-foreground/[0.06] ${feature.span}`}
            >
              {/* Card background */}
              <div className="absolute inset-0 bg-foreground/[0.02]" />

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
