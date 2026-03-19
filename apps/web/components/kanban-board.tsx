"use client"

import { useState, useRef, useCallback } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  MoreHorizontalIcon,
  SignalFull02Icon,
  SignalMedium02Icon,
  SignalLow02Icon,
  CircleIcon,
  Tick02Icon,
  Loading03Icon,
  CheckmarkBadge01Icon,
  Archive01Icon,
  AlertCircleIcon,
  KanbanIcon,
  LeftToRightListBulletIcon,
} from "@hugeicons/core-free-icons"
import { motion, AnimatePresence } from "motion/react"
import { NewTaskModal } from "@/components/new-task-modal"

// Types
type Priority = "urgent" | "high" | "medium" | "low" | "none"
type Status = "requests" | "todo" | "in_progress" | "done" | "archive"
type Label = "feature" | "bug" | "improvement" | "design" | "devops"
type ViewMode = "board" | "list"

interface Task {
  id: string
  title: string
  status: Status
  priority: Priority
  labels: Label[]
  project: string
  createdAt: string
  assignee?: {
    name: string
    avatar: string
  }
}

// Mock data
const MOCK_TASKS: Task[] = [
  {
    id: "MED-30",
    title: "Preview refreshes after theme change",
    status: "requests",
    priority: "high",
    labels: [],
    project: "Median V1",
    createdAt: "Feb 1",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-29",
    title: "Theme changes save to globals.css",
    status: "requests",
    priority: "high",
    labels: [],
    project: "Median V1",
    createdAt: "Feb 1",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-219",
    title: "Add Style Selection for UI Generation",
    status: "requests",
    priority: "medium",
    labels: ["feature"],
    project: "Median V1",
    createdAt: "Mar 10",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-225",
    title: "Preview Code Feature (Similar to Lovable - Image Attached)",
    status: "requests",
    priority: "medium",
    labels: ["feature"],
    project: "Median V1",
    createdAt: "Mar 11",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-221",
    title: "Plan Feature",
    status: "requests",
    priority: "medium",
    labels: ["feature"],
    project: "Median V1",
    createdAt: "Mar 10",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-226",
    title: "Have the ability to view the generated file tree in real time as it builds th...",
    status: "requests",
    priority: "low",
    labels: ["feature"],
    project: "Median V1",
    createdAt: "Mar 11",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-196",
    title: "Export with GitHub Repository Integration",
    status: "todo",
    priority: "medium",
    labels: ["feature"],
    project: "Median V1",
    createdAt: "Mar 5",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-262",
    title: "Add \"See Median in Action\" Demo Button to Landing",
    status: "in_progress",
    priority: "medium",
    labels: [],
    project: "Median V1",
    createdAt: "Mar 14",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-54",
    title: "WAITLIST SECURITY",
    status: "done",
    priority: "urgent",
    labels: ["bug"],
    project: "Median V1",
    createdAt: "Feb 13",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-64",
    title: "Waitlist Spam Issue",
    status: "done",
    priority: "low",
    labels: [],
    project: "Median V1",
    createdAt: "Feb 14",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-52",
    title: "Create Waitlist",
    status: "done",
    priority: "medium",
    labels: [],
    project: "Median V1",
    createdAt: "Feb 12",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-217",
    title: "Issue: Sidebar Dragging (Videos Attached)",
    status: "done",
    priority: "medium",
    labels: ["bug"],
    project: "Median V1",
    createdAt: "Mar 10",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-222",
    title: "Further improve mic voice-to-text (Web Speech API)",
    status: "done",
    priority: "medium",
    labels: ["improvement"],
    project: "Median V1",
    createdAt: "Mar 10",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-249",
    title: "Specific prompts sometimes generate full pages",
    status: "done",
    priority: "medium",
    labels: ["bug"],
    project: "Median V1",
    createdAt: "Mar 13",
    assignee: { name: "Abdul", avatar: "" },
  },
]

