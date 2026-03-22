"use client"

import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import { createPortal } from "react-dom"
import { useConvex, useConvexAuth, useMutation } from "convex/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  SignalFull02Icon,
  SignalMedium02Icon,
  SignalLow02Icon,
  CircleIcon,
  Loading03Icon,
  CheckmarkBadge01Icon,
  Archive01Icon,
  AlertCircleIcon,
  Rocket01Icon,
  ViewOffIcon,
  ViewIcon,
  CheckmarkCircle02Icon,
  Cancel02Icon,
  LinkSquare02Icon,
  Delete02Icon,
  Tag01Icon,
} from "@hugeicons/core-free-icons"
import { motion, AnimatePresence } from "motion/react"
import { NewTaskModal } from "@/components/new-task-modal"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@workspace/ui/components/dropdown-menu"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { useWorkspace } from "@/components/workspace-provider"
import {
  STATUS_ORDER,
  TASK_STATUS_LABELS,
  DEFAULT_WORKSPACE_LABELS,
  formatTaskDate,
  isDemoTaskSet,
  type RequestSource,
  type TaskLabel as Label,
  type TaskPriority as Priority,
  type TaskStatus as Status,
} from "@/lib/task-board"
import {
  setWorkspaceTasks,
  updateWorkspaceTasks,
  useLocalFirstStore,
  type LocalTaskDoc as TaskDoc,
} from "@/lib/local-first-store"

interface Task extends Omit<TaskDoc, "_syncStatus"> {
  id: string
  createdAt: string
}

// Column config
const COLUMNS: { id: Status; label: string }[] = [
  { id: "requests", label: "Requests" },
  { id: "todo", label: "Todo" },
  { id: "in_progress", label: "In Progress" },
  { id: "ready", label: "Ready" },
  { id: "shipped", label: "Shipped" },
  { id: "archive", label: "Archive" },
]

// Label colors — built from workspace config
function buildLabelColors(workspaceLabels?: { name: string; color: string }[]): Record<string, string> {
  const labels = workspaceLabels ?? DEFAULT_WORKSPACE_LABELS
  const map: Record<string, string> = {}
  for (const l of labels) map[l.name] = l.color
  return map
}

type LabelConfig = { names: string[]; colors: Record<string, string> }
const LabelConfigContext = createContext<LabelConfig>({
  names: DEFAULT_WORKSPACE_LABELS.map((l) => l.name),
  colors: buildLabelColors(),
})
function useLabelConfig() { return useContext(LabelConfigContext) }

const STATUS_LABELS = TASK_STATUS_LABELS

const SORTABLE_TRANSITION = null

