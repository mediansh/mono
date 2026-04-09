"use client"

import { motion } from "motion/react"

const ease = [0.25, 0.1, 0.25, 1] as const

/* ─── Isometric SVG illustrations ─── */

function InboxGraphic() {
  // Stacked layers flowing into a central inbox — represents multi-channel ingestion
  return (
    <svg viewBox="0 0 400 300" fill="none" className="h-full w-full">
      {/* Bottom layer */}
      <path
        d="M200 260 L340 180 L200 220 L60 180 Z"
        stroke="currentColor"
        strokeOpacity={0.1}
        strokeWidth={1}
      />
      {/* Middle layers */}
      <path
        d="M200 240 L340 160 L200 200 L60 160 Z"
        stroke="currentColor"
        strokeOpacity={0.12}
        strokeWidth={1}
      />
      <path
        d="M200 220 L340 140 L200 180 L60 140 Z"
        stroke="currentColor"
        strokeOpacity={0.15}
        strokeWidth={1}
      />
      {/* Main inbox layer */}
      <path
        d="M200 200 L340 120 L200 160 L60 120 Z"
        stroke="currentColor"
        strokeOpacity={0.25}
        strokeWidth={1}
        fill="currentColor"
        fillOpacity={0.03}
      />
      {/* Incoming arrows */}
      <line x1="120" y1="60" x2="170" y2="130" stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} />
      <line x1="200" y1="40" x2="200" y2="130" stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} />
      <line x1="280" y1="60" x2="230" y2="130" stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} />
      {/* Source dots */}
      <circle cx="120" cy="55" r="4" stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} fill="currentColor" fillOpacity={0.05} />
      <circle cx="200" cy="35" r="4" stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} fill="currentColor" fillOpacity={0.05} />
      <circle cx="280" cy="55" r="4" stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} fill="currentColor" fillOpacity={0.05} />
    </svg>
  )
}

function SparkGraphic() {
  // Abstract neural/spark pattern — represents AI task generation
  return (
    <svg viewBox="0 0 400 300" fill="none" className="h-full w-full">
      {/* Central spark */}
      <circle cx="200" cy="150" r="8" stroke="currentColor" strokeOpacity={0.3} strokeWidth={1} fill="currentColor" fillOpacity={0.05} />
      <circle cx="200" cy="150" r="20" stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} />
      <circle cx="200" cy="150" r="40" stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} />
      {/* Radiating lines */}
      <line x1="200" y1="110" x2="200" y2="50" stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} />
      <line x1="200" y1="190" x2="200" y2="250" stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} />
      <line x1="160" y1="150" x2="80" y2="150" stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} />
      <line x1="240" y1="150" x2="320" y2="150" stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} />
      {/* Diagonal lines */}
      <line x1="172" y1="122" x2="120" y2="70" stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} />
      <line x1="228" y1="122" x2="280" y2="70" stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} />
      <line x1="172" y1="178" x2="120" y2="230" stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} />
      <line x1="228" y1="178" x2="280" y2="230" stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} />
      {/* Endpoint nodes */}
      <circle cx="200" cy="50" r="3" stroke="currentColor" strokeOpacity={0.2} strokeWidth={1} />
      <circle cx="200" cy="250" r="3" stroke="currentColor" strokeOpacity={0.2} strokeWidth={1} />
      <circle cx="80" cy="150" r="3" stroke="currentColor" strokeOpacity={0.2} strokeWidth={1} />
      <circle cx="320" cy="150" r="3" stroke="currentColor" strokeOpacity={0.2} strokeWidth={1} />
      <circle cx="120" cy="70" r="3" stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} />
      <circle cx="280" cy="70" r="3" stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} />
      <circle cx="120" cy="230" r="3" stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} />
      <circle cx="280" cy="230" r="3" stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} />
    </svg>
  )
}