// Column config
const COLUMNS: { id: Status; label: string }[] = [
  { id: "requests", label: "Requests" },
  { id: "todo", label: "Todo" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done" },
  { id: "archive", label: "Archive" },
]

// Label colors
const LABEL_COLORS: Record<Label, string> = {
  feature: "#a855f7",
  bug: "#ef4444",
  improvement: "#22c55e",
  design: "#3b82f6",
  devops: "#f59e0b",
}

const STATUS_LABELS: Record<Status, string> = {
  requests: "Requests",
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
  archive: "Archive",
}

function getStatusIcon(status: Status, size = 14) {
  switch (status) {
    case "requests":
      return <HugeiconsIcon icon={Loading03Icon} size={size} className="text-muted-foreground" />
    case "todo":
      return <HugeiconsIcon icon={CircleIcon} size={size} className="text-muted-foreground" />
    case "in_progress":
      return <HugeiconsIcon icon={Loading03Icon} size={size} className="text-yellow-500" />
    case "done":
      return <HugeiconsIcon icon={CheckmarkBadge01Icon} size={size} className="text-emerald-500" />
    case "archive":
      return <HugeiconsIcon icon={Archive01Icon} size={size} className="text-muted-foreground" />
  }
}

function getColumnIcon(status: Status) {
  return getStatusIcon(status, 15)
}

function getPriorityIcon(priority: Priority, size = 14) {
  switch (priority) {
    case "urgent":
      return <HugeiconsIcon icon={AlertCircleIcon} size={size} className="text-red-500" />
    case "high":
      return <HugeiconsIcon icon={SignalFull02Icon} size={size} className="text-orange-500" />
    case "medium":
      return <HugeiconsIcon icon={SignalMedium02Icon} size={size} className="text-yellow-500" />
    case "low":
      return <HugeiconsIcon icon={SignalLow02Icon} size={size} className="text-blue-400" />
    case "none":
      return <HugeiconsIcon icon={SignalLow02Icon} size={size} className="text-muted-foreground" />
  }
}

// ── Board View Components ──

function TaskCard({ task, index }: { task: Task; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03, ease: "easeOut" }}
      className="group cursor-pointer rounded-lg border border-border bg-sidebar p-3 transition-colors hover:bg-accent/50 dark:bg-card"
    >
      {/* Title row with status icon */}
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0">{getStatusIcon(task.status)}</div>
        <span className="text-sm font-medium leading-snug">{task.title}</span>
      </div>

      {/* Bottom row: priority + project + labels */}
      <div className="mt-3 flex items-center gap-2">
        <div className="shrink-0">{getPriorityIcon(task.priority)}</div>
        <div className="flex items-center gap-1.5 rounded-sm border border-border px-1.5 py-0.5">
          <div className="size-3 rounded-sm bg-[#0496FF]" />
          <span className="text-[11px] text-muted-foreground">{task.project}</span>
        </div>
        {task.labels.map((label) => (
          <div
            key={label}
            className="flex items-center gap-1.5 rounded-sm border border-border px-1.5 py-0.5"
          >
            <div
              className="size-2.5 rounded-full"
              style={{ backgroundColor: LABEL_COLORS[label] }}
            />
            <span className="text-[11px] capitalize text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* Created date */}
      <div className="mt-2.5">
        <span className="text-[11px] text-muted-foreground">Created {task.createdAt}</span>
      </div>
    </motion.div>
  )
}

function KanbanColumn({
  column,
  tasks,
  colIndex,
  boardRef,
  onAddTask,
}: {
  column: (typeof COLUMNS)[number]
  tasks: Task[]
  colIndex: number
  boardRef: React.RefObject<HTMLDivElement | null>
  onAddTask: (status: Status) => void
}) {
  const cardsRef = useRef<HTMLDivElement>(null)

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      const el = cardsRef.current
      if (!el || !boardRef.current) return

      const canScrollVertically = el.scrollHeight > el.clientHeight
      const atTop = el.scrollTop <= 0
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1

      const scrollingDown = e.deltaY > 0
      const scrollingUp = e.deltaY < 0

      if (
        !canScrollVertically ||
        (scrollingDown && atBottom) ||
        (scrollingUp && atTop)
      ) {
        e.preventDefault()
        boardRef.current.scrollLeft += e.deltaY
      }
    },
    [boardRef]
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: colIndex * 0.05, ease: "easeOut" }}
      className="flex w-80 shrink-0 flex-col overflow-hidden border-r border-border last:border-r-0"
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-4 pb-3 pt-1">
        <div className="flex items-center gap-2">
          {getColumnIcon(column.id)}
          <span className="text-sm font-medium">{column.label}</span>
          <span className="text-xs text-muted-foreground">{tasks.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <HugeiconsIcon icon={MoreHorizontalIcon} size={16} />
          </button>
          <button
            onClick={() => onAddTask(column.id)}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <HugeiconsIcon icon={Add01Icon} size={16} />
          </button>
        </div>
      </div>

      {/* Cards - independent scroll */}
      <div
        ref={cardsRef}
        onWheel={handleWheel}
        className="flex flex-1 flex-col gap-2 overflow-y-auto scrollbar-hide px-3 pb-4"
      >
        {tasks.map((task, index) => (
          <TaskCard key={task.id} task={task} index={index} />
        ))}
      </div>
    </motion.div>
  )
}

