"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
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
  Rocket,
  Archive,
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

type MockTask = {
  id: string
  code: string
  title: string
  date: string
  priority?: Priority
  labels?: LabelName[]
}

const REQUESTS: MockTask[] = [
  {
    id: "r1",
    code: "MED-12",
    title: "Database performance optimization",
    date: "Apr 9",
    labels: ["improvement"],
  },
  {
    id: "r2",
    code: "MED-18",
    title: "Client feedback on dashboard redesign",
    date: "Apr 9",
    labels: ["feature"],
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

const ARCHIVED: MockTask[] = [
  {
    id: "a1",
    code: "MED-07",
    title: "Database performance optimization",
    date: "Apr 4",
    priority: "low",
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
        <div className="mb-2 flex items-center gap-1.5">
          {task.labels?.map((l) => <TaskLabel key={l} label={l} />)}
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
        <div className="mb-2 flex items-center gap-1.5">
          {task.priority && <PriorityIcon priority={task.priority} />}
          {task.labels?.map((l) => <TaskLabel key={l} label={l} />)}
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

type ColumnStatus = "requests" | "todo" | "in_progress" | "ready" | "shipped" | "archive"

function StatusIcon({ status, size = 14 }: { status: ColumnStatus; size?: number }) {
  switch (status) {
    case "requests":
      return <SpinnerGap size={size} className="text-[#9B9D9E]" />
    case "todo":
      return <Circle size={size} className="text-[#9B9D9E]" />
    case "in_progress":
      return <SpinnerGap size={size} className="text-yellow-500" />
    case "ready":
      return <SealCheck size={size} weight="fill" className="text-emerald-500" />
    case "shipped":
      return <Rocket size={size} weight="fill" className="text-blue-500" />
    case "archive":
      return <Archive size={size} className="text-[#9B9D9E]" />
  }
}

function Column({
  status,
  label,
  count,
  children,
}: {
  status: ColumnStatus
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

function ListRow({ task, status }: { task: MockTask; status: ColumnStatus }) {
  return (
    <div className="flex cursor-pointer items-center gap-3 border-b border-[#2E2E2E] px-3 py-2 transition-colors last:border-b-0 hover:bg-[#1E1E1E]/60">
      <span className="w-14 shrink-0 font-mono text-[11px] text-[#9B9D9E]/60 tabular-nums">
        {task.code}
      </span>
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        {task.priority ? <PriorityIcon priority={task.priority} /> : <Minus size={12} className="text-[#9B9D9E]/60" />}
      </span>
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <StatusIcon status={status} size={13} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#F7F7F4]/90">
        {task.title}
      </span>
      <div className="flex shrink-0 items-center gap-1.5">
        {task.labels?.map((l) => <TaskLabel key={l} label={l} />)}
        <span className="ml-1 text-[11px] text-[#9B9D9E]/60">{task.date}</span>
      </div>
    </div>
  )
}

function ListGroup({
  status,
  label,
  tasks,
  collapsed,
  extraHeader,
  children,
}: {
  status: ColumnStatus
  label: string
  tasks: MockTask[]
  collapsed?: boolean
  extraHeader?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="mb-1.5 overflow-hidden rounded-[4px] ring-1 ring-[#2E2E2E]">
      <div className="flex items-center gap-2.5 bg-[#1E1E1E] px-3 py-1.5">
        <span
          className="text-[10px] text-[#9B9D9E]/60"
          style={{
            display: "inline-block",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </span>
        <StatusIcon status={status} />
        <span className="text-[13px] font-semibold tracking-tight text-[#F7F7F4]">
          {label}
        </span>
        <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-[4px] bg-[#2A2A2A] px-1.5 text-[10px] font-medium text-[#9B9D9E]">
          {tasks.length}
        </span>
        {extraHeader}
        <Plus size={14} className="ml-auto text-[#9B9D9E]/40" />
      </div>
      {!collapsed && children}
    </div>
  )
}

function ListView() {
  return (
    <div className="scrollbar-hide flex-1 overflow-y-auto px-4 pt-1 pb-4">
      <ListGroup
        status="requests"
        label="Requests"
        tasks={REQUESTS}
        extraHeader={<span className="ml-1 text-[11px] text-[#9B9D9E]/50">from users</span>}
      >
        <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
          {REQUESTS.map((t) => <RequestCard key={t.id} task={t} />)}
        </div>
      </ListGroup>
      <ListGroup status="todo" label="Todo" tasks={TODO}>
        {TODO.map((t) => <ListRow key={t.id} task={t} status="todo" />)}
      </ListGroup>
      <ListGroup status="in_progress" label="In Progress" tasks={IN_PROGRESS}>
        {IN_PROGRESS.map((t) => <ListRow key={t.id} task={t} status="in_progress" />)}
      </ListGroup>
      <ListGroup status="ready" label="Ready" tasks={READY}>
        {READY.map((t) => <ListRow key={t.id} task={t} status="ready" />)}
      </ListGroup>
      <ListGroup status="shipped" label="Shipped" tasks={SHIPPED} collapsed />
      <ListGroup status="archive" label="Archive" tasks={ARCHIVED}>
        {ARCHIVED.map((t) => <ListRow key={t.id} task={t} status="archive" />)}
      </ListGroup>
    </div>
  )
}

function BoardView() {
  return (
    <div className="scrollbar-hide flex flex-1 gap-2 overflow-x-auto px-4 pt-1 pb-4">
      <div className="flex h-full w-[230px] shrink-0 flex-col overflow-hidden rounded-[4px] ring-1 ring-[#2E2E2E]">
        <div className="flex items-center gap-2 bg-[#1E1E1E] px-3 py-1.5 shadow-[inset_0_-1px_0_#2E2E2E]">
          <StatusIcon status="requests" />
          <span className="text-[13px] font-semibold tracking-tight text-[#F7F7F4]">
            Requests
          </span>
          <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-[4px] bg-[#2A2A2A] px-1.5 text-[10px] font-medium text-[#9B9D9E]">
            {REQUESTS.length}
          </span>
          <span className="ml-1 text-[11px] text-[#9B9D9E]/50">from users</span>
        </div>
        <div className="flex flex-col gap-2 p-2">
          {REQUESTS.map((t) => <RequestCard key={t.id} task={t} />)}
        </div>
      </div>
      <Column status="todo" label="Todo" count={TODO.length}>
        {TODO.map((t) => <KanbanCard key={t.id} task={t} />)}
      </Column>
      <Column status="in_progress" label="In Progress" count={IN_PROGRESS.length}>
        {IN_PROGRESS.map((t) => <KanbanCard key={t.id} task={t} />)}
      </Column>
      <Column status="ready" label="Ready" count={READY.length}>
        {READY.map((t) => <KanbanCard key={t.id} task={t} />)}
      </Column>
      <Column status="shipped" label="Shipped" count={SHIPPED.length}>
        {SHIPPED.map((t) => <KanbanCard key={t.id} task={t} />)}
      </Column>
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
  const [view, setView] = useState<"board" | "list">("board")
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
        <div className="relative overflow-hidden rounded-2xl border border-foreground/10 bg-[#141414] p-1.5 shadow-2xl">
          <div className="flex h-[520px] min-h-0 gap-1.5 md:h-[600px]">
            {/* Sidebar */}
            <aside className="flex w-[200px] shrink-0 flex-col bg-[#141414] select-none">
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

              <div className="mt-1 flex flex-col gap-0.5">
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

            {/* Main (inset panel) */}
            <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[4px] bg-[#181818] ring-1 ring-[#2A2A2A]">
              {/* Toolbar */}
              <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                <div className="flex items-center gap-0.5 rounded-[4px] bg-[#1E1E1E]/60 p-0.5 ring-1 ring-[#2A2A2A]">
                  <button
                    onClick={() => setView("list")}
                    className={`flex size-6 cursor-pointer items-center justify-center rounded-[4px] transition-colors ${
                      view === "list"
                        ? "bg-[#2A2A2A] text-[#F7F7F4]"
                        : "text-[#F7F7F4]/50 hover:text-[#F7F7F4]"
                    }`}
                    aria-label="List view"
                  >
                    <ListBullets size={14} />
                  </button>
                  <button
                    onClick={() => setView("board")}
                    className={`flex size-6 cursor-pointer items-center justify-center rounded-[4px] transition-colors ${
                      view === "board"
                        ? "bg-[#2A2A2A] text-[#F7F7F4]"
                        : "text-[#F7F7F4]/50 hover:text-[#F7F7F4]"
                    }`}
                    aria-label="Board view"
                  >
                    <SquaresFour size={14} />
                  </button>
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={view}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  {view === "board" ? <BoardView /> : <ListView />}
                </motion.div>
              </AnimatePresence>

              {/* Right-edge fade (board overflow) */}
              {view === "board" && (
                <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-20 bg-gradient-to-l from-[#181818] to-transparent" />
              )}
              {/* Bottom fade so content doesn't cut harshly */}
              <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-16 bg-gradient-to-t from-[#181818] to-transparent" />
              {/* Bottom drawer handle, like the real dashboard */}
              <div className="pointer-events-none absolute bottom-1.5 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-[#2A2A2A]" />
            </main>
          </div>
        </div>
      </motion.div>
    </section>
  )
}