function CubesGraphic() {
  // Connected isometric cubes — represents integrations
  return (
    <svg viewBox="0 0 400 300" fill="none" className="h-full w-full">
      {/* Large cube */}
      <g transform="translate(160, 100)">
        {/* Top face */}
        <path d="M40 0 L80 20 L40 40 L0 20 Z" stroke="currentColor" strokeOpacity={0.2} strokeWidth={1} fill="currentColor" fillOpacity={0.03} />
        {/* Right face */}
        <path d="M80 20 L80 60 L40 80 L40 40 Z" stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} fill="currentColor" fillOpacity={0.02} />
        {/* Left face */}
        <path d="M0 20 L0 60 L40 80 L40 40 Z" stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} fill="currentColor" fillOpacity={0.01} />
      </g>
      {/* Small cube top-right */}
      <g transform="translate(260, 70)">
        <path d="M25 0 L50 12 L25 24 L0 12 Z" stroke="currentColor" strokeOpacity={0.2} strokeWidth={1} fill="currentColor" fillOpacity={0.03} />
        <path d="M50 12 L50 38 L25 50 L25 24 Z" stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} fill="currentColor" fillOpacity={0.02} />
        <path d="M0 12 L0 38 L25 50 L25 24 Z" stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} fill="currentColor" fillOpacity={0.01} />
      </g>
      {/* Small cube bottom-left */}
      <g transform="translate(90, 180)">
        <path d="M25 0 L50 12 L25 24 L0 12 Z" stroke="currentColor" strokeOpacity={0.2} strokeWidth={1} fill="currentColor" fillOpacity={0.03} />
        <path d="M50 12 L50 38 L25 50 L25 24 Z" stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} fill="currentColor" fillOpacity={0.02} />
        <path d="M0 12 L0 38 L25 50 L25 24 Z" stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} fill="currentColor" fillOpacity={0.01} />
      </g>
      {/* Small cube bottom-right */}
      <g transform="translate(250, 180)">
        <path d="M25 0 L50 12 L25 24 L0 12 Z" stroke="currentColor" strokeOpacity={0.2} strokeWidth={1} fill="currentColor" fillOpacity={0.03} />
        <path d="M50 12 L50 38 L25 50 L25 24 Z" stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} fill="currentColor" fillOpacity={0.02} />
        <path d="M0 12 L0 38 L25 50 L25 24 Z" stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} fill="currentColor" fillOpacity={0.01} />
      </g>
      {/* Connection lines */}
      <line x1="240" y1="140" x2="260" y2="95" stroke="currentColor" strokeOpacity={0.1} strokeWidth={1} strokeDasharray="3 3" />
      <line x1="200" y1="180" x2="140" y2="192" stroke="currentColor" strokeOpacity={0.1} strokeWidth={1} strokeDasharray="3 3" />
      <line x1="240" y1="180" x2="250" y2="192" stroke="currentColor" strokeOpacity={0.1} strokeWidth={1} strokeDasharray="3 3" />
    </svg>
  )
}

function TagsGraphic() {
  // Floating rounded-rect labels at angles — represents labels & organization
  return (
    <svg viewBox="0 0 400 300" fill="none" className="h-full w-full">
      {/* Stacked label cards in isometric perspective */}
      <g transform="translate(100, 80)">
        <rect x="0" y="80" width="200" height="32" rx="8" stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} transform="skewY(-5)" />
        <rect x="10" y="56" width="180" height="32" rx="8" stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} transform="skewY(-5)" />
        <rect x="20" y="32" width="160" height="32" rx="8" stroke="currentColor" strokeOpacity={0.18} strokeWidth={1} transform="skewY(-5)" fill="currentColor" fillOpacity={0.02} />
        {/* Active label */}
        <rect x="30" y="8" width="140" height="32" rx="8" stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} fill="currentColor" fillOpacity={0.04} />
        {/* Dot indicators */}
        <circle cx="48" cy="24" r="4" fill="currentColor" fillOpacity={0.15} />
        <line x1="60" y1="24" x2="120" y2="24" stroke="currentColor" strokeOpacity={0.12} strokeWidth={2} strokeLinecap="round" />
      </g>
      {/* Floating smaller tag */}
      <rect x="240" y="170" width="100" height="24" rx="6" stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} transform="rotate(-8 290 182)" />
      <circle cx="258" cy="178" r="3" fill="currentColor" fillOpacity={0.12} transform="rotate(-8 290 182)" />
    </svg>
  )
}