function BoardView({ tasks, onAddTask }: { tasks: Task[]; onAddTask: (status: Status) => void }) {
  const boardRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={boardRef} className="flex h-full overflow-x-auto scrollbar-thin">
      {COLUMNS.map((column, colIndex) => {
        const columnTasks = tasks.filter((t) => t.status === column.id)
        return (
          <KanbanColumn
            key={column.id}
            column={column}
            tasks={columnTasks}
            colIndex={colIndex}
            boardRef={boardRef}
            onAddTask={onAddTask}
          />
        )
      })}
    </div>
  )
}

// ── List View Components ──

function ListRow({ task, index }: { task: Task; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: index * 0.02, ease: "easeOut" }}
      className="group flex cursor-pointer items-center gap-3 border-b border-border px-4 py-2.5 transition-colors hover:bg-accent/50"
    >
      <div className="shrink-0">{getPriorityIcon(task.priority)}</div>
      <div className="shrink-0">{getStatusIcon(task.status)}</div>
      <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
      <div className="flex shrink-0 items-center gap-2">
        {task.labels.map((label) => (
          <div
            key={label}
            className="flex items-center gap-1.5 rounded-sm border border-border px-1.5 py-0.5"
          >
            <div
              className="size-2 rounded-full"
              style={{ backgroundColor: LABEL_COLORS[label] }}
            />
            <span className="text-[11px] capitalize text-muted-foreground">{label}</span>
          </div>
        ))}
        <span className="text-[11px] text-muted-foreground">{task.createdAt}</span>
      </div>
    </motion.div>
  )
}

function ListGroup({
  column,
  tasks,
  groupIndex,
}: {
  column: (typeof COLUMNS)[number]
  tasks: Task[]
  groupIndex: number
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: groupIndex * 0.05, ease: "easeOut" }}
    >
      {/* Group header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 bg-sidebar px-4 py-2 text-left transition-colors hover:bg-accent/50 dark:bg-accent/40"
      >
        <motion.span
          animate={{ rotate: collapsed ? -90 : 0 }}
          transition={{ duration: 0.15 }}
          className="text-xs text-muted-foreground"
        >
          ▼
        </motion.span>
        {getColumnIcon(column.id)}
        <span className="text-sm font-medium">{column.label}</span>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </button>

      {/* Rows */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            {tasks.map((task, index) => (
              <ListRow key={task.id} task={task} index={index} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function ListView({ tasks }: { tasks: Task[] }) {
  return (
    <div className="h-full overflow-y-auto scrollbar-hide">
      {COLUMNS.map((column, groupIndex) => {
        const columnTasks = tasks.filter((t) => t.status === column.id)
        if (columnTasks.length === 0) return null
        return (
          <ListGroup
            key={column.id}
            column={column}
            tasks={columnTasks}
            groupIndex={groupIndex}
          />
        )
      })}
    </div>
  )
}

// ── Main Component ──

export function KanbanBoard() {
  const [tasks] = useState<Task[]>(MOCK_TASKS)
  const [view, setView] = useState<ViewMode>("board")
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDefaultStatus, setModalDefaultStatus] = useState<Status>("requests")

  function handleAddTask(status: Status) {
    setModalDefaultStatus(status)
    setModalOpen(true)
  }

  return (
    <div className="flex h-full flex-col">
      {/* View toggle toolbar */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-2">
        <div className="flex items-center rounded-lg border border-border p-0.5">
          <button
            onClick={() => setView("board")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              view === "board"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <HugeiconsIcon icon={KanbanIcon} size={14} />
            Board
          </button>
          <button
            onClick={() => setView("list")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              view === "list"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <HugeiconsIcon icon={LeftToRightListBulletIcon} size={14} />
            List
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1">
        {view === "board" ? (
          <BoardView tasks={tasks} onAddTask={handleAddTask} />
        ) : (
          <ListView tasks={tasks} />
        )}
      </div>

      {/* New task modal */}
      <NewTaskModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        defaultStatus={modalDefaultStatus}
      />
    </div>
  )
}