function getStatusIcon(status: Status, size = 14) {
  switch (status) {
    case "requests":
      return <HugeiconsIcon icon={Loading03Icon} size={size} className="text-muted-foreground" />
    case "todo":
      return <HugeiconsIcon icon={CircleIcon} size={size} className="text-muted-foreground" />
    case "in_progress":
      return <HugeiconsIcon icon={Loading03Icon} size={size} className="text-yellow-500" />
    case "ready":
      return <HugeiconsIcon icon={CheckmarkBadge01Icon} size={size} className="text-emerald-500" />
    case "shipped":
      return <HugeiconsIcon icon={Rocket01Icon} size={size} className="text-blue-500" />
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

function sortTaskDocs(tasks: TaskDoc[]) {
  return [...tasks].sort((a, b) => {
    const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if (statusDiff !== 0) return statusDiff
    return a.order - b.order
  })
}

function normalizeTaskOrders(tasks: TaskDoc[]) {
  const orderByStatus = new Map<Status, number>()
  return sortTaskDocs(tasks).map((task) => {
    const order = orderByStatus.get(task.status) ?? 0
    orderByStatus.set(task.status, order + 1)
    return task.order === order ? task : { ...task, order }
  })
}

function moveTaskDocs(tasks: TaskDoc[], taskId: string, toStatus: Status, toIndex: number) {
  const task = tasks.find((item) => item._id === taskId)
  if (!task) return tasks

  const withoutTask = tasks.filter((item) => item._id !== taskId)
  const targetTasks = withoutTask.filter((item) => item.status === toStatus)
  const clampedIndex = Math.min(toIndex, targetTasks.length)

  const targetIds = targetTasks.map((item) => item._id)
  targetIds.splice(clampedIndex, 0, task._id)

  const updated = withoutTask.map((item) => item)
  const insertedTask = { ...task, status: toStatus }

  const result: TaskDoc[] = []
  for (const column of COLUMNS) {
    if (column.id === toStatus) {
      for (const id of targetIds) {
        result.push(id === task._id ? insertedTask : updated.find((item) => item._id === id)!)
      }
      continue
    }

    for (const item of updated) {
      if (item.status === column.id) {
        result.push(item)
      }
    }
  }

  return normalizeTaskOrders(result)
}

function patchTaskDocs(
  tasks: TaskDoc[],
  taskId: string,
  updates: Partial<Pick<TaskDoc, "title" | "description" | "priority" | "labels">>
) {
  return tasks.map((task) => (task._id === taskId ? { ...task, ...updates } : task))
}

function mapTaskDoc(task: TaskDoc): Task {
  return {
    ...task,
    id: task._id,
    createdAt: formatTaskDate(task._creationTime, task.createdAtLabel),
  }
}

const SKELETON_GROUPS: { label: string; rows: number[] }[] = [
  { label: "Todo", rows: [180, 240, 150] },
  { label: "In Progress", rows: [200, 260] },
  { label: "Ready", rows: [170] },
  { label: "Shipped", rows: [220, 190] },
  { label: "Archive", rows: [] },
]

function BoardLoadingState() {
  return (
    <div className="h-full overflow-hidden">
      {SKELETON_GROUPS.map((group, gi) => (
        <div key={gi}>
          {/* Group header skeleton — matches ListGroup header */}
          <div className="flex items-center gap-2.5 bg-sidebar/60 px-4 py-2 dark:bg-accent/30">
            <span className="text-[10px] text-muted-foreground/60">▼</span>
            <div className="size-3.5 rounded-full bg-muted/70 animate-pulse" />
            <div className="h-3 rounded bg-muted/70 animate-pulse" style={{ width: group.label.length * 8 }} />
            <div className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-muted px-1.5">
              <div className="h-2 w-2 rounded bg-muted-foreground/20" />
            </div>
          </div>

          {/* Row skeletons — matches SortableListRow layout */}
          {group.rows.map((titleWidth, ri) => (
            <div
              key={ri}
              className="flex items-center gap-3 border-b border-l-2 border-border border-l-transparent px-4 py-2"
            >
              {/* Priority icon placeholder */}
              <div className="size-3.5 shrink-0 rounded bg-muted/60 animate-pulse" />
              {/* Status icon placeholder */}
              <div className="size-3.5 shrink-0 rounded-full bg-muted/60 animate-pulse" />
              {/* Title placeholder */}
              <div
                className="h-3 flex-1 rounded bg-muted/60 animate-pulse"
                style={{ maxWidth: titleWidth }}
              />
              {/* Label pill placeholder */}
              {ri % 2 === 0 && (
                <div className="h-4 w-14 shrink-0 rounded-full bg-muted/40 animate-pulse" />
              )}
              {/* Date placeholder */}
              <div className="h-2.5 w-12 shrink-0 rounded bg-muted/30 animate-pulse" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function EmptyBoardState({ onCreateTask }: { onCreateTask: () => void }) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
        className="w-full max-w-md rounded-[28px] border border-border/70 bg-gradient-to-b from-background to-sidebar/40 p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.12)]"
      >
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#0496FF]/10 text-[#0496FF]">
          <HugeiconsIcon icon={CheckmarkBadge01Icon} size={22} />
        </div>
        <h2 className="text-pretty text-xl font-semibold tracking-tight">No tasks yet</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This workspace starts empty now. Create your first task and the board will fill in immediately.
        </p>
        <button
          onClick={onCreateTask}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-[#0496FF] px-5 text-sm font-medium text-white transition-colors hover:bg-[#0496FF]/90"
        >
          Create first task
        </button>
      </motion.div>
    </div>
  )
}

// ── Hidden Columns Toolbar ──

function HiddenColumnsToolbar({
  hiddenColumns,
  onShow,
  tasks,
}: {
  hiddenColumns: Status[]
  onShow: (status: Status) => void
  tasks: Task[]
}) {
  const [selectedColumn, setSelectedColumn] = useState<Status | null>(null)

  if (hiddenColumns.length === 0) return null

  const selectedCol = selectedColumn ? COLUMNS.find((c) => c.id === selectedColumn) : null
  const selectedTasks = selectedColumn ? tasks.filter((t) => t.status === selectedColumn) : []

  return (
    <>
      <div className="flex items-center gap-1.5">
        <div className="mx-1.5 h-4 w-px bg-border" />
        <HugeiconsIcon icon={ViewOffIcon} size={13} className="text-muted-foreground" />
        {hiddenColumns.map((status) => {
          const col = COLUMNS.find((c) => c.id === status)
          if (!col) return null
          return (
            <button
              key={status}
              onClick={() => setSelectedColumn(status)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-sidebar px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground dark:bg-card"
            >
              {getStatusIcon(status, 12)}
              {col.label}
            </button>
          )
        })}
      </div>

      <Dialog open={selectedColumn !== null} onOpenChange={(open) => { if (!open) setSelectedColumn(null) }}>
        <DialogContent showCloseButton={false} className="max-h-[80vh] max-w-lg overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedColumn && getStatusIcon(selectedColumn, 16)}
                <DialogTitle>{selectedCol?.label ?? ""}</DialogTitle>
                <span className="text-xs text-muted-foreground">{selectedTasks.length} tasks</span>
              </div>
              <button
                onClick={() => {
                  if (selectedColumn) {
                    onShow(selectedColumn)
                    setSelectedColumn(null)
                  }
                }}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <HugeiconsIcon icon={ViewIcon} size={13} />
                Show column
              </button>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {selectedTasks.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                No tasks in this column
              </div>
            ) : (
              <div className="flex flex-col">
                {selectedTasks.map((task, index) => (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 border-b border-l-2 border-border px-3 py-2 transition-colors hover:bg-accent/40 last:border-b-0 ${PRIORITY_ACCENT[task.priority]}`}
                  >
                    <ListRowContent task={task} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Priority accent colors for left border ──
const PRIORITY_ACCENT: Record<Priority, string> = {
  urgent: "border-l-red-500",
  high: "border-l-orange-500",
  medium: "border-l-yellow-500",
  low: "border-l-blue-400",
  none: "border-l-transparent",
}

// ── Platform source config ──
const SOURCE_CONFIG: Record<RequestSource, { label: string; color: string; bg: string }> = {
  discord: { label: "Discord", color: "#5865F2", bg: "#5865F218" },
  slack: { label: "Slack", color: "#E01E5A", bg: "#E01E5A18" },
  x: { label: "X", color: "#8b8b8b", bg: "#8b8b8b18" },
}

function SourceIcon({ platform, size = 14 }: { platform: RequestSource; size?: number }) {
  const s = size
  if (platform === "discord") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="#5865F2">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/>
      </svg>
    )
  }
  if (platform === "slack") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
        <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
        <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.522 2.521 2.528 2.528 0 0 1-2.52-2.521V2.522A2.528 2.528 0 0 1 15.165 0a2.528 2.528 0 0 1 2.521 2.522v6.312z" fill="#2EB67D"/>
        <path d="M15.165 18.956a2.528 2.528 0 0 1 2.521 2.522A2.528 2.528 0 0 1 15.165 24a2.528 2.528 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.528 2.528 0 0 1-2.52-2.522 2.528 2.528 0 0 1 2.52-2.52h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.521h-6.313z" fill="#ECB22E"/>
      </svg>
    )
  }
  // X (Twitter)
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className="text-foreground">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}

// ── Request Row Component ──

const RequestRow = memo(function RequestRow({
  task,
  onAccept,
  onDeny,
  onSelect,
}: {
  task: Task
  onAccept: (task: Task) => void
  onDeny: (task: Task) => void
  onSelect: (task: Task) => void
}) {
  const source = task.source
  const config = source ? SOURCE_CONFIG[source.platform] : null
  const { colors: labelColors } = useLabelConfig()

  return (
    <div onClick={() => onSelect(task)} className="cursor-pointer rounded-lg border border-border bg-background p-3 transition-colors hover:border-border/80 hover:bg-accent/20 dark:bg-card">
      {/* Top row: source + date */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {source && config ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 rounded-full py-0.5 pl-1.5 pr-2.5 text-[10px] font-medium transition-opacity hover:opacity-80"
              style={{ backgroundColor: config.bg, color: config.color }}
              title={`View on ${config.label}`}
            >
              <SourceIcon platform={source.platform} size={12} />
              {source.author}
              <HugeiconsIcon icon={LinkSquare02Icon} size={9} className="opacity-60" />
            </a>
          ) : (
            <span className="text-[11px] text-muted-foreground/60">Request</span>
          )}
          {task.labels.map((label) => (
            <span
              key={label}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
              style={{
                backgroundColor: (labelColors[label] ?? "#6b7280") + "18",
                color: labelColors[label] ?? "#6b7280",
              }}
            >
              {label}
            </span>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground/50">{task.createdAt}</span>
      </div>

      {/* Title */}
      <p
        className="mb-3 text-[13px] font-medium leading-snug text-foreground/90"
      >
        {task.title}
      </p>

      {/* Actions — always visible */}
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onAccept(task) }}
          className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
        >
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} />
          Accept
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDeny(task) }}
          className="flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-500/20 dark:text-red-400"
        >
          <HugeiconsIcon icon={Cancel02Icon} size={12} />
          Deny
        </button>
      </div>
    </div>
  )
})

// ── Requests Group (non-draggable, distinct design) ──

function RequestsGroup({
  tasks,
  groupIndex,
  onAccept,
  onDeny,
  onSelectTask,
}: {
  tasks: Task[]
  groupIndex: number
  onAccept: (task: Task) => void
  onDeny: (task: Task) => void
  onSelectTask: (task: Task) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: groupIndex * 0.04, ease: "easeOut" }}
    >
      {/* Group header — distinct style */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2.5 border-b border-dashed border-border bg-sidebar/40 px-4 py-2 text-left transition-colors hover:bg-sidebar/70 dark:bg-accent/20 dark:hover:bg-accent/40"
      >
        <motion.span
          animate={{ rotate: collapsed ? -90 : 0 }}
          transition={{ duration: 0.15 }}
          className="text-[10px] text-muted-foreground/60"
        >
          ▼
        </motion.span>
        {getColumnIcon("requests")}
        <span className="text-[13px] font-semibold tracking-tight">Requests</span>
        <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">{tasks.length}</span>
        <span className="ml-1 text-[11px] text-muted-foreground/50">from users</span>
      </button>

      {/* Cards — no drag, no sortable context */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
              {tasks.map((task) => (
                <RequestRow
                  key={task.id}
                  task={task}
                  onAccept={onAccept}
                  onDeny={onDeny}
                  onSelect={onSelectTask}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Context Menu ──

function TaskContextMenu({
  task,
  position,
  onClose,
  onUpdate,
  onDelete,
}: {
  task: Task
  position: { x: number; y: number }
  onClose: () => void
  onUpdate: (taskId: string, updates: Partial<Task>) => void
  onDelete: (taskId: string) => void
}) {
  const labelConfig = useLabelConfig()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: globalThis.MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [onClose])

  function toggleLabel(label: Label) {
    const has = task.labels.includes(label)
    const updated = has ? task.labels.filter((l) => l !== label) : [...task.labels, label]
    onUpdate(task.id, { labels: updated })
  }

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[200px] rounded-lg p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 bg-popover/70 before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:rounded-[inherit] before:backdrop-blur-2xl before:backdrop-saturate-150"
      style={{ top: position.y, left: position.x }}
    >
      {/* Status */}
      <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Status</div>
      {ALL_STATUSES.map((s) => (
        <button
          key={s}
          onClick={() => { onUpdate(task.id, { status: s }); onClose() }}
          className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-accent ${task.status === s ? "font-medium" : ""}`}
        >
          {getStatusIcon(s, 14)}
          <span>{STATUS_LABELS[s]}</span>
          {task.status === s && <span className="ml-auto text-xs text-primary">✓</span>}
        </button>
      ))}

      <div className="-mx-1 my-1 h-px bg-border" />

      {/* Priority */}
      <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Priority</div>
      {ALL_PRIORITIES.map((p) => (
        <button
          key={p}
          onClick={() => { onUpdate(task.id, { priority: p }); onClose() }}
          className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-accent ${task.priority === p ? "font-medium" : ""}`}
        >
          {getPriorityIcon(p, 14)}
          <span>{PRIORITY_LABELS[p]}</span>
          {task.priority === p && <span className="ml-auto text-xs text-primary">✓</span>}
        </button>
      ))}

      <div className="-mx-1 my-1 h-px bg-border" />

      {/* Labels */}
      <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Labels</div>
      {labelConfig.names.map((label) => (
        <button
          key={label}
          onClick={() => toggleLabel(label)}
          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-sm capitalize transition-colors hover:bg-accent"
        >
          <div
            className="size-2.5 rounded-full"
            style={{ backgroundColor: labelConfig.colors[label] ?? "#888" }}
          />
          <span>{label}</span>
          {task.labels.includes(label) && <span className="ml-auto text-xs text-primary">✓</span>}
        </button>
      ))}

      <div className="-mx-1 my-1 h-px bg-border" />

      {/* Delete */}
      <button
        onClick={() => { onDelete(task.id); onClose() }}
        className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-sm text-destructive transition-colors hover:bg-destructive/10"
      >
        <HugeiconsIcon icon={Delete02Icon} size={14} />
        <span>Delete task</span>
      </button>
    </div>,
    document.body
  )
}

// ── List View Components ──

const ListRowContent = memo(function ListRowContent({ task }: { task: Task }) {
  const { colors: labelColors } = useLabelConfig()
  return (
    <>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground/50">{task.taskCode}</span>
      <div className="shrink-0">{getPriorityIcon(task.priority)}</div>
      <div className="shrink-0">{getStatusIcon(task.status)}</div>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground/90">{task.title}</span>
      <div className="flex shrink-0 items-center gap-1.5">
        {task.labels.map((label) => (
          <span
            key={label}
            className="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
            style={{
              backgroundColor: (labelColors[label] ?? "#888") + "18",
              color: labelColors[label] ?? "#888",
            }}
          >
            {label}
          </span>
        ))}
        <span className="ml-1 text-[11px] text-muted-foreground/60">{task.createdAt}</span>
      </div>
    </>
  )
})

const SortableListRow = memo(function SortableListRow({
  task,
  onSelect,
  onUpdate,
  onDelete,
}: {
  task: Task
  onSelect: (task: Task) => void
  onUpdate: (taskId: string, updates: Partial<Task>) => void
  onDelete: (taskId: string) => void
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", task },
    transition: SORTABLE_TRANSITION,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.3 : 1,
    willChange: transform ? "transform" : undefined,
  }

  const handleClick = useCallback(() => {
    onSelect(task)
  }, [onSelect, task])

  const handleContextMenu = useCallback((e: ReactMouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`group flex cursor-pointer touch-none items-center gap-3 border-b border-l-2 border-border bg-background px-4 py-2 select-none transition-all duration-150 hover:bg-accent/40 active:cursor-grabbing ${PRIORITY_ACCENT[task.priority]}`}
      >
        <ListRowContent task={task} />
      </div>
      {contextMenu && (
        <TaskContextMenu
          task={task}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      )}
    </>
  )
})

function DragOverlayListRow({ task }: { task: Task }) {
  return (
    <div className="flex w-fit max-w-sm items-center gap-2.5 rounded-lg border border-border/50 bg-background/95 px-3.5 py-2 shadow-2xl ring-1 ring-foreground/5 backdrop-blur-sm">
      <div className="shrink-0">{getStatusIcon(task.status, 13)}</div>
      <span className="truncate text-[13px] font-medium">{task.title}</span>
    </div>
  )
}

function ListGroup({
  column,
  tasks,
  groupIndex,
  isDropTarget,
  onSelectTask,
  onUpdateTask,
  onDeleteTask,
}: {
  column: (typeof COLUMNS)[number]
  tasks: Task[]
  groupIndex: number
  isDropTarget?: boolean
  onSelectTask: (task: Task) => void
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks])
  const { setNodeRef } = useDroppable({
    id: column.id,
    data: {
      type: "column",
      columnId: column.id,
    },
  })

  return (
    <motion.div
      ref={setNodeRef}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: groupIndex * 0.04, ease: "easeOut" }}
      style={isDropTarget ? { outline: "2px solid var(--primary)", outlineOffset: "-2px", borderRadius: "6px" } : undefined}
    >
      {/* Group header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2.5 bg-sidebar/60 px-4 py-2 text-left transition-colors hover:bg-sidebar dark:bg-accent/30 dark:hover:bg-accent/50"
      >
        <motion.span
          animate={{ rotate: collapsed ? -90 : 0 }}
          transition={{ duration: 0.15 }}
          className="text-[10px] text-muted-foreground/60"
        >
          ▼
        </motion.span>
        {getColumnIcon(column.id)}
        <span className="text-[13px] font-semibold tracking-tight">{column.label}</span>
        <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">{tasks.length}</span>
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
            <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
              {tasks.length === 0 ? null : (
                tasks.map((task) => (
                  <SortableListRow key={task.id} task={task} onSelect={onSelectTask} onUpdate={onUpdateTask} onDelete={onDeleteTask} />
                ))
              )}
            </SortableContext>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Task Detail Modal ──

// "requests" excluded — requests are user-submitted and managed via accept/deny only
const ALL_STATUSES: Status[] = ["todo", "in_progress", "ready", "shipped", "archive"]
const ALL_PRIORITIES: Priority[] = ["urgent", "high", "medium", "low", "none"]
// ALL_LABELS is now dynamic from workspace config via LabelConfigContext

const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
}

function TaskDetailModal({
  task,
  onClose,
  onUpdate,
  onDelete,
}: {
  task: Task | null
  onClose: () => void
  onUpdate: (taskId: string, updates: Partial<Task>) => void
  onDelete: (taskId: string) => void
}) {
  const labelConfig = useLabelConfig()
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState("")
  const [editingDesc, setEditingDesc] = useState(false)
  const [descValue, setDescValue] = useState("")

  function handleTitleSave() {
    if (task && titleValue.trim() && titleValue !== task.title) {
      onUpdate(task.id, { title: titleValue.trim() })
    }
    setEditingTitle(false)
  }

  function handleDescSave() {
    if (task && descValue !== (task.description ?? "")) {
      onUpdate(task.id, { description: descValue })
    }
    setEditingDesc(false)
  }

  function toggleLabel(label: Label) {
    if (!task) return
    const has = task.labels.includes(label)
    const updated = has ? task.labels.filter((l) => l !== label) : [...task.labels, label]
    onUpdate(task.id, { labels: updated })
  }

  return (
    <Dialog open={task !== null} onOpenChange={(open) => { if (!open) { setEditingTitle(false); setEditingDesc(false); onClose() } }}>
      <DialogContent showCloseButton={false} className="max-h-[85vh] max-w-xl overflow-hidden p-0">
        {task && (
          <div className="flex flex-col">
            {/* Top bar */}
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs font-medium text-muted-foreground">{task.taskCode}</span>
                <span className="text-muted-foreground/30">·</span>
                <span className="text-xs text-muted-foreground/60">{task.createdAt}</span>
                {task.source && (() => {
                  const cfg = SOURCE_CONFIG[task.source!.platform]
                  return (
                    <>
                      <span className="text-muted-foreground/30">·</span>
                      <a
                        href={task.source!.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-full py-0.5 pl-1.5 pr-2.5 text-[10px] font-medium transition-opacity hover:opacity-80"
                        style={{ backgroundColor: cfg.bg, color: cfg.color }}
                      >
                        <SourceIcon platform={task.source!.platform} size={11} />
                        <span>{task.source!.author}</span>
                        <HugeiconsIcon icon={LinkSquare02Icon} size={10} />
                      </a>
                    </>
                  )
                })()}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onDelete(task.id)}
                  className="rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  title="Delete task"
                >
                  <HugeiconsIcon icon={Delete02Icon} size={14} />
                </button>
                <button
                  onClick={onClose}
                  className="rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={14} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex flex-col gap-5 px-5 pt-5 pb-6">
              {/* Title */}
              <DialogHeader>
                <DialogTitle className="sr-only">{task.title}</DialogTitle>
                {editingTitle ? (
                  <input
                    autoFocus
                    value={titleValue}
                    onChange={(e) => setTitleValue(e.target.value)}
                    onBlur={handleTitleSave}
                    onKeyDown={(e) => { if (e.key === "Enter") handleTitleSave(); if (e.key === "Escape") { setTitleValue(task.title); setEditingTitle(false) } }}
                    className="w-full rounded-md border border-border bg-transparent px-1 py-0.5 text-base font-semibold leading-snug tracking-tight outline-none focus:ring-1 focus:ring-primary"
                  />
                ) : (
                  <h2
                    onClick={() => { setTitleValue(task.title); setEditingTitle(true) }}
                    className="-mx-1 cursor-text rounded-md px-1 py-0.5 text-base font-semibold leading-snug tracking-tight transition-colors hover:bg-accent/50"
                  >
                    {task.title}
                  </h2>
                )}
              </DialogHeader>

              {/* Properties row */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Status */}
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent">
                    {getStatusIcon(task.status, 13)}
                    <span>{STATUS_LABELS[task.status]}</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="bottom" align="start">
                    {ALL_STATUSES.map((s) => (
                      <DropdownMenuItem
                        key={s}
                        className={task.status === s ? "font-medium" : ""}
                        onSelect={() => onUpdate(task.id, { status: s })}
                      >
                        <div className="flex items-center gap-2">
                          {getStatusIcon(s, 14)}
                          <span>{STATUS_LABELS[s]}</span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Priority */}
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent">
                    {getPriorityIcon(task.priority, 13)}
                    <span>{PRIORITY_LABELS[task.priority]}</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="bottom" align="start">
                    {ALL_PRIORITIES.map((p) => (
                      <DropdownMenuItem
                        key={p}
                        className={task.priority === p ? "font-medium" : ""}
                        onSelect={() => onUpdate(task.id, { priority: p })}
                      >
                        <div className="flex items-center gap-2">
                          {getPriorityIcon(p, 14)}
                          <span>{PRIORITY_LABELS[p]}</span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Labels */}
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent">
                    {task.labels.length > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <div className="flex -space-x-0.5">
                          {task.labels.map((label) => (
                            <div
                              key={label}
                              className="size-2.5 rounded-full ring-1 ring-background"
                              style={{ backgroundColor: labelConfig.colors[label] ?? "#888" }}
                            />
                          ))}
                        </div>
                        <span>{task.labels.length === 1 ? task.labels[0] : `${task.labels.length} labels`}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Add label</span>
                    )}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="bottom" align="start">
                    {labelConfig.names.map((label) => (
                      <DropdownMenuItem
                        key={label}
                        onSelect={() => toggleLabel(label)}
                      >
                        <div className="flex w-full items-center gap-2 capitalize">
                          <div
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: labelConfig.colors[label] ?? "#888" }}
                          />
                          <span>{label}</span>
                          {task.labels.includes(label) && (
                            <span className="ml-auto text-xs text-primary">✓</span>
                          )}
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Divider */}
              <div className="h-px bg-border" />

              {/* Description */}
              <div>
                <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Description</span>
                {editingDesc ? (
                  <textarea
                    autoFocus
                    value={descValue}
                    onChange={(e) => setDescValue(e.target.value)}
                    onBlur={handleDescSave}
                    onKeyDown={(e) => { if (e.key === "Escape") { setDescValue(task.description ?? ""); setEditingDesc(false) } }}
                    placeholder="Write something..."
                    className="min-h-[100px] w-full resize-none rounded-md border border-border bg-transparent px-2 py-1.5 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-primary"
                  />
                ) : (
                  <div
                    onClick={() => { setDescValue(task.description ?? ""); setEditingDesc(true) }}
                    className="-mx-2 cursor-text rounded-md px-2 py-1.5 text-sm leading-relaxed transition-colors hover:bg-accent/40"
                  >
                    {task.description ? (
                      <span className="text-foreground/80">{task.description}</span>
                    ) : (
                      <span className="text-muted-foreground/50">Write something...</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ListView({
  tasks,
  hiddenColumns,
  onMoveTask,
  onUpdateTask,
  onDeleteTask,
  onAcceptRequest,
  onDenyRequest,
}: {
  tasks: Task[]
  hiddenColumns: Status[]
  onMoveTask: (taskId: string, toStatus: Status, toIndex: number) => void
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
  onAcceptRequest: (task: Task) => void
  onDenyRequest: (task: Task) => void
}) {
  // Non-request columns only for DnD
  const visibleColumns = COLUMNS.filter((c) => !hiddenColumns.includes(c.id) && c.id !== "requests")
  const showRequests = !hiddenColumns.includes("requests")
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [overColumn, setOverColumn] = useState<Status | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  const selectedTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null

  const handleSelectTask = useCallback((task: Task) => {
    setSelectedTaskId(task.id)
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  const tasksByColumn = useMemo(() => {
    const map: Record<Status, Task[]> = {
      requests: [],
      todo: [],
      in_progress: [],
      ready: [],
      shipped: [],
      archive: [],
    }
    for (const task of tasks) {
      map[task.status].push(task)
    }
    return map
  }, [tasks])

  function findColumnOfTask(taskId: string): Status | null {
    for (const col of COLUMNS) {
      if (tasksByColumn[col.id].some((t) => t.id === taskId)) {
        return col.id
      }
    }
    return null
  }

  function handleDragStart(event: DragStartEvent) {
    const task = event.active.data.current?.task as Task | undefined
    if (task) setActiveTask(task)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) {
      setOverColumn(null)
      return
    }

    const overId = over.id as string
    const targetCol =
      over.data.current?.type === "column"
        ? (over.id as Status)
        : findColumnOfTask(overId)

    // Block dragging into requests
    if (targetCol === "requests") {
      setOverColumn(null)
      return
    }

    setOverColumn((current) => (current === targetCol ? current : targetCol))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveTask(null)
    setOverColumn(null)

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeColumn = findColumnOfTask(activeId)
    const targetColumn =
      over.data.current?.type === "column"
        ? (over.id as Status)
        : findColumnOfTask(overId)

    if (!activeColumn || !targetColumn) return

    // Block dragging into requests
    if (targetColumn === "requests") return

    if (over.data.current?.type === "column") {
      onMoveTask(activeId, targetColumn, tasksByColumn[targetColumn].length)
      return
    }

    if (activeColumn === targetColumn) {
      const columnTasks = tasksByColumn[activeColumn]
      const oldIndex = columnTasks.findIndex((t) => t.id === activeId)
      const newIndex = columnTasks.findIndex((t) => t.id === overId)
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        onMoveTask(activeId, activeColumn, newIndex)
      }
    } else {
      onMoveTask(activeId, targetColumn, 0)
    }
  }

  const activeTaskSource = activeTask ? activeTask.status : null

  return (
  <>
    <DndContext
      sensors={sensors}
      collisionDetection={(args) => {
        const pointerIntersections = pointerWithin(args)
        if (pointerIntersections.length > 0) {
          return pointerIntersections
        }
        return closestCenter(args)
      }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full overflow-y-auto scrollbar-hide">
        {/* Requests group — rendered separately, outside DnD sortable */}
        {showRequests && tasksByColumn.requests.length > 0 && (
          <RequestsGroup
            tasks={tasksByColumn.requests}
            groupIndex={0}
            onAccept={onAcceptRequest}
            onDeny={onDenyRequest}
            onSelectTask={handleSelectTask}
          />
        )}

        {/* Regular columns with DnD */}
        {visibleColumns.map((column, groupIndex) => {
          const columnTasks = tasksByColumn[column.id]
          return (
            <ListGroup
              key={column.id}
              column={column}
              tasks={columnTasks}
              groupIndex={showRequests ? groupIndex + 1 : groupIndex}
              isDropTarget={overColumn === column.id && activeTaskSource !== null && activeTaskSource !== column.id}
              onSelectTask={handleSelectTask}
              onUpdateTask={onUpdateTask}
              onDeleteTask={onDeleteTask}
            />
          )
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? <DragOverlayListRow task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>

    <TaskDetailModal
      task={selectedTask}
      onClose={() => setSelectedTaskId(null)}
      onUpdate={onUpdateTask}
      onDelete={(taskId) => { onDeleteTask(taskId); setSelectedTaskId(null) }}
    />
  </>
  )
}

// ── Main Component ──

export function KanbanBoard() {
  const convex = useConvex()
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth()
  const { currentWorkspace } = useWorkspace()
  const { tasksByWorkspace } = useLocalFirstStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDefaultStatus, setModalDefaultStatus] = useState<Status>("todo")
  const [hiddenColumns, setHiddenColumns] = useState<Status[]>([])
  const [isCleaningDemoTasks, setIsCleaningDemoTasks] = useState(false)
  const [hasFetchedTasks, setHasFetchedTasks] = useState(false)
  const cleanedWorkspaceIds = useState(() => new Set<string>())[0]
  const lastLoadedWorkspaceIdRef = useRef<string | null>(null)

  const workspaceId = currentWorkspace?._id
  const taskDocs = workspaceId ? tasksByWorkspace[workspaceId] : undefined

  const clearDemoTasks = useMutation(api.tasks.clearDemoTasks)
  const updateTask = useMutation(api.tasks.updateTask)
  const deleteTask = useMutation(api.tasks.deleteTask)
  const reorderTasks = useMutation(api.tasks.reorderTasks)

  useEffect(() => {
    if (workspaceId !== lastLoadedWorkspaceIdRef.current) {
      setHasFetchedTasks(false)
      lastLoadedWorkspaceIdRef.current = workspaceId ?? null
    }
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId || isAuthLoading || !isAuthenticated) {
      return
    }

    const activeWorkspaceId = workspaceId
    let cancelled = false

    async function refreshTasks() {
      try {
        const nextTasks = (await convex.query(api.tasks.listByWorkspace, {
          workspaceId: activeWorkspaceId,
        })) as Doc<"tasks">[]

        if (cancelled) {
          return
        }

        setWorkspaceTasks(activeWorkspaceId, nextTasks)
      } finally {
        if (!cancelled) {
          setHasFetchedTasks(true)
        }
      }
    }

    void refreshTasks()

    return () => {
      cancelled = true
    }
  }, [convex, isAuthLoading, isAuthenticated, workspaceId])

  useEffect(() => {
    if (!workspaceId || taskDocs === undefined || !isDemoTaskSet(taskDocs)) {
      setIsCleaningDemoTasks(false)
      return
    }

    if (cleanedWorkspaceIds.has(workspaceId)) return
    cleanedWorkspaceIds.add(workspaceId)

    let cancelled = false
    setIsCleaningDemoTasks(true)
    setWorkspaceTasks(workspaceId, [])
    void clearDemoTasks({ workspaceId }).finally(() => {
      if (!cancelled) setIsCleaningDemoTasks(false)
    })

    return () => {
      cancelled = true
    }
  }, [cleanedWorkspaceIds, clearDemoTasks, taskDocs, workspaceId])

  const tasks = useMemo(() => (taskDocs ?? []).map(mapTaskDoc), [taskDocs])

  function handleAddTask(status: Status) {
    setModalDefaultStatus(status)
    setModalOpen(true)
  }

  function handleShowColumn(status: Status) {
    setHiddenColumns((prev) => prev.filter((s) => s !== status))
  }

  function handleAcceptRequest(task: Task) {
    if (!workspaceId || !taskDocs) return
    const nextTasks = moveTaskDocs(taskDocs, task.id, "todo", 0)
    setWorkspaceTasks(workspaceId, nextTasks)
    void reorderTasks({
      workspaceId,
      changes: nextTasks.map((item) => ({
        taskId: item._id as Id<"tasks">,
        status: item.status,
        order: item.order,
      })),
    })
  }

  function handleDenyRequest(task: Task) {
    if (task.id.startsWith("optimistic:")) return
    if (workspaceId) {
      updateWorkspaceTasks(workspaceId, (tasks) => tasks.filter((item) => item._id !== task.id))
    }
    void deleteTask({ taskId: task.id as Id<"tasks"> })
  }

  function handleUpdateTask(taskId: string, updates: Partial<Task>) {
    if (!workspaceId || !taskDocs) return

    if (updates.status) {
      const currentTask = taskDocs.find((task) => task._id === taskId)
      if (!currentTask) return

      const targetIndex = taskDocs.filter((task) => task.status === updates.status).length
      const nextTasks = moveTaskDocs(taskDocs, taskId, updates.status, targetIndex)
      setWorkspaceTasks(workspaceId, nextTasks)
      void reorderTasks({
        workspaceId,
        changes: nextTasks.map((item) => ({
          taskId: item._id as Id<"tasks">,
          status: item.status,
          order: item.order,
        })),
      })
      return
    }

    if (taskId.startsWith("optimistic:")) return

    updateWorkspaceTasks(workspaceId, (tasks) =>
      patchTaskDocs(tasks, taskId, {
        title: updates.title,
        description: updates.description,
        priority: updates.priority,
        labels: updates.labels,
      })
    )

    void updateTask({
      taskId: taskId as Id<"tasks">,
      title: updates.title,
      description: updates.description,
      priority: updates.priority,
      labels: updates.labels,
    })
  }

  function handleDeleteTask(taskId: string) {
    if (!workspaceId || !taskDocs || taskId.startsWith("optimistic:")) return

    updateWorkspaceTasks(workspaceId, (tasks) =>
      tasks.filter((t) => t._id !== taskId)
    )

    void deleteTask({ taskId: taskId as Id<"tasks"> })
  }

  function handleMoveTask(taskId: string, toStatus: Status, toIndex: number) {
    if (!workspaceId || !taskDocs || taskId.startsWith("optimistic:")) return

    const nextTasks = moveTaskDocs(taskDocs, taskId, toStatus, toIndex)
    setWorkspaceTasks(workspaceId, nextTasks)
    void reorderTasks({
      workspaceId,
      changes: nextTasks.map((item) => ({
        taskId: item._id as Id<"tasks">,
        status: item.status,
        order: item.order,
      })),
    })
  }

  const labelConfig = useMemo<LabelConfig>(() => {
    const wsLabels = currentWorkspace?.labels
    const labels = wsLabels && wsLabels.length > 0 ? wsLabels : DEFAULT_WORKSPACE_LABELS
    return {
      names: labels.map((l) => l.name),
      colors: buildLabelColors(labels),
    }
  }, [currentWorkspace?.labels])

  if (
    !workspaceId ||
    (taskDocs === undefined && (isAuthLoading || !hasFetchedTasks || isCleaningDemoTasks))
  ) {
    return <BoardLoadingState />
  }

  return (
    <LabelConfigContext.Provider value={labelConfig}>
    <div className="flex h-full flex-col">
      {/* Toolbar - only render when there are hidden columns */}
      <AnimatePresence>
        {hiddenColumns.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-1 overflow-hidden px-4 pb-2"
          >
            <HiddenColumnsToolbar
              hiddenColumns={hiddenColumns}
              onShow={handleShowColumn}
              tasks={tasks}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="min-h-0 flex-1">
        <ListView
          tasks={tasks}
          hiddenColumns={hiddenColumns}
          onMoveTask={handleMoveTask}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onAcceptRequest={handleAcceptRequest}
          onDenyRequest={handleDenyRequest}
        />
      </div>

      {/* New task modal */}
      <NewTaskModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        defaultStatus={modalDefaultStatus}
      />
    </div>
    </LabelConfigContext.Provider>
  )
}