function LogsGraphic() {
  // Cascading cards flowing down — represents activity feed / logs
  return (
    <svg viewBox="0 0 400 300" fill="none" className="h-full w-full">
      {/* Stacked cards in perspective, cascading */}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <g key={i} transform={`translate(${100 + i * 4}, ${40 + i * 34})`}>
          <rect
            width={200 - i * 4}
            height={28}
            rx={6}
            stroke="currentColor"
            strokeOpacity={0.06 + (6 - i) * 0.03}
            strokeWidth={1}
            fill="currentColor"
            fillOpacity={i < 2 ? 0.03 : 0.01}
          />
          {/* Timeline dot */}
          <circle cx={-12} cy={14} r={2.5} stroke="currentColor" strokeOpacity={0.1 + (6 - i) * 0.03} strokeWidth={1} />
          {/* Placeholder lines */}
          <line x1={12} y1={14} x2={60 + (6 - i) * 8} y2={14} stroke="currentColor" strokeOpacity={0.06 + (6 - i) * 0.02} strokeWidth={2} strokeLinecap="round" />
        </g>
      ))}
      {/* Vertical timeline */}
      <line x1="88" y1="54" x2="116" y2="278" stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} />
    </svg>
  )
}

function TerminalGraphic() {
  // Isometric terminal / command prompt — represents API & CLI
  return (
    <svg viewBox="0 0 400 300" fill="none" className="h-full w-full">
      {/* Terminal window frame */}
      <rect x="80" y="60" width="240" height="180" rx="12" stroke="currentColor" strokeOpacity={0.2} strokeWidth={1} fill="currentColor" fillOpacity={0.02} />
      {/* Title bar */}
      <line x1="80" y1="88" x2="320" y2="88" stroke="currentColor" strokeOpacity={0.1} strokeWidth={1} />
      {/* Window dots */}
      <circle cx="100" cy="74" r="3" fill="currentColor" fillOpacity={0.15} />
      <circle cx="112" cy="74" r="3" fill="currentColor" fillOpacity={0.1} />
      <circle cx="124" cy="74" r="3" fill="currentColor" fillOpacity={0.1} />
      {/* Command lines */}
      <g strokeLinecap="round">
        {/* Prompt 1 */}
        <line x1="100" y1="110" x2="116" y2="110" stroke="currentColor" strokeOpacity={0.2} strokeWidth={2} />
        <line x1="122" y1="110" x2="220" y2="110" stroke="currentColor" strokeOpacity={0.1} strokeWidth={2} />
        {/* Response */}
        <line x1="108" y1="130" x2="260" y2="130" stroke="currentColor" strokeOpacity={0.06} strokeWidth={2} />
        <line x1="108" y1="146" x2="200" y2="146" stroke="currentColor" strokeOpacity={0.06} strokeWidth={2} />
        {/* Prompt 2 */}
        <line x1="100" y1="174" x2="116" y2="174" stroke="currentColor" strokeOpacity={0.2} strokeWidth={2} />
        <line x1="122" y1="174" x2="190" y2="174" stroke="currentColor" strokeOpacity={0.1} strokeWidth={2} />
        {/* Cursor */}
        <line x1="100" y1="202" x2="116" y2="202" stroke="currentColor" strokeOpacity={0.2} strokeWidth={2} />
        <rect x="122" y="197" width="8" height="12" fill="currentColor" fillOpacity={0.15} />
      </g>
    </svg>
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
