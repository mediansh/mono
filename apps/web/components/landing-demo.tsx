"use client"

import { useState, useEffect } from "react"
import { motion } from "motion/react"
import {
  MagnifyingGlass,
  PenNib,
  House,
  ClockCounterClockwise,
  CreditCard,
  Plugs,
  Gear,
  ListBullets,
  SquaresFour,
  SpinnerGap,
  Circle,
  SealCheck,
  Plus,
  CheckCircle,
  XCircle,
  CellSignalFull,
  CellSignalMedium,
  CellSignalLow,
  WarningCircle,
  Minus,
} from "@phosphor-icons/react"
import { Logo } from "@/components/logo"
import {
  DiscordIcon,
  SlackIcon,
  LinearIcon,
  XIcon,
  GitHubIcon,
  CliIcon,
} from "@/components/brand-icons"

type Priority = "urgent" | "high" | "medium" | "low" | "none"
type LabelName = "feature" | "bug" | "improvement"

const LABEL_COLORS: Record<LabelName, string> = {
  feature: "#a855f7",
  bug: "#ef4444",
  improvement: "#06b6d4",
}

type Source = "discord" | "slack" | "linear" | "x" | "github" | "cli"

type MockTask = {
  id: string
  code: string
  title: string
  date: string
  priority?: Priority
  labels?: LabelName[]
  sources?: Source[]
}

const REQUESTS: MockTask[] = [
  {
    id: "r1",
    code: "MED-12",
    title: "Database performance optimization",
    date: "Apr 9",
    labels: ["improvement"],
    sources: ["slack"],
  },
  {
    id: "r2",
    code: "MED-18",
    title: "Client feedback on dashboard redesign",
    date: "Apr 9",
    labels: ["feature"],
    sources: ["discord"],
  },
]

const TODO: MockTask[] = [
  {
    id: "t1",
    code: "MED-14",
    title: "Implement dark mode toggle",
    date: "Apr 10",
    priority: "medium",
    labels: ["feature"],
  },
  {
    id: "t2",
    code: "MED-16",
    title: "Fix login page styling bug",
    date: "Apr 10",
    priority: "high",
    labels: ["bug"],
  },
]

const IN_PROGRESS: MockTask[] = [
  {
    id: "p1",
    code: "MED-11",
    title: "Review and optimize codebase documentation",
    date: "Apr 8",
    priority: "medium",
    labels: ["improvement"],
  },
  {
    id: "p2",
    code: "MED-13",
    title: "Review API documentation",
    date: "Apr 9",
    priority: "low",
    labels: ["improvement"],
  },
  {
    id: "p3",
    code: "MED-17",
    title: "Review Q4 analytics report",
    date: "Apr 9",
    priority: "none",
  },
]

const READY: MockTask[] = [
  {
    id: "d1",
    code: "MED-15",
    title: "Fix login button styling",
    date: "Apr 8",
    priority: "urgent",
    labels: ["bug"],
  },
  {
    id: "d2",
    code: "MED-19",
    title: "Implement dark mode toggle",
    date: "Apr 9",
    priority: "medium",
    labels: ["feature"],
  },
]

const SHIPPED: MockTask[] = [
  {
    id: "s1",
    code: "MED-09",
    title: "Onboarding flow polish",
    date: "Apr 6",
    priority: "medium",
    labels: ["improvement"],
  },
]

function PriorityIcon({ priority }: { priority: Priority }) {
  switch (priority) {
    case "urgent":
      return <WarningCircle size={12} weight="fill" className="text-red-500" />
    case "high":
      return <CellSignalFull size={12} className="text-orange-500" />
    case "medium":
      return <CellSignalMedium size={12} className="text-yellow-500" />
    case "low":
      return <CellSignalLow size={12} className="text-blue-400" />
    case "none":
      return <Minus size={12} className="text-muted-foreground" />
  }
}

function SourceIcon({ source }: { source: Source }) {
  const cls = "text-muted-foreground/70"
  switch (source) {
    case "discord":
      return <span className={cls}><DiscordIcon size={11} /></span>
    case "slack":
      return <span className={cls}><SlackIcon size={11} /></span>
    case "linear":
      return <span className={cls}><LinearIcon size={11} /></span>
    case "x":
      return <span className={cls}><XIcon size={11} /></span>
    case "github":
      return <span className={cls}><GitHubIcon size={11} /></span>
    case "cli":
      return <span className={cls}><CliIcon size={11} /></span>
  }
}

function TaskLabel({ label }: { label: LabelName }) {
  const color = LABEL_COLORS[label]
  return (
    <span
      className="rounded-[4px] px-1.5 py-0.5 text-[9px] font-medium capitalize"
      style={{ backgroundColor: color + "18", color }}
    >
      {label}
    </span>
  )
}

function RequestCard({ task }: { task: MockTask }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[4px] bg-[#1E1E1E] ring-1 ring-[#2E2E2E]">
      <div className="flex flex-1 flex-col p-2.5 pb-0">
        <p className="mb-2 text-[12px] leading-snug font-medium text-[#F7F7F4]/90">
          {task.title}
        </p>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {task.labels?.map((l) => <TaskLabel key={l} label={l} />)}
          </div>
          <div className="flex items-center gap-1">
            {task.sources?.map((s) => <SourceIcon key={s} source={s} />)}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[#2E2E2E] px-2.5 py-1">
        <span className="text-[10px] text-[#9B9D9E]/60">{task.date}</span>
        <span className="font-mono text-[10px] text-[#9B9D9E]/60 tabular-nums">
          {task.code}
        </span>
      </div>
      <div className="flex items-stretch border-t border-[#2E2E2E]">
        <div className="flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-emerald-400">
          <CheckCircle size={12} weight="fill" />
          Accept
        </div>
        <div className="w-px bg-[#2E2E2E]" />
        <div className="flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-red-400">
          <XCircle size={12} />
          Deny
        </div>
      </div>
    </div>
  )
}

function KanbanCard({ task }: { task: MockTask }) {
  return (
    <div className="rounded-[4px] bg-[#1E1E1E] ring-1 ring-[#2E2E2E]">
      <div className="p-2.5 pb-0">
        <p className="mb-2 line-clamp-2 pr-5 text-[12px] leading-snug font-medium text-[#F7F7F4]/90">
          {task.title}
        </p>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {task.priority && <PriorityIcon priority={task.priority} />}
            {task.labels?.map((l) => <TaskLabel key={l} label={l} />)}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[#2E2E2E] px-2.5 py-1">
        <span className="text-[10px] text-[#9B9D9E]/60">{task.date}</span>
        <span className="font-mono text-[10px] text-[#9B9D9E]/60 tabular-nums">
          {task.code}
        </span>
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: "todo" | "in_progress" | "ready" | "shipped" }) {
  switch (status) {
    case "todo":
      return <Circle size={14} className="text-[#9B9D9E]" />
    case "in_progress":
      return <SpinnerGap size={14} className="text-yellow-500" />
    case "ready":
      return <SealCheck size={14} weight="fill" className="text-emerald-500" />
    case "shipped":
      return <SealCheck size={14} weight="fill" className="text-blue-500" />
  }
}

function Column({
  status,
  label,
  count,
  children,
}: {
  status: "todo" | "in_progress" | "ready" | "shipped"
  label: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full w-[230px] shrink-0 flex-col overflow-hidden rounded-[4px] ring-1 ring-[#2E2E2E]">
      <div className="flex items-center gap-2 bg-[#1E1E1E] px-3 py-1.5 shadow-[inset_0_-1px_0_#2E2E2E]">
        <StatusIcon status={status} />
        <span className="text-[13px] font-semibold tracking-tight text-[#F7F7F4]">
          {label}
        </span>
        <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-[4px] bg-[#2A2A2A] px-1.5 text-[10px] font-medium text-[#9B9D9E]">
          {count}
        </span>
        <Plus size={14} className="ml-auto text-[#9B9D9E]/40" />
      </div>
      <div className="flex flex-col gap-2 p-2">{children}</div>
    </div>
  )
}

function SidebarItem({
  icon,
  label,
  active,
  shortcut,
  muted,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  shortcut?: string
  muted?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-[4px] px-2 py-1 ${
        active
          ? "bg-[#1E1E1E] text-[#F7F7F4] ring-1 ring-[#2A2A2A]"
          : muted
            ? "text-[#F7F7F4]/40"
            : "text-[#F7F7F4]/70"
      }`}
    >
      <span className="flex size-[15px] items-center justify-center">{icon}</span>
      <span className="text-[13px]">{label}</span>
      {shortcut && (
        <kbd className="ml-auto rounded-[3px] border border-[#2A2A2A] px-1 py-px font-mono text-[10px] text-[#F7F7F4]/40">
          {shortcut}
        </kbd>
      )}
    </div>
  )
}

function SidebarSubItem({
  icon,
  label,
}: {
  icon: React.ReactNode
  label: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-[4px] py-1 pr-2 pl-7 text-[13px] text-[#F7F7F4]/70">
      <span className="flex size-3 items-center justify-center text-[#F7F7F4]/70">
        {icon}
      </span>
      <span>{label}</span>
    </div>
  )
}

export function LandingDemo() {
  const [mac, setMac] = useState(true)
  useEffect(() => {
    setMac(/Mac|iPhone/.test(navigator.userAgent))
  }, [])

  return (
    <section className="px-4 pb-24">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
        className="mx-auto max-w-6xl"
      >
        <div className="relative overflow-hidden rounded-2xl border border-foreground/10 bg-[#141414] shadow-2xl">
          <div className="flex h-[520px] min-h-0 md:h-[600px]">
            {/* Sidebar */}
            <aside className="flex w-[200px] shrink-0 flex-col border-r border-[#2A2A2A] bg-[#141414] p-1.5 select-none">
              <div className="flex items-center gap-1.5 px-1 py-0.5">
                <Logo symbolOnly className="size-6" />
              </div>

              <div className="mt-2 flex flex-col gap-1">
                <div className="flex items-center gap-2 rounded-[4px] px-2 py-1 text-[#F7F7F4]/60 ring-1 ring-[#2A2A2A]">
                  <MagnifyingGlass size={15} />
                  <span className="text-[13px]">Search</span>
                  <kbd className="ml-auto rounded-[3px] border border-[#2A2A2A] px-1 py-px font-mono text-[10px] text-[#F7F7F4]/40">
                    {mac ? "⌘K" : "Ctrl+K"}
                  </kbd>
                </div>
                <div className="flex items-center gap-2 rounded-[4px] bg-[#F7F7F4] px-2 py-1 text-[#141414] ring-1 ring-[#F7F7F4]/10">
                  <PenNib size={15} weight="fill" />
                  <span className="text-[13px] font-medium">New</span>
                  <kbd className="ml-auto rounded-[3px] border border-[#141414]/15 px-1 py-px font-mono text-[10px] text-[#141414]/50">
                    C
                  </kbd>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-0.5">
                <SidebarItem
                  icon={<House size={15} weight="fill" />}
                  label="Home"
                  active
                />
                <SidebarItem
                  icon={<ClockCounterClockwise size={15} />}
                  label="Logs"
                />
                <SidebarItem
                  icon={<CreditCard size={15} />}
                  label="Billing"
                />
                <SidebarItem
                  icon={<Plugs size={15} />}
                  label="Integrations"
                />
                <div className="mt-0.5 flex flex-col gap-0.5 border-l border-[#2A2A2A] ml-3 pl-0">
                  <SidebarSubItem icon={<DiscordIcon size={12} />} label="Discord" />
                  <SidebarSubItem icon={<SlackIcon size={12} />} label="Slack" />
                  <SidebarSubItem icon={<LinearIcon size={12} />} label="Linear" />
                  <SidebarSubItem icon={<XIcon size={12} />} label="X (Twitter)" />
                  <SidebarSubItem icon={<GitHubIcon size={12} />} label="GitHub" />
                  <SidebarSubItem icon={<CliIcon size={12} />} label="CLI" />
                </div>
              </div>

              <div className="mt-auto flex flex-col gap-0.5">
                <SidebarItem icon={<Gear size={15} />} label="Settings" />
                <div className="flex items-center gap-2 rounded-[4px] px-2 py-1">
                  <div className="flex size-5 shrink-0 items-center justify-center rounded-[4px] bg-[#1E1E1E] text-[10px] font-medium text-[#F7F7F4] ring-1 ring-[#2A2A2A]">
                    M
                  </div>
                  <div className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-[12px] font-medium text-[#F7F7F4]">
                      Median
                    </span>
                    <span className="truncate text-[10px] text-[#F7F7F4]/50">
                      Workspace
                    </span>
                  </div>
                </div>
              </div>
            </aside>

            {/* Main */}
            <main className="flex min-w-0 flex-1 flex-col bg-[#181818]">
              {/* Toolbar */}
              <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                <div className="flex items-center gap-0.5 rounded-[4px] bg-[#1E1E1E]/60 p-0.5 ring-1 ring-[#2A2A2A]">
                  <div className="flex size-6 items-center justify-center rounded-[4px] bg-[#2A2A2A] text-[#F7F7F4]">
                    <ListBullets size={14} />
                  </div>
                  <div className="flex size-6 items-center justify-center rounded-[4px] text-[#F7F7F4]/50">
                    <SquaresFour size={14} />
                  </div>
                </div>
              </div>

              {/* Board */}
              <div className="scrollbar-hide flex flex-1 gap-2 overflow-x-auto px-4 pt-1 pb-4">
                {/* Requests */}
                <div className="flex h-full w-[500px] shrink-0 flex-col overflow-hidden rounded-[4px] ring-1 ring-[#2E2E2E]">
                  <div className="flex items-center gap-2.5 bg-[#1E1E1E] px-3 py-1.5">
                    <span className="text-[10px] text-[#9B9D9E]/60">▼</span>
                    <SpinnerGap size={14} className="text-[#9B9D9E]" />
                    <span className="text-[13px] font-semibold tracking-tight text-[#F7F7F4]">
                      Requests
                    </span>
                    <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-[4px] bg-[#2A2A2A] px-1.5 text-[10px] font-medium text-[#9B9D9E]">
                      {REQUESTS.length}
                    </span>
                    <span className="ml-1 text-[11px] text-[#9B9D9E]/50">
                      from users
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 p-3">
                    {REQUESTS.map((t) => (
                      <RequestCard key={t.id} task={t} />
                    ))}
                  </div>
                </div>

                <Column status="todo" label="Todo" count={TODO.length}>
                  {TODO.map((t) => (
                    <KanbanCard key={t.id} task={t} />
                  ))}
                </Column>

                <Column
                  status="in_progress"
                  label="In Progress"
                  count={IN_PROGRESS.length}
                >
                  {IN_PROGRESS.map((t) => (
                    <KanbanCard key={t.id} task={t} />
                  ))}
                </Column>

                <Column status="ready" label="Ready" count={READY.length}>
                  {READY.map((t) => (
                    <KanbanCard key={t.id} task={t} />
                  ))}
                </Column>

                <Column status="shipped" label="Shipped" count={SHIPPED.length}>
                  {SHIPPED.map((t) => (
                    <KanbanCard key={t.id} task={t} />
                  ))}
                </Column>
              </div>

            </main>
          </div>

          {/* Edge fade on right to suggest overflow */}
          <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-24 bg-gradient-to-l from-[#141414] to-transparent" />
        </div>
      </motion.div>
    </section>
  )
}
