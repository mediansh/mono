"use client"

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import {
  CellSignalFull,
  CellSignalMedium,
  CellSignalLow,
  Circle,
  SpinnerGap,
  SealCheck,
  Archive,
  WarningCircle,
  Rocket,
  EyeSlash,
  Eye,
  CheckCircle,
  XCircle,
  Link as LinkIcon,
  Trash,
  Tag,
  Check,
  Minus,
  ListBullets,
  SquaresFour,
} from "@phosphor-icons/react"
import { NewTaskModal } from "@/components/new-task-modal"
import {
  TaskAttachmentGallery,
  type TaskAttachment,
} from "@/components/task-attachments"
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
import { X } from "@phosphor-icons/react"
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
  type DragMoveEvent,
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
  getLocalFirstStoreSnapshot,
  setCollapsedWorkspaceColumns,
  setWorkspaceBoardView,
  setWorkspaceTasks,
  updateWorkspaceTasks,
  useLocalFirstStore,
  type BoardView,
  type LocalTaskDoc as TaskDoc,
} from "@/lib/local-first-store"
import { hasTaskWritePermission } from "@/lib/workspace-permissions"
import { useSearchPaletteTaskEvent } from "@/components/search-palette"
import {
  trackTaskUpdated,
  trackTaskDeleted,
  trackTaskMoved,
  trackTasksBulkUpdated,
  trackTasksBulkDeleted,
  trackRequestAccepted,
  trackRequestDenied,
  trackColumnToggled,
  trackNewTaskModalOpened,
} from "@/lib/analytics"

interface Task extends Omit<TaskDoc, "attachments"> {
  id: string
  createdAt: string
  attachments?: TaskAttachment[]
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
function buildLabelColors(
  workspaceLabels?: { name: string; color: string }[]
): Record<string, string> {
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
function useLabelConfig() {
  return useContext(LabelConfigContext)
}

const BoardMountedContext = createContext(false)
function useBoardMounted() {
  return useContext(BoardMountedContext)
}

const STATUS_LABELS = TASK_STATUS_LABELS

const SORTABLE_TRANSITION = null

function getStatusIcon(status: Status, size = 14) {
  switch (status) {
    case "requests":
      return <SpinnerGap size={size} className="text-muted-foreground" />
    case "todo":
      return <Circle size={size} className="text-muted-foreground" />
    case "in_progress":
      return <SpinnerGap size={size} className="text-yellow-500" />
    case "ready":
      return (
        <SealCheck size={size} weight="fill" className="text-emerald-500" />
      )
    case "shipped":
      return <Rocket size={size} weight="fill" className="text-blue-500" />
    case "archive":
      return <Archive size={size} className="text-muted-foreground" />
  }
}

const AGENT_ICONS: Record<string, string> = {
  "claude-code": "⚡",
  codex: "🔮",
  cursor: "▸",
  copilot: "●",
  windsurf: "🏄",
  gemini: "♦",
  cline: "◆",
}

function getActiveAgent(task: Task): string | null {
  if (task.status !== "in_progress") return null
  if (
    !task.source ||
    task.source.platform !== "cli" ||
    task.source.author === "cli" ||
    !task.source.author
  )
    return null
  return task.source.author
}

function getAgentIcon(agentName: string): string {
  return AGENT_ICONS[agentName.toLowerCase().trim()] ?? "🤖"
}

function getColumnIcon(status: Status) {
  return getStatusIcon(status, 15)
}

function getPriorityIcon(priority: Priority, size = 14) {
  switch (priority) {
    case "urgent":
      return (
        <WarningCircle size={size} weight="fill" className="text-red-500" />
      )
    case "high":
      return <CellSignalFull size={size} className="text-orange-500" />
    case "medium":
      return <CellSignalMedium size={size} className="text-yellow-500" />
    case "low":
      return <CellSignalLow size={size} className="text-blue-400" />
    case "none":
      return <Minus size={size} className="text-muted-foreground" />
  }
}

function isDevTask(id: string) {
  return id.startsWith("dev_task_")
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

function moveTaskDocs(
  tasks: TaskDoc[],
  taskId: string,
  toStatus: Status,
  toIndex: number
) {
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
        result.push(
          id === task._id
            ? insertedTask
            : updated.find((item) => item._id === id)!
        )
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
  updates: Partial<
    Pick<
      TaskDoc,
      | "title"
      | "description"
      | "priority"
      | "labels"
      | "attachments"
      | "_syncStatus"
    >
  >
) {
  const defined = Object.fromEntries(
    Object.entries(updates).filter(
      ([key, value]) => key === "_syncStatus" || value !== undefined
    )
  )
  return tasks.map((task) =>
    task._id === taskId ? { ...task, ...defined } : task
  )
}

function mergeAttachmentMetadata(
  liveAttachments: TaskDoc["attachments"],
  currentAttachments: TaskDoc["attachments"]
) {
  if (!liveAttachments?.length || !currentAttachments?.length) {
    return liveAttachments
  }

  const currentAttachmentsById = new Map(
    currentAttachments.map((attachment) => [
      String(attachment.storageId),
      attachment,
    ])
  )
  let didHydrateMetadata = false

  const mergedAttachments = liveAttachments.map((attachment) => {
    const currentAttachment = currentAttachmentsById.get(
      String(attachment.storageId)
    )
    if (!currentAttachment) {
      return attachment
    }

    const nextAttachment = {
      ...attachment,
      width: attachment.width ?? currentAttachment.width,
      height: attachment.height ?? currentAttachment.height,
      displayWidth: attachment.displayWidth ?? currentAttachment.displayWidth,
    }

    if (
      nextAttachment.width !== attachment.width ||
      nextAttachment.height !== attachment.height ||
      nextAttachment.displayWidth !== attachment.displayWidth
    ) {
      didHydrateMetadata = true
    }

    return nextAttachment
  })

  return didHydrateMetadata ? mergedAttachments : liveAttachments
}

function mergeLiveTaskDocs(
  currentTasks: TaskDoc[] | undefined,
  liveTasks: Doc<"tasks">[]
) {
  const currentTasksById = new Map(
    (currentTasks ?? []).map((task) => [task._id, task])
  )
  const liveTaskIds = new Set(liveTasks.map((task) => String(task._id)))
  const pendingTasks = (currentTasks ?? []).filter(
    (task) => task._syncStatus === "pending" && !liveTaskIds.has(task._id)
  )

  const mergedLiveTasks = liveTasks.map((liveTask) => {
    const currentTask = currentTasksById.get(String(liveTask._id))
    const mergedAttachments = mergeAttachmentMetadata(
      (liveTask as TaskDoc).attachments,
      currentTask?.attachments
    )
    if (
      currentTask?._syncStatus === "error" &&
      JSON.stringify(currentTask.attachments ?? null) !==
        JSON.stringify((liveTask as TaskDoc).attachments ?? null)
    ) {
      return {
        ...liveTask,
        attachments: currentTask.attachments,
        _syncStatus: "error" as const,
      }
    }

    if (mergedAttachments !== (liveTask as TaskDoc).attachments) {
      return {
        ...liveTask,
        attachments: mergedAttachments,
      }
    }

    return liveTask
  })

  return sortTaskDocs([...mergedLiveTasks, ...pendingTasks])
}

function areTaskDocListsEqual(left: TaskDoc[] | undefined, right: TaskDoc[]) {
  if (!left || left.length !== right.length) return false

  for (let index = 0; index < left.length; index += 1) {
    const current = left[index]
    const next = right[index]
    if (!current || !next) return false

    if (
      current._id !== next._id ||
      current._creationTime !== next._creationTime ||
      current.title !== next.title ||
      current.description !== next.description ||
      current.status !== next.status ||
      current.priority !== next.priority ||
      current.order !== next.order ||
      current.taskCode !== next.taskCode ||
      current.taskNumber !== next.taskNumber ||
      current.project !== next.project ||
      current.createdAtLabel !== next.createdAtLabel ||
      current._syncStatus !== next._syncStatus ||
      JSON.stringify(current.assignee ?? null) !==
        JSON.stringify(next.assignee ?? null) ||
      JSON.stringify(current.source ?? null) !==
        JSON.stringify(next.source ?? null) ||
      JSON.stringify(current.sources ?? null) !==
        JSON.stringify(next.sources ?? null) ||
      JSON.stringify(current.attachments ?? null) !==
        JSON.stringify(next.attachments ?? null) ||
      JSON.stringify(current.labels) !== JSON.stringify(next.labels)
    ) {
      return false
    }
  }

  return true
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
    <div className="h-full overflow-hidden px-3 py-2">
      {SKELETON_GROUPS.map((group, gi) => (
        <div
          key={gi}
          className="mb-1.5 overflow-hidden rounded-[4px] ring-1 ring-border"
        >
          {/* Group header skeleton — matches ListGroup header */}
          <div className="flex items-center gap-2.5 bg-card px-3 py-1.5">
            <span className="text-[10px] text-muted-foreground/60">▼</span>
            <div className="size-3.5 animate-pulse rounded-[4px] bg-muted/70" />
            <div
              className="h-3 animate-pulse rounded-[4px] bg-muted/70"
              style={{ width: group.label.length * 8 }}
            />
            <div className="flex h-4.5 min-w-4.5 items-center justify-center rounded-[4px] bg-muted px-1.5">
              <div className="h-2 w-2 rounded-[4px] bg-muted-foreground/20" />
            </div>
          </div>

          {/* Row skeletons — matches SortableListRow layout */}
          {group.rows.map((titleWidth, ri) => (
            <div
              key={ri}
              className="flex items-center gap-3 border-b border-l-2 border-border border-l-transparent px-3 py-2"
            >
              {/* Priority icon placeholder */}
              <div className="size-3.5 shrink-0 animate-pulse rounded-[4px] bg-muted/60" />
              {/* Status icon placeholder */}
              <div className="size-3.5 shrink-0 animate-pulse rounded-[4px] bg-muted/60" />
              {/* Title placeholder */}
              <div
                className="h-3 flex-1 animate-pulse rounded-[4px] bg-muted/60"
                style={{ maxWidth: titleWidth }}
              />
              {/* Label pill placeholder */}
              {ri % 2 === 0 && (
                <div className="h-4 w-14 shrink-0 animate-pulse rounded-[4px] bg-muted/40" />
              )}
              {/* Date placeholder */}
              <div className="h-2.5 w-12 shrink-0 animate-pulse rounded-[4px] bg-muted/30" />
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
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-sm rounded-[4px] bg-card p-5 text-center ring-1 ring-border"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
          className="mx-auto mb-4 flex size-12 items-center justify-center rounded-[4px] bg-accent text-foreground"
        >
          <SealCheck size={22} weight="fill" />
        </motion.div>
        <h2 className="text-[14px] font-semibold tracking-tight text-pretty">
          No tasks yet
        </h2>
        <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
          This workspace starts empty now. Create your first task and the board
          will fill in immediately.
        </p>
        <button
          onClick={onCreateTask}
          className="mt-6 inline-flex h-8 items-center justify-center rounded-[4px] bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
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

  const selectedCol = selectedColumn
    ? COLUMNS.find((c) => c.id === selectedColumn)
    : null
  const selectedTasks = selectedColumn
    ? tasks.filter((t) => t.status === selectedColumn)
    : []

  return (
    <>
      <div className="flex items-center gap-1.5">
        <div className="mx-1.5 h-4 w-px bg-border" />
        <EyeSlash size={13} className="text-muted-foreground" />
        {hiddenColumns.map((status) => {
          const col = COLUMNS.find((c) => c.id === status)
          if (!col) return null
          return (
            <button
              key={status}
              onClick={() => setSelectedColumn(status)}
              className="flex items-center gap-1.5 rounded-[4px] bg-sidebar px-2 py-1 text-[12px] text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground dark:bg-card"
            >
              {getStatusIcon(status, 12)}
              {col.label}
            </button>
          )
        })}
      </div>

      <Dialog
        open={selectedColumn !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedColumn(null)
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[80vh] max-w-lg flex-col overflow-hidden"
        >
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedColumn && getStatusIcon(selectedColumn, 16)}
                <DialogTitle>{selectedCol?.label ?? ""}</DialogTitle>
                <span className="text-[12px] text-muted-foreground">
                  {selectedTasks.length} tasks
                </span>
              </div>
              <button
                onClick={() => {
                  if (selectedColumn) {
                    onShow(selectedColumn)
                    setSelectedColumn(null)
                  }
                }}
                className="flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground"
              >
                <Eye size={13} />
                Show column
              </button>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {selectedTasks.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-[13px] text-muted-foreground">
                No tasks in this column
              </div>
            ) : (
              <div className="flex flex-col">
                {selectedTasks.map((task, index) => (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 border-b border-l-2 border-border px-3 py-2 transition-colors last:border-b-0 hover:bg-accent/40 ${PRIORITY_ACCENT[task.priority]}`}
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
const SOURCE_CONFIG: Record<
  RequestSource,
  { label: string; color: string; bg: string }
> = {
  discord: { label: "Discord", color: "#5865F2", bg: "#5865F218" },
  github: { label: "GitHub", color: "#111827", bg: "#11182718" },
  linear: { label: "Linear", color: "#5E6AD2", bg: "#5E6AD218" },
  slack: { label: "Slack", color: "#E01E5A", bg: "#E01E5A18" },
  x: { label: "X", color: "#8b8b8b", bg: "#8b8b8b18" },
  cli: { label: "CLI", color: "#22c55e", bg: "#22c55e18" },
}

function getTaskSources(task: Pick<Task, "source" | "sources">) {
  const sources = task.sources?.length
    ? task.sources
    : task.source
      ? [task.source]
      : []
  const seen = new Set<string>()

  return sources.filter((source) => {
    const key = `${source.platform}:${source.url}:${source.author}`
    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function SourceIcon({
  platform,
  size = 14,
}: {
  platform: RequestSource
  size?: number
}) {
  const s = size
  if (platform === "discord") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="#5865F2">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
      </svg>
    )
  }
  if (platform === "slack") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path
          d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"
          fill="#E01E5A"
        />
        <path
          d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"
          fill="#36C5F0"
        />
        <path
          d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.522 2.521 2.528 2.528 0 0 1-2.52-2.521V2.522A2.528 2.528 0 0 1 15.165 0a2.528 2.528 0 0 1 2.521 2.522v6.312z"
          fill="#2EB67D"
        />
        <path
          d="M15.165 18.956a2.528 2.528 0 0 1 2.521 2.522A2.528 2.528 0 0 1 15.165 24a2.528 2.528 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.528 2.528 0 0 1-2.52-2.522 2.528 2.528 0 0 1 2.52-2.52h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.521h-6.313z"
          fill="#ECB22E"
        />
      </svg>
    )
  }
  if (platform === "linear") {
    return (
      <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
        <path
          fill="#5E6AD2"
          d="M1.225 61.523c-.222-.949.908-1.546 1.597-.857l36.512 36.512c.69.69.092 1.82-.857 1.597-18.425-4.323-32.93-18.827-37.252-37.252ZM.002 46.889a.99.99 0 0 0 .29.76L52.35 99.71c.201.2.478.307.76.29 2.37-.149 4.695-.46 6.963-.927.765-.157 1.03-1.096.478-1.648L2.576 39.448c-.552-.551-1.491-.286-1.648.479a50.067 50.067 0 0 0-.926 6.962ZM4.21 29.705a.988.988 0 0 0 .208 1.1l64.776 64.776c.289.29.726.375 1.1.208a49.908 49.908 0 0 0 5.185-2.684.981.981 0 0 0 .183-1.54L8.436 24.336a.981.981 0 0 0-1.541.183 49.896 49.896 0 0 0-2.684 5.185Zm8.448-11.631a.986.986 0 0 1-.045-1.354C21.78 6.46 35.111 0 49.952 0 77.592 0 100 22.407 100 50.048c0 14.84-6.46 28.172-16.72 37.338a.986.986 0 0 1-1.354-.045L12.659 18.074Z"
        />
      </svg>
    )
  }
  if (platform === "github") {
    return (
      <svg
        width={s}
        height={s}
        viewBox="0 0 24 24"
        fill="currentColor"
        className="text-foreground"
      >
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    )
  }
  if (platform === "cli") {
    return (
      <svg
        width={s}
        height={s}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#22c55e"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    )
  }
  // X (Twitter)
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="currentColor"
      className="text-foreground"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

// ── Request Row Component ──

const RequestRow = memo(function RequestRow({
  task,
  dismissed,
  onAccept,
  onDeny,
  onSelect,
  canManageTasks,
}: {
  task: Task
  dismissed: boolean
  onAccept: (task: Task) => void
  onDeny: (task: Task) => void
  onSelect: (task: Task) => void
  canManageTasks: boolean
}) {
  const sources = getTaskSources(task)
  const { colors: labelColors } = useLabelConfig()

  if (dismissed) {
    return <div className="invisible" aria-hidden />
  }

  return (
    <div
      onClick={() => onSelect(task)}
      className="cursor-pointer rounded-[4px] bg-background p-3 ring-1 ring-border transition-colors hover:border-border/80 hover:bg-accent/20 dark:bg-card"
    >
      {/* Top row: source + date */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {sources.length > 0 ? (
            sources.map((source) => {
              const config = SOURCE_CONFIG[source.platform]
              return source.url ? (
                <a
                  key={`${source.platform}-${source.url}-${source.author}`}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 rounded-[4px] py-0.5 pr-2.5 pl-1.5 text-[10px] font-medium transition-opacity hover:opacity-80"
                  style={{ backgroundColor: config.bg, color: config.color }}
                  title={`View on ${config.label}`}
                >
                  <SourceIcon platform={source.platform} size={12} />
                  {source.author}
                  <LinkIcon size={9} className="opacity-60" />
                </a>
              ) : (
                <span
                  key={`${source.platform}-${source.url}-${source.author}`}
                  className="flex items-center gap-1.5 rounded-[4px] py-0.5 pr-2.5 pl-1.5 text-[10px] font-medium"
                  style={{ backgroundColor: config.bg, color: config.color }}
                >
                  <SourceIcon platform={source.platform} size={12} />
                  {source.author}
                </span>
              )
            })
          ) : (
            <span className="text-[11px] text-muted-foreground/60">
              Request
            </span>
          )}
          {(task.labels ?? []).map((label) => (
            <span
              key={label}
              className="rounded-[4px] px-2 py-0.5 text-[10px] font-medium capitalize"
              style={{
                backgroundColor: (labelColors[label] ?? "#6b7280") + "18",
                color: labelColors[label] ?? "#6b7280",
              }}
            >
              {label}
            </span>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground/50">
          {task.createdAt}
        </span>
      </div>

      {/* Title */}
      <p className="mb-3 text-[13px] leading-snug font-medium text-foreground/90">
        {task.title}
      </p>

      {/* Actions — always visible */}
      <div className="flex items-center gap-2">
        <button
          disabled={!canManageTasks}
          onClick={(e) => {
            e.stopPropagation()
            onAccept(task)
          }}
          className="flex items-center gap-1.5 rounded-[4px] border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
        >
          <CheckCircle size={12} weight="fill" />
          Accept
        </button>
        <button
          disabled={!canManageTasks}
          onClick={(e) => {
            e.stopPropagation()
            onDeny(task)
          }}
          className="flex items-center gap-1.5 rounded-[4px] border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-500/20 disabled:opacity-50 dark:text-red-400"
        >
          <XCircle size={12} />
          Deny
        </button>
      </div>
    </div>
  )
})

// ── Requests Group (non-draggable, distinct design) ──

const REQUESTS_PREVIEW_LIMIT = 3

function RequestsGroup({
  tasks,
  groupIndex,
  collapsed,
  canManageTasks,
  onToggleCollapsed,
  onAccept,
  onDeny,
  onSelectTask,
}: {
  tasks: Task[]
  groupIndex: number
  collapsed: boolean
  canManageTasks: boolean
  onToggleCollapsed: () => void
  onAccept: (task: Task) => void
  onDeny: (task: Task) => void
  onSelectTask: (task: Task) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  // Clean up dismissed IDs that are no longer in the task list
  useEffect(() => {
    if (dismissedIds.size === 0) return
    const taskIdSet = new Set(tasks.map((t) => t.id))
    setDismissedIds((prev) => {
      const next = new Set<string>()
      for (const id of prev) {
        if (taskIdSet.has(id)) next.add(id)
      }
      return next.size === prev.size ? prev : next
    })
  }, [tasks]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAccept = useCallback(
    (task: Task) => {
      setDismissedIds((prev) => new Set(prev).add(task.id))
      onAccept(task)
    },
    [onAccept]
  )

  const handleDeny = useCallback(
    (task: Task) => {
      setDismissedIds((prev) => new Set(prev).add(task.id))
      onDeny(task)
    },
    [onDeny]
  )

  const hasMore = tasks.length > REQUESTS_PREVIEW_LIMIT
  const visibleTasks = showAll ? tasks : tasks.slice(0, REQUESTS_PREVIEW_LIMIT)
  const hiddenCount = tasks.length - REQUESTS_PREVIEW_LIMIT

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mb-1.5 overflow-hidden rounded-[4px] ring-1 ring-border"
    >
      {/* Group header — distinct style */}
      <button
        onClick={onToggleCollapsed}
        className="flex w-full items-center gap-2.5 bg-card px-3 py-1.5 text-left transition-colors hover:bg-accent dark:bg-card dark:hover:bg-accent/40"
      >
        <span
          className="text-[10px] text-muted-foreground/60"
          style={{
            display: "inline-block",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </span>
        {getColumnIcon("requests")}
        <span className="text-[13px] font-semibold tracking-tight">
          Requests
        </span>
        <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-[4px] bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
          {tasks.length}
        </span>
        <span className="ml-1 text-[11px] text-muted-foreground/50">
          from users
        </span>
      </button>

      {/* Cards — no drag, no sortable context */}
      {!collapsed && (
        <div>
          <div className="grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleTasks.map((task) => (
              <RequestRow
                key={task.id}
                task={task}
                dismissed={dismissedIds.has(task.id)}
                canManageTasks={canManageTasks}
                onAccept={handleAccept}
                onDeny={handleDeny}
                onSelect={onSelectTask}
              />
            ))}
          </div>
          {hasMore && !showAll && (
            <div className="px-3 pb-3">
              <button
                onClick={() => setShowAll(true)}
                className="ring-dashed flex w-full items-center justify-center gap-1.5 rounded-[4px] py-2 text-[12px] font-medium text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent/40 hover:text-foreground"
              >
                View all requests
                <span className="rounded-[4px] bg-muted px-1.5 py-0.5 text-[10px]">
                  {hiddenCount} more
                </span>
              </button>
            </div>
          )}
          {hasMore && showAll && (
            <div className="px-3 pb-3">
              <button
                onClick={() => setShowAll(false)}
                className="ring-dashed flex w-full items-center justify-center gap-1.5 rounded-[4px] py-2 text-[12px] font-medium text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent/40 hover:text-foreground"
              >
                Show fewer
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}

// ── Context Menu ──

function ContextSubmenu({
  label,
  icon,
  children,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const submenuRef = useRef<HTMLDivElement>(null)

  const handleEnter = () => {
    setOpen(true)
  }
  const handleLeave = () => {
    setOpen(false)
  }

  return (
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button className="flex w-full items-center gap-2 rounded-[4px] px-1.5 py-1 text-[13px] transition-colors hover:bg-accent">
        {icon}
        <span>{label}</span>
        <svg
          className="ml-auto size-3.5 text-muted-foreground"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
      </button>
      {open && (
        <div
          ref={submenuRef}
          className="absolute top-0 left-full z-[101] ml-1 min-w-[180px] rounded-[4px] bg-popover p-1 text-popover-foreground shadow-none ring-1 ring-border"
        >
          {children}
        </div>
      )}
    </div>
  )
}

function TaskContextMenu({
  task,
  position,
  onClose,
  onUpdate,
  onDelete,
  canManageTasks,
}: {
  task: Task
  position: { x: number; y: number }
  onClose: () => void
  onUpdate: (taskId: string, updates: Partial<Task>) => void
  onDelete: (taskId: string) => void
  canManageTasks: boolean
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
    const labels = task.labels ?? []
    const has = labels.includes(label)
    const updated = has ? labels.filter((l) => l !== label) : [...labels, label]
    onUpdate(task.id, { labels: updated })
  }

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[200px] rounded-[4px] bg-popover p-1 text-popover-foreground shadow-none ring-1 ring-border"
      style={{ top: position.y, left: position.x }}
    >
      {!canManageTasks ? (
        <div className="px-2 py-1.5 text-[12px] text-muted-foreground">
          Guests can only view tasks.
        </div>
      ) : null}

      {/* Status submenu */}
      <ContextSubmenu label="Status" icon={getStatusIcon(task.status, 14)}>
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            disabled={!canManageTasks}
            onClick={() => {
              onUpdate(task.id, { status: s })
              onClose()
            }}
            className={`flex w-full items-center gap-2 rounded-[4px] px-1.5 py-1 text-[13px] transition-colors hover:bg-accent ${task.status === s ? "font-medium" : ""}`}
          >
            {getStatusIcon(s, 14)}
            <span>{STATUS_LABELS[s]}</span>
            {task.status === s && (
              <span className="ml-auto text-[12px] text-primary">✓</span>
            )}
          </button>
        ))}
      </ContextSubmenu>

      {/* Priority submenu */}
      <ContextSubmenu
        label="Priority"
        icon={getPriorityIcon(task.priority, 14)}
      >
        {ALL_PRIORITIES.map((p) => (
          <button
            key={p}
            disabled={!canManageTasks}
            onClick={() => {
              onUpdate(task.id, { priority: p })
              onClose()
            }}
            className={`flex w-full items-center gap-2 rounded-[4px] px-1.5 py-1 text-[13px] transition-colors hover:bg-accent ${task.priority === p ? "font-medium" : ""}`}
          >
            {getPriorityIcon(p, 14)}
            <span>{PRIORITY_LABELS[p]}</span>
            {task.priority === p && (
              <span className="ml-auto text-[12px] text-primary">✓</span>
            )}
          </button>
        ))}
      </ContextSubmenu>

      {/* Labels submenu */}
      <ContextSubmenu label="Labels" icon={<Tag size={14} />}>
        {labelConfig.names.map((label) => (
          <button
            key={label}
            disabled={!canManageTasks}
            onClick={() => toggleLabel(label)}
            className="flex w-full items-center gap-2 rounded-[4px] px-1.5 py-1 text-[13px] capitalize transition-colors hover:bg-accent"
          >
            <div
              className="size-2.5 rounded-[4px]"
              style={{ backgroundColor: labelConfig.colors[label] ?? "#888" }}
            />
            <span>{label}</span>
            {(task.labels ?? []).includes(label) && (
              <span className="ml-auto text-[12px] text-primary">✓</span>
            )}
          </button>
        ))}
      </ContextSubmenu>

      <div className="-mx-1 my-1 h-px bg-border" />

      {/* Delete */}
      <button
        disabled={!canManageTasks}
        onClick={() => {
          onDelete(task.id)
          onClose()
        }}
        className="flex w-full items-center gap-2 rounded-[4px] px-1.5 py-1 text-[13px] text-destructive transition-colors hover:bg-destructive/10"
      >
        <Trash size={14} />
        <span>Delete task</span>
      </button>
    </div>,
    document.body
  )
}

// ── List View Components ──

const AgentBadge = memo(function AgentBadge({
  agentName,
}: {
  agentName: string
}) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-[4px] border border-yellow-500/25 bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-medium text-yellow-500">
      <SpinnerGap size={10} className="animate-spin" />
      <span>{getAgentIcon(agentName)}</span>
      <span className="max-w-[80px] truncate">{agentName}</span>
    </span>
  )
})

const ListRowContent = memo(function ListRowContent({ task }: { task: Task }) {
  const { colors: labelColors } = useLabelConfig()
  const activeAgent = getActiveAgent(task)
  return (
    <>
      <span className="hidden w-14 shrink-0 font-mono text-[11px] text-muted-foreground/50 tabular-nums sm:inline">
        {task.taskCode}
      </span>
      <div className="shrink-0">{getPriorityIcon(task.priority)}</div>
      <div className="shrink-0">{getStatusIcon(task.status)}</div>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground/90">
        {task.title}
      </span>
      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
        {activeAgent && <AgentBadge agentName={activeAgent} />}
        {(task.labels ?? []).map((label) => (
          <span
            key={label}
            className="rounded-[4px] px-2 py-0.5 text-[10px] font-medium capitalize"
            style={{
              backgroundColor: (labelColors[label] ?? "#888") + "18",
              color: labelColors[label] ?? "#888",
            }}
          >
            {label}
          </span>
        ))}
        <span className="ml-1 text-[11px] text-muted-foreground/60">
          {task.createdAt}
        </span>
      </div>
    </>
  )
})

const SortableListRow = memo(function SortableListRow({
  task,
  rowIndex,
  groupDelay,
  isSelected,
  hasSelection,
  isDraggedAway,
  canManageTasks,
  onSelect,
  onToggleSelect,
  onUpdate,
  onDelete,
}: {
  task: Task
  rowIndex: number
  groupDelay: number
  isSelected: boolean
  hasSelection: boolean
  isDraggedAway: boolean
  canManageTasks: boolean
  onSelect: (task: Task) => void
  onToggleSelect: (taskId: string, shiftKey: boolean) => void
  onUpdate: (taskId: string, updates: Partial<Task>) => void
  onDelete: (taskId: string) => void
}) {
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
  } | null>(null)
  const boardMounted = useBoardMounted()
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({
      id: task.id,
      data: { type: "task", task },
      transition: SORTABLE_TRANSITION,
      disabled: !canManageTasks,
    })

  const [hasAnimated, setHasAnimated] = useState(boardMounted)
  const rowDelay = groupDelay + Math.min(rowIndex, 8) * 0.02
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging || isDraggedAway ? 0.3 : undefined,
    willChange: transform ? "transform" : undefined,
    ...(!hasAnimated
      ? { animation: `kanban-row-in 0.25s ease-out ${rowDelay}s both` }
      : {}),
  }

  const handleClick = useCallback(
    (e: ReactMouseEvent) => {
      if (hasSelection) {
        e.preventDefault()
        onToggleSelect(task.id, e.shiftKey)
        return
      }
      onSelect(task)
    },
    [onSelect, onToggleSelect, task, hasSelection]
  )

  const handleContextMenu = useCallback((e: ReactMouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleCheckboxClick = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation()
      onToggleSelect(task.id, e.shiftKey)
    },
    [onToggleSelect, task.id]
  )

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onAnimationEnd={() => setHasAnimated(true)}
        className={`group flex cursor-pointer touch-none items-center gap-3 border-b border-l-2 border-border px-3 py-2 transition-all duration-150 select-none hover:bg-accent/40 ${PRIORITY_ACCENT[task.priority]} ${isSelected ? "bg-primary/[0.06] hover:bg-primary/[0.10]" : "bg-background"}`}
      >
        {/* Checkbox */}
        <div
          onClick={handleCheckboxClick}
          className={`flex size-4 shrink-0 items-center justify-center rounded border transition-all ${
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background opacity-0 group-hover:opacity-100"
          } ${hasSelection ? "!opacity-100" : ""}`}
        >
          {isSelected && <Check size={10} weight="bold" />}
        </div>
        <ListRowContent task={task} />
      </div>
      {contextMenu && (
        <TaskContextMenu
          task={task}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
          onUpdate={onUpdate}
          onDelete={onDelete}
          canManageTasks={canManageTasks}
        />
      )}
    </>
  )
})

function DragOverlayCard({
  task,
  dragCount,
}: {
  task: Task
  dragCount: number
}) {
  const { colors: labelColors } = useLabelConfig()
  const activeAgent = getActiveAgent(task)
  return (
    <div className="relative">
      {dragCount > 1 && (
        <>
          <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-[4px] bg-muted ring-1 ring-border" />
          {dragCount > 2 && (
            <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-[4px] bg-muted/60 ring-1 ring-border" />
          )}
        </>
      )}
      <div className="relative w-[240px] rounded-[4px] bg-background p-2.5 shadow-lg ring-2 ring-primary/40 dark:bg-card">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">
            {task.taskCode}
          </span>
          {dragCount > 1 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {dragCount}
            </span>
          )}
        </div>
        <p className="mb-2 line-clamp-2 text-[13px] leading-snug font-medium text-foreground/90">
          {task.title}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="shrink-0">{getPriorityIcon(task.priority, 12)}</div>
          {activeAgent && <AgentBadge agentName={activeAgent} />}
          {(task.labels ?? []).map((label) => (
            <span
              key={label}
              className="rounded-[4px] px-1.5 py-0.5 text-[9px] font-medium capitalize"
              style={{
                backgroundColor: (labelColors[label] ?? "#888") + "18",
                color: labelColors[label] ?? "#888",
              }}
            >
              {label}
            </span>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground/50">
            {task.createdAt}
          </span>
        </div>
      </div>
    </div>
  )
}

function DragOverlayListRow({
  task,
  dragCount,
}: {
  task: Task
  dragCount: number
}) {
  return (
    <div className="relative">
      {/* Stacked cards behind for multi-drag */}
      {dragCount > 1 && (
        <>
          <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 border-2 border-border bg-muted" />
          {dragCount > 2 && (
            <div className="absolute inset-0 translate-x-3 translate-y-3 border-2 border-border bg-muted/60" />
          )}
        </>
      )}
      <div className="relative flex w-fit max-w-sm items-center gap-2.5 border-2 border-border bg-background px-3.5 py-2 shadow-none">
        <div className="shrink-0">{getStatusIcon(task.status, 13)}</div>
        <span className="truncate text-[13px] font-medium">{task.title}</span>
        {dragCount > 1 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
            {dragCount}
          </span>
        )}
      </div>
    </div>
  )
}

function ListGroup({
  column,
  tasks,
  groupIndex,
  isDropTarget,
  collapsed,
  selectedTaskIds,
  draggedTaskIds,
  canManageTasks,
  onToggleCollapsed,
  onSelectTask,
  onToggleSelectTask,
  onUpdateTask,
  onDeleteTask,
}: {
  column: (typeof COLUMNS)[number]
  tasks: Task[]
  groupIndex: number
  isDropTarget?: boolean
  collapsed: boolean
  selectedTaskIds: Set<string>
  draggedTaskIds: Set<string>
  canManageTasks: boolean
  onToggleCollapsed: () => void
  onSelectTask: (task: Task) => void
  onToggleSelectTask: (taskId: string, shiftKey: boolean) => void
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
}) {
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks])
  const hasSelection = selectedTaskIds.size > 0
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, delay: groupIndex * 0.04, ease: "easeOut" }}
      className="mb-1.5 overflow-hidden rounded-[4px] ring-1 ring-border"
      style={
        isDropTarget
          ? { outline: "2px solid var(--primary)", outlineOffset: "-2px" }
          : undefined
      }
    >
      {/* Group header */}
      <button
        onClick={onToggleCollapsed}
        className="flex w-full items-center gap-2.5 bg-card px-3 py-1.5 text-left transition-colors hover:bg-accent dark:bg-card dark:hover:bg-accent/50"
      >
        <span
          className="text-[10px] text-muted-foreground/60"
          style={{
            display: "inline-block",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </span>
        {getColumnIcon(column.id)}
        <span className="text-[13px] font-semibold tracking-tight">
          {column.label}
        </span>
        <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-[4px] bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
          {tasks.length}
        </span>
      </button>

      {/* Rows */}
      {!collapsed && (
        <div>
          <SortableContext
            items={taskIds}
            strategy={verticalListSortingStrategy}
          >
            {tasks.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-[12px] text-muted-foreground/50">
                No issues yet
              </div>
            ) : (
              tasks.map((task, rowIndex) => (
                <SortableListRow
                  key={task.id}
                  task={task}
                  rowIndex={rowIndex}
                  groupDelay={groupIndex * 0.04}
                  isSelected={selectedTaskIds.has(task.id)}
                  hasSelection={hasSelection}
                  isDraggedAway={draggedTaskIds.has(task.id)}
                  canManageTasks={canManageTasks}
                  onSelect={onSelectTask}
                  onToggleSelect={onToggleSelectTask}
                  onUpdate={onUpdateTask}
                  onDelete={onDeleteTask}
                />
              ))
            )}
          </SortableContext>
        </div>
      )}
    </motion.div>
  )
}

// ── Task Detail Modal ──

// "requests" excluded — requests are user-submitted and managed via accept/deny only
const ALL_STATUSES: Status[] = [
  "todo",
  "in_progress",
  "ready",
  "shipped",
  "archive",
]
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
  onAccept,
  onDeny,
  canManageTasks,
}: {
  task: Task | null
  onClose: () => void
  onUpdate: (taskId: string, updates: Partial<Task>) => void
  onDelete: (taskId: string) => void
  onAccept?: (task: Task) => void
  onDeny?: (task: Task) => void
  canManageTasks: boolean
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
    const labels = task.labels ?? []
    const has = labels.includes(label)
    const updated = has ? labels.filter((l) => l !== label) : [...labels, label]
    onUpdate(task.id, { labels: updated })
  }

  return (
    <Dialog
      open={task !== null}
      onOpenChange={(open) => {
        if (!open) {
          setEditingTitle(false)
          setEditingDesc(false)
          onClose()
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[88vh] w-[min(92vw,72rem)] max-w-4xl overflow-hidden p-0"
      >
        {task && (
          <div className="flex max-h-[88vh] flex-col">
            {/* Top bar */}
            <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
                <span className="font-mono text-[12px] font-medium text-muted-foreground">
                  {task.taskCode}
                </span>
                <span className="text-muted-foreground/30">·</span>
                <span className="text-[12px] text-muted-foreground/60">
                  {task.createdAt}
                </span>
                {(() => {
                  const taskSources = getTaskSources(task)
                  return taskSources.map((src) => {
                    const cfg = SOURCE_CONFIG[src.platform]
                    return (
                      <span
                        key={`${src.platform}-${src.url}-${src.author}`}
                        className="contents"
                      >
                        <span className="text-muted-foreground/30">·</span>
                        {src.url ? (
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 rounded-[4px] py-0.5 pr-2.5 pl-1.5 text-[10px] font-medium transition-opacity hover:opacity-80"
                            style={{
                              backgroundColor: cfg.bg,
                              color: cfg.color,
                            }}
                          >
                            <SourceIcon platform={src.platform} size={11} />
                            <span>{src.author}</span>
                            <LinkIcon size={10} />
                          </a>
                        ) : (
                          <span
                            className="flex items-center gap-1.5 rounded-[4px] py-0.5 pr-2.5 pl-1.5 text-[10px] font-medium"
                            style={{
                              backgroundColor: cfg.bg,
                              color: cfg.color,
                            }}
                          >
                            <SourceIcon platform={src.platform} size={11} />
                            <span>{src.author}</span>
                          </span>
                        )}
                      </span>
                    )
                  })
                })()}
              </div>
              <div className="flex items-center gap-1">
                <button
                  disabled={!canManageTasks}
                  onClick={() => onDelete(task.id)}
                  className="rounded-[4px] p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  title="Delete task"
                >
                  <Trash size={14} />
                </button>
                <button
                  onClick={onClose}
                  className="rounded-[4px] p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-3.5 pt-5 pb-6">
              {/* Title */}
              <DialogHeader>
                <DialogTitle className="sr-only">{task.title}</DialogTitle>
                {editingTitle ? (
                  <input
                    autoFocus
                    value={titleValue}
                    onChange={(e) => setTitleValue(e.target.value)}
                    onBlur={handleTitleSave}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleTitleSave()
                      if (e.key === "Escape") {
                        setTitleValue(task.title)
                        setEditingTitle(false)
                      }
                    }}
                    className="w-full rounded-[4px] bg-transparent px-1 py-0.5 text-[14px] leading-snug font-semibold tracking-tight ring-1 ring-border outline-none focus:ring-1 focus:ring-primary"
                  />
                ) : (
                  <h2
                    onClick={() => {
                      if (!canManageTasks) return
                      setTitleValue(task.title)
                      setEditingTitle(true)
                    }}
                    className={`-mx-1 rounded-[4px] px-1 py-0.5 text-[14px] leading-snug font-semibold tracking-tight break-words transition-colors ${canManageTasks ? "cursor-text hover:bg-accent/50" : ""}`}
                  >
                    {task.title}
                  </h2>
                )}
              </DialogHeader>

              {/* Properties row */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Status */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={!canManageTasks}
                    className="flex items-center gap-1.5 rounded-[4px] bg-background px-2.5 py-1.5 text-[12px] font-medium ring-1 ring-border transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {getStatusIcon(task.status, 13)}
                    <span>{STATUS_LABELS[task.status]}</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="bottom" align="start">
                    {ALL_STATUSES.map((s) => (
                      <DropdownMenuItem
                        key={s}
                        className={task.status === s ? "font-medium" : ""}
                        onClick={() => onUpdate(task.id, { status: s })}
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
                  <DropdownMenuTrigger
                    disabled={!canManageTasks}
                    className="flex items-center gap-1.5 rounded-[4px] bg-background px-2.5 py-1.5 text-[12px] font-medium ring-1 ring-border transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {getPriorityIcon(task.priority, 13)}
                    <span>{PRIORITY_LABELS[task.priority]}</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="bottom" align="start">
                    {ALL_PRIORITIES.map((p) => (
                      <DropdownMenuItem
                        key={p}
                        className={task.priority === p ? "font-medium" : ""}
                        onClick={() => onUpdate(task.id, { priority: p })}
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
                  <DropdownMenuTrigger
                    disabled={!canManageTasks}
                    className="flex items-center gap-1.5 rounded-[4px] bg-background px-2.5 py-1.5 text-[12px] font-medium ring-1 ring-border transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {(task.labels ?? []).length > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <div className="flex -space-x-0.5">
                          {(task.labels ?? []).map((label) => (
                            <div
                              key={label}
                              className="size-2.5 rounded-[4px] ring-1 ring-background"
                              style={{
                                backgroundColor:
                                  labelConfig.colors[label] ?? "#888",
                              }}
                            />
                          ))}
                        </div>
                        <span>
                          {(task.labels ?? []).length === 1
                            ? (task.labels ?? [])[0]
                            : `${(task.labels ?? []).length} labels`}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Add label</span>
                    )}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="bottom" align="start">
                    {labelConfig.names.map((label) => (
                      <DropdownMenuItem
                        key={label}
                        onClick={() => toggleLabel(label)}
                      >
                        <div className="flex w-full items-center gap-2 capitalize">
                          <div
                            className="size-2.5 rounded-[4px]"
                            style={{
                              backgroundColor:
                                labelConfig.colors[label] ?? "#888",
                            }}
                          />
                          <span>{label}</span>
                          {(task.labels ?? []).includes(label) && (
                            <span className="ml-auto text-[12px] text-primary">
                              ✓
                            </span>
                          )}
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {task._syncStatus === "error" ? (
                <div className="flex items-start gap-2 rounded-[8px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
                  <WarningCircle
                    size={14}
                    weight="fill"
                    className="mt-0.5 shrink-0 text-amber-400"
                  />
                  <span className="leading-relaxed">
                    Attachment changes are visible locally, but they have not
                    synced to the server yet.
                  </span>
                </div>
              ) : null}

              {/* Divider */}
              <div className="h-px bg-border" />

              {/* Description */}
              <div>
                <span className="mb-2 block text-[11px] font-medium tracking-wider text-muted-foreground/70 uppercase">
                  Description
                </span>
                {editingDesc ? (
                  <textarea
                    autoFocus
                    value={descValue}
                    onChange={(e) => setDescValue(e.target.value)}
                    onBlur={handleDescSave}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setDescValue(task.description ?? "")
                        setEditingDesc(false)
                      }
                    }}
                    placeholder="Write something..."
                    className="min-h-[100px] w-full resize-none rounded-[4px] bg-transparent px-2 py-1.5 text-[13px] leading-relaxed ring-1 ring-border outline-none focus:ring-1 focus:ring-primary"
                  />
                ) : (
                  <div
                    onClick={() => {
                      if (!canManageTasks) return
                      setDescValue(task.description ?? "")
                      setEditingDesc(true)
                    }}
                    className={`-mx-2 rounded-[4px] px-2 py-1.5 text-[13px] leading-relaxed transition-colors ${canManageTasks ? "cursor-text hover:bg-accent/40" : ""}`}
                  >
                    {task.description ? (
                      <span className="block break-words whitespace-pre-wrap text-foreground/80">
                        {task.description}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">
                        Write something...
                      </span>
                    )}
                  </div>
                )}
              </div>

              {task.attachments && task.attachments.length > 0 ? (
                <>
                  <div className="h-px bg-border" />
                  <TaskAttachmentGallery
                    attachments={task.attachments}
                    workspaceId={task.workspaceId}
                    canManageAttachments={canManageTasks}
                    onAttachmentsChange={(attachments) =>
                      onUpdate(task.id, { attachments })
                    }
                  />
                </>
              ) : null}

              {/* Accept / Deny for request tasks */}
              {task.status === "requests" && onAccept && onDeny && (
                <>
                  <div className="h-px bg-border" />
                  <div className="flex items-center gap-2">
                    <button
                      disabled={!canManageTasks}
                      onClick={() => {
                        onAccept(task)
                        onClose()
                      }}
                      className="flex items-center gap-1.5 rounded-[4px] border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
                    >
                      <CheckCircle size={14} weight="fill" />
                      Accept request
                    </button>
                    <button
                      disabled={!canManageTasks}
                      onClick={() => {
                        onDeny(task)
                        onClose()
                      }}
                      className="flex items-center gap-1.5 rounded-[4px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-500/20 disabled:opacity-50 dark:text-red-400"
                    >
                      <XCircle size={14} />
                      Deny request
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Bulk Action Toolbar ──

function BulkActionToolbar({
  selectedCount,
  onChangeStatus,
  onChangePriority,
  onChangeLabels,
  onDelete,
  onClearSelection,
}: {
  selectedCount: number
  onChangeStatus: (status: Status) => void
  onChangePriority: (priority: Priority) => void
  onChangeLabels: (labels: string[]) => void
  onDelete: () => void
  onClearSelection: () => void
}) {
  const labelConfig = useLabelConfig()

  return createPortal(
    <div className="fixed bottom-6 left-1/2 z-50 scrollbar-hide flex w-[calc(100%-2rem)] max-w-fit -translate-x-1/2 items-center gap-1.5 overflow-x-auto rounded-[4px] border-2 border-border bg-popover px-3 py-2 shadow-none">
      {/* Selection count & clear */}
      <div className="mr-1 flex items-center gap-2 border-r border-border pr-2">
        <span className="text-[12px] font-semibold text-foreground tabular-nums">
          {selectedCount} selected
        </span>
        <button
          onClick={onClearSelection}
          className="rounded-[4px] p-0.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
          title="Clear selection"
        >
          <X size={13} />
        </button>
      </div>

      {/* Status */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground">
          {getStatusIcon("todo", 13)}
          <span>Status</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center">
          {ALL_STATUSES.map((s) => (
            <DropdownMenuItem key={s} onClick={() => onChangeStatus(s)}>
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
        <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground">
          {getPriorityIcon("medium", 13)}
          <span>Priority</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center">
          {ALL_PRIORITIES.map((p) => (
            <DropdownMenuItem key={p} onClick={() => onChangePriority(p)}>
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
        <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground">
          <Tag size={13} />
          <span>Label</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center">
          {labelConfig.names.map((label) => (
            <DropdownMenuItem
              key={label}
              onClick={() => onChangeLabels([label])}
            >
              <div className="flex items-center gap-2 capitalize">
                <div
                  className="size-2.5 rounded-[4px]"
                  style={{
                    backgroundColor: labelConfig.colors[label] ?? "#888",
                  }}
                />
                <span>{label}</span>
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onChangeLabels([])}>
            <div className="flex items-center gap-2">
              <XCircle size={12} className="text-muted-foreground" />
              <span>Clear labels</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Divider */}
      <div className="mx-0.5 h-5 w-px bg-border" />

      {/* Delete */}
      <button
        onClick={onDelete}
        className="flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/10"
      >
        <Trash size={13} />
        <span>Delete</span>
      </button>
    </div>,
    document.body
  )
}

// ── Kanban Card (for Board View) ──

const KanbanCard = memo(function KanbanCard({
  task,
  cardIndex,
  columnIndex,
  isSelected,
  hasSelection,
  isDraggedAway,
  canManageTasks,
  onSelect,
  onToggleSelect,
  onUpdate,
  onDelete,
}: {
  task: Task
  cardIndex: number
  columnIndex: number
  isSelected: boolean
  hasSelection: boolean
  isDraggedAway: boolean
  canManageTasks: boolean
  onSelect: (task: Task) => void
  onToggleSelect: (taskId: string, shiftKey: boolean) => void
  onUpdate: (taskId: string, updates: Partial<Task>) => void
  onDelete: (taskId: string) => void
}) {
  const { colors: labelColors } = useLabelConfig()
  const boardMounted = useBoardMounted()
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
  } | null>(null)
  const activeAgent = getActiveAgent(task)
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({
      id: task.id,
      data: { type: "task", task },
      transition: SORTABLE_TRANSITION,
      disabled: !canManageTasks,
    })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging || isDraggedAway ? 0.3 : undefined,
    willChange: transform ? "transform" : undefined,
  }

  const handleClick = useCallback(
    (e: ReactMouseEvent) => {
      if (hasSelection) {
        e.preventDefault()
        onToggleSelect(task.id, e.shiftKey)
        return
      }
      onSelect(task)
    },
    [onSelect, onToggleSelect, task, hasSelection]
  )

  const handleContextMenu = useCallback((e: ReactMouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleCheckboxClick = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation()
      onToggleSelect(task.id, e.shiftKey)
    },
    [onToggleSelect, task.id]
  )

  // Stagger: column delay + per-card delay (cap at 8 cards to avoid long waits)
  const staggerDelay = columnIndex * 0.06 + Math.min(cardIndex, 8) * 0.03

  return (
    <>
      <motion.div
        ref={setNodeRef}
        style={style}
        initial={boardMounted ? false : { opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={
          boardMounted
            ? { duration: 0 }
            : {
                duration: 0.25,
                delay: staggerDelay,
                ease: [0.25, 0.1, 0.25, 1],
              }
        }
        layout
        layoutId={`kanban-card-${task.id}`}
        {...attributes}
        {...listeners}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`group cursor-pointer touch-none rounded-[4px] bg-background p-2.5 ring-1 ring-border transition-colors duration-150 select-none hover:bg-accent/20 dark:bg-card ${isSelected ? "bg-primary/[0.06] ring-2 ring-primary/40" : ""}`}
      >
        {/* Top: task code + checkbox */}
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">
            {task.taskCode}
          </span>
          <div
            onClick={handleCheckboxClick}
            className={`flex size-3.5 shrink-0 items-center justify-center rounded border transition-all ${
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background opacity-0 group-hover:opacity-100"
            } ${hasSelection ? "!opacity-100" : ""}`}
          >
            {isSelected && <Check size={8} weight="bold" />}
          </div>
        </div>

        {/* Title */}
        <p className="mb-2 line-clamp-2 text-[13px] leading-snug font-medium text-foreground/90">
          {task.title}
        </p>

        {/* Bottom: priority + labels + agent + date */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="shrink-0">{getPriorityIcon(task.priority, 12)}</div>
          {activeAgent && <AgentBadge agentName={activeAgent} />}
          {(task.labels ?? []).map((label) => (
            <span
              key={label}
              className="rounded-[4px] px-1.5 py-0.5 text-[9px] font-medium capitalize"
              style={{
                backgroundColor: (labelColors[label] ?? "#888") + "18",
                color: labelColors[label] ?? "#888",
              }}
            >
              {label}
            </span>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground/50">
            {task.createdAt}
          </span>
        </div>
      </motion.div>
      {contextMenu && (
        <TaskContextMenu
          task={task}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
          onUpdate={onUpdate}
          onDelete={onDelete}
          canManageTasks={canManageTasks}
        />
      )}
    </>
  )
})

// ── Kanban Column (for Board View) ──

function KanbanColumn({
  column,
  columnIndex,
  tasks,
  isDropTarget,
  selectedTaskIds,
  draggedTaskIds,
  canManageTasks,
  onSelectTask,
  onToggleSelectTask,
  onUpdateTask,
  onDeleteTask,
}: {
  column: (typeof COLUMNS)[number]
  columnIndex: number
  tasks: Task[]
  isDropTarget?: boolean
  selectedTaskIds: Set<string>
  draggedTaskIds: Set<string>
  canManageTasks: boolean
  onSelectTask: (task: Task) => void
  onToggleSelectTask: (taskId: string, shiftKey: boolean) => void
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
}) {
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks])
  const hasSelection = selectedTaskIds.size > 0
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: columnIndex * 0.06,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className={`flex h-full w-[260px] shrink-0 flex-col overflow-hidden rounded-[4px] ring-1 ring-border transition-shadow duration-200 ${isDropTarget ? "bg-primary/[0.03] ring-2 ring-primary" : ""}`}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 bg-card px-3 py-1.5 shadow-[inset_0_-1px_0_var(--border)] dark:bg-card">
        {getColumnIcon(column.id)}
        <span className="text-[13px] font-semibold tracking-tight">
          {column.label}
        </span>
        <motion.span
          key={tasks.length}
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className="flex h-4.5 min-w-4.5 items-center justify-center rounded-[4px] bg-muted px-1.5 text-[10px] font-medium text-muted-foreground"
        >
          {tasks.length}
        </motion.span>
      </div>

      {/* Cards */}
      <div
        data-column-scroll
        className="scrollbar-hide flex-1 overflow-y-auto p-2"
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {tasks.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-[12px] text-muted-foreground/50">
                No issues yet
              </div>
            ) : (
              tasks.map((task, cardIndex) => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  cardIndex={cardIndex}
                  columnIndex={columnIndex}
                  isSelected={selectedTaskIds.has(task.id)}
                  hasSelection={hasSelection}
                  isDraggedAway={draggedTaskIds.has(task.id)}
                  canManageTasks={canManageTasks}
                  onSelect={onSelectTask}
                  onToggleSelect={onToggleSelectTask}
                  onUpdate={onUpdateTask}
                  onDelete={onDeleteTask}
                />
              ))
            )}
          </div>
        </SortableContext>
      </div>
    </motion.div>
  )
}

// ── Board View (Kanban Columns) ──

function ColumnBoardView({
  tasks,
  hiddenColumns,
  canManageTasks,
  onMoveTask,
  onMoveMultipleTasks,
  onUpdateTask,
  onDeleteTask,
  onBulkUpdateTasks,
  onBulkDeleteTasks,
  onAcceptRequest,
  onDenyRequest,
}: {
  tasks: Task[]
  hiddenColumns: Status[]
  canManageTasks: boolean
  onMoveTask: (taskId: string, toStatus: Status, toIndex: number) => void
  onMoveMultipleTasks: (
    taskIds: string[],
    toStatus: Status,
    toIndex: number
  ) => void
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
  onBulkUpdateTasks: (
    taskIds: string[],
    updates: Partial<Pick<Task, "status" | "priority" | "labels">>
  ) => void
  onBulkDeleteTasks: (taskIds: string[]) => void
  onAcceptRequest: (task: Task) => void
  onDenyRequest: (task: Task) => void
}) {
  const visibleColumns = COLUMNS.filter(
    (c) => !hiddenColumns.includes(c.id) && c.id !== "requests"
  )
  const showRequests = !hiddenColumns.includes("requests")
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [draggedTaskIds, setDraggedTaskIds] = useState<Set<string>>(new Set())
  const [overColumn, setOverColumn] = useState<Status | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const lastToggledTaskIdRef = useRef<string | null>(null)

  const selectedTask = selectedTaskId
    ? (tasks.find((t) => t.id === selectedTaskId) ?? null)
    : null

  const orderedTaskIds = useMemo(() => {
    const ids: string[] = []
    for (const col of visibleColumns) {
      for (const task of tasks) {
        if (task.status === col.id) ids.push(task.id)
      }
    }
    return ids
  }, [tasks, visibleColumns])

  const handleSelectTask = useCallback((task: Task) => {
    setSelectedTaskId(task.id)
  }, [])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("search-palette:board-ready"))
  }, [])

  useSearchPaletteTaskEvent(
    useCallback((taskId: string) => {
      setSelectedTaskId(taskId)
    }, [])
  )

  const handleToggleSelectTask = useCallback(
    (taskId: string, shiftKey: boolean) => {
      if (!canManageTasks) return
      setSelectedTaskIds((prev) => {
        const next = new Set(prev)
        if (shiftKey && lastToggledTaskIdRef.current) {
          const lastIdx = orderedTaskIds.indexOf(lastToggledTaskIdRef.current)
          const currentIdx = orderedTaskIds.indexOf(taskId)
          if (lastIdx !== -1 && currentIdx !== -1) {
            const start = Math.min(lastIdx, currentIdx)
            const end = Math.max(lastIdx, currentIdx)
            for (let i = start; i <= end; i++) {
              const id = orderedTaskIds[i]
              if (id) next.add(id)
            }
            return next
          }
        }
        if (next.has(taskId)) {
          next.delete(taskId)
        } else {
          next.add(taskId)
        }
        lastToggledTaskIdRef.current = taskId
        return next
      })
    },
    [canManageTasks, orderedTaskIds]
  )

  const handleClearSelection = useCallback(() => {
    setSelectedTaskIds(new Set())
    lastToggledTaskIdRef.current = null
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedTaskIds.size > 0) {
        handleClearSelection()
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "a" &&
        selectedTaskIds.size > 0
      ) {
        e.preventDefault()
        setSelectedTaskIds(new Set(orderedTaskIds))
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [selectedTaskIds.size, orderedTaskIds, handleClearSelection])

  useEffect(() => {
    const taskIdSet = new Set(tasks.map((t) => t.id))
    setSelectedTaskIds((prev) => {
      const next = new Set<string>()
      for (const id of prev) {
        if (taskIdSet.has(id)) next.add(id)
      }
      return next.size === prev.size ? prev : next
    })
  }, [tasks])

  const handleBulkChangeStatus = useCallback(
    (status: Status) => {
      onBulkUpdateTasks(Array.from(selectedTaskIds), { status })
      handleClearSelection()
    },
    [selectedTaskIds, onBulkUpdateTasks, handleClearSelection]
  )

  const handleBulkChangePriority = useCallback(
    (priority: Priority) => {
      onBulkUpdateTasks(Array.from(selectedTaskIds), { priority })
      handleClearSelection()
    },
    [selectedTaskIds, onBulkUpdateTasks, handleClearSelection]
  )

  const handleBulkChangeLabels = useCallback(
    (labels: string[]) => {
      onBulkUpdateTasks(Array.from(selectedTaskIds), { labels })
      handleClearSelection()
    },
    [selectedTaskIds, onBulkUpdateTasks, handleClearSelection]
  )

  const handleBulkDelete = useCallback(() => {
    onBulkDeleteTasks(Array.from(selectedTaskIds))
    handleClearSelection()
  }, [selectedTaskIds, onBulkDeleteTasks, handleClearSelection])

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
    if (!canManageTasks) return
    const task = event.active.data.current?.task as Task | undefined
    if (!task) return
    setActiveTask(task)
    if (selectedTaskIds.has(task.id) && selectedTaskIds.size > 1) {
      setDraggedTaskIds(new Set(selectedTaskIds))
    } else {
      setDraggedTaskIds(new Set([task.id]))
    }
  }

  function handleDragOver(event: DragOverEvent) {
    if (!canManageTasks) return
    const { over } = event
    if (!over) {
      setOverColumn(null)
      return
    }
    const overId = over.id as string
    const targetCol =
      over.data.current?.type === "column"
        ? (over.id as Status)
        : findColumnOfTask(overId)
    if (targetCol === "requests") {
      setOverColumn(null)
      return
    }
    setOverColumn((current) => (current === targetCol ? current : targetCol))
  }

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const autoScrollRafRef = useRef<number | null>(null)

  // Smart scroll: vertical wheel scrolls horizontally on the board,
  // unless the cursor is over a column that can scroll vertically.
  // When a column hits its scroll boundary, absorb further scroll
  // events instead of immediately leaking to horizontal.
  const boundaryHitsRef = useRef(0)
  const lastColumnRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    function handleWheel(e: WheelEvent) {
      // Only intercept vertical scroll (deltaY), not horizontal (deltaX)
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return

      // Find the scrollable column under the cursor
      const target = e.target as HTMLElement
      const column = target.closest(
        "[data-column-scroll]"
      ) as HTMLElement | null

      // Reset boundary counter if we moved to a different column
      if (column !== lastColumnRef.current) {
        boundaryHitsRef.current = 0
        lastColumnRef.current = column
      }

      if (column) {
        const canScrollUp = column.scrollTop > 0
        const canScrollDown =
          column.scrollTop + column.clientHeight < column.scrollHeight - 1
        const scrollingDown = e.deltaY > 0
        const scrollingUp = e.deltaY < 0
        const hasOverflow = column.scrollHeight > column.clientHeight + 1

        // Column can scroll in this direction — scroll vertically, reset counter
        if ((scrollingDown && canScrollDown) || (scrollingUp && canScrollUp)) {
          boundaryHitsRef.current = 0
          return
        }

        // Column has scrollable content but we're at the boundary.
        // Absorb the event to prevent jarring horizontal scroll.
        if (hasOverflow) {
          e.preventDefault()
          return
        }
      }

      // No column, or column has no overflow at all — scroll horizontally
      e.preventDefault()
      container!.scrollBy({ left: e.deltaY, behavior: "auto" })
    }

    container.addEventListener("wheel", handleWheel, { passive: false })
    return () => container.removeEventListener("wheel", handleWheel)
  }, [])

  function stopAutoScroll() {
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current)
      autoScrollRafRef.current = null
    }
  }

  function handleDragMove(event: DragMoveEvent) {
    const container = scrollContainerRef.current
    if (!container || !activeTask) return

    const activatorEvent = event.activatorEvent as PointerEvent
    if (!activatorEvent) return
    const pointerX = activatorEvent.clientX + event.delta.x
    const pointerY = activatorEvent.clientY + event.delta.y

    const rect = container.getBoundingClientRect()
    const edgeZone = 60
    const maxSpeed = 18

    let scrollX = 0
    let scrollY = 0

    const distFromLeft = pointerX - rect.left
    const distFromRight = rect.right - pointerX
    if (distFromLeft < edgeZone) {
      scrollX = -maxSpeed * (1 - distFromLeft / edgeZone)
    } else if (distFromRight < edgeZone) {
      scrollX = maxSpeed * (1 - distFromRight / edgeZone)
    }

    const distFromTop = pointerY - rect.top
    const distFromBottom = rect.bottom - pointerY
    if (distFromTop < edgeZone) {
      scrollY = -maxSpeed * (1 - distFromTop / edgeZone)
    } else if (distFromBottom < edgeZone) {
      scrollY = maxSpeed * (1 - distFromBottom / edgeZone)
    }

    stopAutoScroll()

    if (scrollX !== 0 || scrollY !== 0) {
      const scroll = () => {
        if (!scrollContainerRef.current) return
        scrollContainerRef.current.scrollBy({ left: scrollX, top: scrollY })
        autoScrollRafRef.current = requestAnimationFrame(scroll)
      }
      autoScrollRafRef.current = requestAnimationFrame(scroll)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    stopAutoScroll()
    if (!canManageTasks) return
    const { active, over } = event
    const currentDraggedIds = draggedTaskIds
    setActiveTask(null)
    setDraggedTaskIds(new Set())
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
    if (targetColumn === "requests") return

    const isMultiDrag = currentDraggedIds.size > 1
    if (isMultiDrag) {
      const targetIndex =
        over.data.current?.type === "column"
          ? tasksByColumn[targetColumn].length
          : Math.max(
              0,
              tasksByColumn[targetColumn].findIndex((t) => t.id === overId)
            )
      onMoveMultipleTasks(
        Array.from(currentDraggedIds),
        targetColumn,
        targetIndex
      )
      handleClearSelection()
      return
    }

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

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopAutoScroll()
    }
  }, [])

  const activeTaskSource = activeTask ? activeTask.status : null

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={(args) => {
          const pointerIntersections = pointerWithin(args)
          if (pointerIntersections.length > 0) return pointerIntersections
          return closestCenter(args)
        }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div
          ref={scrollContainerRef}
          className="scrollbar-hide flex h-full gap-2 overflow-x-auto p-2"
        >
          {/* Requests column — special treatment */}
          {showRequests && tasksByColumn.requests.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              className="flex h-full w-[260px] shrink-0 flex-col overflow-hidden rounded-[4px] ring-1 ring-border"
            >
              <div className="flex items-center gap-2 bg-card px-3 py-1.5 shadow-[inset_0_-1px_0_var(--border)] dark:bg-card">
                {getColumnIcon("requests")}
                <span className="text-[13px] font-semibold tracking-tight">
                  Requests
                </span>
                <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-[4px] bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                  {tasksByColumn.requests.length}
                </span>
                <span className="ml-1 text-[11px] text-muted-foreground/50">
                  from users
                </span>
              </div>
              <div
                data-column-scroll
                className="scrollbar-hide flex-1 overflow-y-auto p-2"
              >
                <div className="flex flex-col gap-2">
                  {tasksByColumn.requests.map((task) => (
                    <RequestRow
                      key={task.id}
                      task={task}
                      dismissed={false}
                      canManageTasks={canManageTasks}
                      onAccept={onAcceptRequest}
                      onDeny={onDenyRequest}
                      onSelect={handleSelectTask}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Regular columns */}
          {visibleColumns.map((column, colIdx) => {
            const columnTasks = tasksByColumn[column.id]
            // Offset columnIndex if requests column is showing
            const columnIndex =
              showRequests && tasksByColumn.requests.length > 0
                ? colIdx + 1
                : colIdx
            return (
              <div
                key={column.id}
                className="border-r border-border last:border-r-0"
              >
                <KanbanColumn
                  column={column}
                  columnIndex={columnIndex}
                  tasks={columnTasks}
                  isDropTarget={
                    overColumn === column.id &&
                    activeTaskSource !== null &&
                    activeTaskSource !== column.id
                  }
                  selectedTaskIds={selectedTaskIds}
                  draggedTaskIds={draggedTaskIds}
                  canManageTasks={canManageTasks}
                  onSelectTask={handleSelectTask}
                  onToggleSelectTask={handleToggleSelectTask}
                  onUpdateTask={onUpdateTask}
                  onDeleteTask={onDeleteTask}
                />
              </div>
            )
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <DragOverlayCard
              task={activeTask}
              dragCount={draggedTaskIds.size}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <TaskDetailModal
        task={selectedTask}
        onClose={() => setSelectedTaskId(null)}
        onUpdate={onUpdateTask}
        onDelete={(taskId) => {
          onDeleteTask(taskId)
          setSelectedTaskId(null)
        }}
        onAccept={(task) => {
          onAcceptRequest(task)
          setSelectedTaskId(null)
        }}
        onDeny={(task) => {
          onDenyRequest(task)
          setSelectedTaskId(null)
        }}
        canManageTasks={canManageTasks}
      />

      {canManageTasks && selectedTaskIds.size > 0 && (
        <BulkActionToolbar
          selectedCount={selectedTaskIds.size}
          onChangeStatus={handleBulkChangeStatus}
          onChangePriority={handleBulkChangePriority}
          onChangeLabels={handleBulkChangeLabels}
          onDelete={handleBulkDelete}
          onClearSelection={handleClearSelection}
        />
      )}
    </>
  )
}

// ── View Toggle ──

function ViewToggle({
  view,
  onViewChange,
}: {
  view: BoardView
  onViewChange: (view: BoardView) => void
}) {
  return (
    <div className="relative flex items-center gap-0.5 rounded-[5px] bg-muted/60 p-0.5">
      {/* Sliding indicator */}
      <motion.div
        layout
        layoutId="view-toggle-indicator"
        className="absolute inset-y-0.5 w-[calc(50%-2px)] rounded-[4px] bg-background shadow-sm ring-1 ring-border/50"
        style={{ left: view === "list" ? 2 : "calc(50% + 0px)" }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
      />
      <button
        onClick={() => onViewChange("list")}
        className={`relative z-10 flex items-center justify-center rounded-[4px] p-1.5 transition-colors ${
          view === "list"
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title="List view"
      >
        <ListBullets size={14} />
      </button>
      <button
        onClick={() => onViewChange("board")}
        className={`relative z-10 flex items-center justify-center rounded-[4px] p-1.5 transition-colors ${
          view === "board"
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title="Board view"
      >
        <SquaresFour size={14} />
      </button>
    </div>
  )
}

function ListView({
  tasks,
  hiddenColumns,
  collapsedColumns,
  canManageTasks,
  onToggleCollapsedColumn,
  onMoveTask,
  onMoveMultipleTasks,
  onUpdateTask,
  onDeleteTask,
  onBulkUpdateTasks,
  onBulkDeleteTasks,
  onAcceptRequest,
  onDenyRequest,
}: {
  tasks: Task[]
  hiddenColumns: Status[]
  collapsedColumns: Status[]
  canManageTasks: boolean
  onToggleCollapsedColumn: (status: Status) => void
  onMoveTask: (taskId: string, toStatus: Status, toIndex: number) => void
  onMoveMultipleTasks: (
    taskIds: string[],
    toStatus: Status,
    toIndex: number
  ) => void
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
  onBulkUpdateTasks: (
    taskIds: string[],
    updates: Partial<Pick<Task, "status" | "priority" | "labels">>
  ) => void
  onBulkDeleteTasks: (taskIds: string[]) => void
  onAcceptRequest: (task: Task) => void
  onDenyRequest: (task: Task) => void
}) {
  // Non-request columns only for DnD
  const visibleColumns = COLUMNS.filter(
    (c) => !hiddenColumns.includes(c.id) && c.id !== "requests"
  )
  const showRequests = !hiddenColumns.includes("requests")
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [draggedTaskIds, setDraggedTaskIds] = useState<Set<string>>(new Set())
  const [overColumn, setOverColumn] = useState<Status | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const lastToggledTaskIdRef = useRef<string | null>(null)

  const selectedTask = selectedTaskId
    ? (tasks.find((t) => t.id === selectedTaskId) ?? null)
    : null

  // Build ordered flat list of non-request tasks for shift-click range selection
  const orderedTaskIds = useMemo(() => {
    const nonRequestCols = COLUMNS.filter(
      (c) => c.id !== "requests" && !hiddenColumns.includes(c.id)
    )
    const ids: string[] = []
    for (const col of nonRequestCols) {
      if (!collapsedColumns.includes(col.id)) {
        for (const task of tasks) {
          if (task.status === col.id) ids.push(task.id)
        }
      }
    }
    return ids
  }, [tasks, hiddenColumns, collapsedColumns])

  const handleSelectTask = useCallback((task: Task) => {
    setSelectedTaskId(task.id)
  }, [])

  // Signal that the board is mounted and ready to receive task-open events
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("search-palette:board-ready"))
  }, [])

  // Listen for task-open events from search palette
  useSearchPaletteTaskEvent(
    useCallback((taskId: string) => {
      setSelectedTaskId(taskId)
    }, [])
  )

  const handleToggleSelectTask = useCallback(
    (taskId: string, shiftKey: boolean) => {
      if (!canManageTasks) return
      setSelectedTaskIds((prev) => {
        const next = new Set(prev)
        if (shiftKey && lastToggledTaskIdRef.current) {
          // Range select
          const lastIdx = orderedTaskIds.indexOf(lastToggledTaskIdRef.current)
          const currentIdx = orderedTaskIds.indexOf(taskId)
          if (lastIdx !== -1 && currentIdx !== -1) {
            const start = Math.min(lastIdx, currentIdx)
            const end = Math.max(lastIdx, currentIdx)
            for (let i = start; i <= end; i++) {
              const id = orderedTaskIds[i]
              if (id) next.add(id)
            }
            return next
          }
        }
        if (next.has(taskId)) {
          next.delete(taskId)
        } else {
          next.add(taskId)
        }
        lastToggledTaskIdRef.current = taskId
        return next
      })
    },
    [canManageTasks, orderedTaskIds]
  )

  const handleClearSelection = useCallback(() => {
    setSelectedTaskIds(new Set())
    lastToggledTaskIdRef.current = null
  }, [])

  // Keyboard shortcuts for selection
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedTaskIds.size > 0) {
        handleClearSelection()
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "a" &&
        selectedTaskIds.size > 0
      ) {
        e.preventDefault()
        setSelectedTaskIds(new Set(orderedTaskIds))
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [selectedTaskIds.size, orderedTaskIds, handleClearSelection])

  // Clean up stale selections when tasks change
  useEffect(() => {
    const taskIdSet = new Set(tasks.map((t) => t.id))
    setSelectedTaskIds((prev) => {
      const next = new Set<string>()
      for (const id of prev) {
        if (taskIdSet.has(id)) next.add(id)
      }
      return next.size === prev.size ? prev : next
    })
  }, [tasks])

  const handleBulkChangeStatus = useCallback(
    (status: Status) => {
      onBulkUpdateTasks(Array.from(selectedTaskIds), { status })
      handleClearSelection()
    },
    [selectedTaskIds, onBulkUpdateTasks, handleClearSelection]
  )

  const handleBulkChangePriority = useCallback(
    (priority: Priority) => {
      onBulkUpdateTasks(Array.from(selectedTaskIds), { priority })
      handleClearSelection()
    },
    [selectedTaskIds, onBulkUpdateTasks, handleClearSelection]
  )

  const handleBulkChangeLabels = useCallback(
    (labels: string[]) => {
      onBulkUpdateTasks(Array.from(selectedTaskIds), { labels })
      handleClearSelection()
    },
    [selectedTaskIds, onBulkUpdateTasks, handleClearSelection]
  )

  const handleBulkDelete = useCallback(() => {
    onBulkDeleteTasks(Array.from(selectedTaskIds))
    handleClearSelection()
  }, [selectedTaskIds, onBulkDeleteTasks, handleClearSelection])

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
    if (!canManageTasks) return
    const task = event.active.data.current?.task as Task | undefined
    if (!task) return
    setActiveTask(task)

    // If the dragged task is part of the selection, drag all selected tasks
    // Otherwise, drag just this one task
    if (selectedTaskIds.has(task.id) && selectedTaskIds.size > 1) {
      setDraggedTaskIds(new Set(selectedTaskIds))
    } else {
      setDraggedTaskIds(new Set([task.id]))
    }
  }

  function handleDragOver(event: DragOverEvent) {
    if (!canManageTasks) return
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
    if (!canManageTasks) return
    const { active, over } = event
    const currentDraggedIds = draggedTaskIds
    setActiveTask(null)
    setDraggedTaskIds(new Set())
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

    const isMultiDrag = currentDraggedIds.size > 1

    if (isMultiDrag) {
      // Multi-drag: move all dragged tasks to target column
      const targetIndex =
        over.data.current?.type === "column"
          ? tasksByColumn[targetColumn].length
          : Math.max(
              0,
              tasksByColumn[targetColumn].findIndex((t) => t.id === overId)
            )

      onMoveMultipleTasks(
        Array.from(currentDraggedIds),
        targetColumn,
        targetIndex
      )
      handleClearSelection()
      return
    }

    // Single drag
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
        <div className="scrollbar-hide h-full overflow-y-auto px-3 py-2">
          {/* Requests group — rendered separately, outside DnD sortable */}
          {showRequests && tasksByColumn.requests.length > 0 && (
            <RequestsGroup
              tasks={tasksByColumn.requests}
              groupIndex={0}
              collapsed={collapsedColumns.includes("requests")}
              canManageTasks={canManageTasks}
              onToggleCollapsed={() => onToggleCollapsedColumn("requests")}
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
                isDropTarget={
                  overColumn === column.id &&
                  activeTaskSource !== null &&
                  activeTaskSource !== column.id
                }
                collapsed={collapsedColumns.includes(column.id)}
                selectedTaskIds={selectedTaskIds}
                draggedTaskIds={draggedTaskIds}
                canManageTasks={canManageTasks}
                onToggleCollapsed={() => onToggleCollapsedColumn(column.id)}
                onSelectTask={handleSelectTask}
                onToggleSelectTask={handleToggleSelectTask}
                onUpdateTask={onUpdateTask}
                onDeleteTask={onDeleteTask}
              />
            )
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <DragOverlayListRow
              task={activeTask}
              dragCount={draggedTaskIds.size}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <TaskDetailModal
        task={selectedTask}
        onClose={() => setSelectedTaskId(null)}
        onUpdate={onUpdateTask}
        onDelete={(taskId) => {
          onDeleteTask(taskId)
          setSelectedTaskId(null)
        }}
        onAccept={(task) => {
          onAcceptRequest(task)
          setSelectedTaskId(null)
        }}
        onDeny={(task) => {
          onDenyRequest(task)
          setSelectedTaskId(null)
        }}
        canManageTasks={canManageTasks}
      />

      {/* Bulk action toolbar */}
      {canManageTasks && selectedTaskIds.size > 0 && (
        <BulkActionToolbar
          selectedCount={selectedTaskIds.size}
          onChangeStatus={handleBulkChangeStatus}
          onChangePriority={handleBulkChangePriority}
          onChangeLabels={handleBulkChangeLabels}
          onDelete={handleBulkDelete}
          onClearSelection={handleClearSelection}
        />
      )}
    </>
  )
}

// ── Main Component ──

export function KanbanBoard() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth()
  const { currentWorkspace } = useWorkspace()
  const {
    tasksByWorkspace,
    collapsedColumnsByWorkspace,
    boardViewByWorkspace,
  } = useLocalFirstStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDefaultStatus, setModalDefaultStatus] = useState<Status>("todo")
  const [hiddenColumns, setHiddenColumns] = useState<Status[]>([])
  const [isCleaningDemoTasks, setIsCleaningDemoTasks] = useState(false)
  const [boardMounted, setBoardMounted] = useState(false)

  // Mark board as mounted after initial render to suppress entry animations on subsequent updates
  useEffect(() => {
    const timer = setTimeout(() => setBoardMounted(true), 800)
    return () => clearTimeout(timer)
  }, [])
  const [hasFetchedTasks, setHasFetchedTasks] = useState(false)
  const cleanedWorkspaceIds = useState(() => new Set<string>())[0]
  const lastLoadedWorkspaceIdRef = useRef<string | null>(null)
  const lastLocalChangeRef = useRef<number>(0)

  const workspaceId = currentWorkspace?._id
  const canManageTasks = hasTaskWritePermission(currentWorkspace?.role)
  const taskDocs = workspaceId ? tasksByWorkspace[workspaceId] : undefined
  const liveTaskDocs = useQuery(
    api.tasks.listByWorkspace,
    workspaceId ? { workspaceId } : "skip"
  )
  const collapsedColumns = useMemo(
    () =>
      workspaceId
        ? ((collapsedColumnsByWorkspace[workspaceId] ?? []) as Status[])
        : [],
    [collapsedColumnsByWorkspace, workspaceId]
  )
  const boardView: BoardView = workspaceId
    ? (boardViewByWorkspace[workspaceId] ?? "list")
    : "list"

  function handleViewChange(view: BoardView) {
    if (!workspaceId) return
    setWorkspaceBoardView(workspaceId, view)
  }

  const clearDemoTasks = useMutation(api.tasks.clearDemoTasks)
  const updateTask = useMutation(api.tasks.updateTask)
  const deleteTask = useMutation(api.tasks.deleteTask)
  const reorderTasks = useMutation(api.tasks.reorderTasks)
  const bulkUpdateTasks = useMutation(api.tasks.bulkUpdateTasks)
  const bulkDeleteTasks = useMutation(api.tasks.bulkDeleteTasks)

  const updateTaskWithAttachmentFallback = useCallback(
    async ({
      taskId,
      title,
      description,
      priority,
      labels,
      attachments,
    }: {
      taskId: Id<"tasks">
      title?: string
      description?: string
      priority?: Priority
      labels?: Label[]
      attachments?:
        | {
            storageId: Id<"_storage">
            name: string
            type: string
            size: number
            width?: number
            height?: number
            displayWidth?: number
          }[]
        | undefined
    }) => {
      try {
        return await updateTask({
          taskId,
          title,
          description,
          priority,
          labels,
          attachments,
        })
      } catch (error) {
        const shouldRetryWithoutAttachmentMetadata =
          attachments !== undefined &&
          error instanceof Error &&
          error.message.includes("attachments") &&
          error.message.includes("validator")

        if (!shouldRetryWithoutAttachmentMetadata) {
          throw error
        }

        return await updateTask({
          taskId,
          title,
          description,
          priority,
          labels,
          attachments: attachments.map(
            ({ width, height, displayWidth, ...attachment }) => attachment
          ) as {
            storageId: Id<"_storage">
            name: string
            type: string
            size: number
          }[],
        })
      }
    },
    [updateTask]
  )

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

    if (liveTaskDocs === undefined) {
      return
    }

    // Skip merge if we have recent local changes (optimistic updates in flight)
    const msSinceLocalChange = Date.now() - lastLocalChangeRef.current
    if (msSinceLocalChange < 2000 && hasFetchedTasks) {
      return
    }

    updateWorkspaceTasks(workspaceId, (currentTasks) => {
      const mergedTasks = mergeLiveTaskDocs(currentTasks, liveTaskDocs)
      return areTaskDocListsEqual(currentTasks, mergedTasks)
        ? currentTasks
        : mergedTasks
    })
    setHasFetchedTasks(true)
  }, [isAuthLoading, isAuthenticated, liveTaskDocs, workspaceId])

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
    if (!canManageTasks) {
      toast.error("Guests can only view tasks.")
      return
    }
    trackNewTaskModalOpened({ defaultStatus: status })
    setModalDefaultStatus(status)
    setModalOpen(true)
  }

  function handleShowColumn(status: Status) {
    setHiddenColumns((prev) => prev.filter((s) => s !== status))
  }

  function handleToggleCollapsedColumn(status: Status) {
    if (!workspaceId) return

    const willCollapse = !collapsedColumns.includes(status)
    trackColumnToggled({ column: status, collapsed: willCollapse })

    const nextCollapsed = willCollapse
      ? [...collapsedColumns, status]
      : collapsedColumns.filter((column) => column !== status)

    setCollapsedWorkspaceColumns(workspaceId, nextCollapsed)
  }

  function handleAcceptRequest(task: Task) {
    if (!workspaceId || !canManageTasks) return
    lastLocalChangeRef.current = Date.now()
    let snapshotBefore: TaskDoc[] | undefined
    updateWorkspaceTasks(workspaceId, (current) => {
      snapshotBefore = current
      return moveTaskDocs(current, task.id, "todo", 0)
    })
    toast.success(`Accepted "${task.title}" → Todo`)
    trackRequestAccepted({ taskId: task.id })
    if (isDevTask(task.id)) return
    // Read the freshly-written state for the server call
    const freshTasks =
      getLocalFirstStoreSnapshot().tasksByWorkspace[workspaceId] ?? []
    void reorderTasks({
      workspaceId,
      changes: freshTasks
        .filter((item) => !isDevTask(item._id))
        .map((item) => ({
          taskId: item._id as Id<"tasks">,
          status: item.status,
          order: item.order,
        })),
    }).catch(() => {
      if (snapshotBefore) setWorkspaceTasks(workspaceId, snapshotBefore)
      toast.error("Failed to accept request. Try again.")
    })
  }

  function handleDenyRequest(task: Task) {
    if (!workspaceId || !canManageTasks || task.id.startsWith("optimistic:"))
      return
    lastLocalChangeRef.current = Date.now()
    let removedTask: TaskDoc | undefined
    updateWorkspaceTasks(workspaceId, (current) => {
      removedTask = current.find((item) => item._id === task.id)
      return current.filter((item) => item._id !== task.id)
    })
    toast.success(`Denied "${task.title}".`)
    trackRequestDenied({ taskId: task.id })
    if (isDevTask(task.id)) return
    void deleteTask({ taskId: task.id as Id<"tasks"> }).catch(() => {
      if (removedTask) {
        updateWorkspaceTasks(workspaceId, (current) =>
          sortTaskDocs([...current, removedTask!])
        )
      }
      toast.error("Failed to deny request. Try again.")
    })
  }

  function handleUpdateTask(taskId: string, updates: Partial<Task>) {
    if (!workspaceId || !canManageTasks) return
    lastLocalChangeRef.current = Date.now()
    const previousTask = (
      getLocalFirstStoreSnapshot().tasksByWorkspace[workspaceId] ?? []
    ).find((task) => task._id === taskId)

    trackTaskUpdated({ taskId, fields: Object.keys(updates) })

    if (updates.status) {
      updateWorkspaceTasks(workspaceId, (current) => {
        const currentTask = current.find((task) => task._id === taskId)
        if (!currentTask) return current
        const targetIndex = current.filter(
          (task) => task.status === updates.status
        ).length
        return moveTaskDocs(current, taskId, updates.status!, targetIndex)
      })
      if (!isDevTask(taskId)) {
        const freshTasks =
          getLocalFirstStoreSnapshot().tasksByWorkspace[workspaceId] ?? []
        void reorderTasks({
          workspaceId,
          changes: freshTasks
            .filter((item) => !isDevTask(item._id))
            .map((item) => ({
              taskId: item._id as Id<"tasks">,
              status: item.status,
              order: item.order,
            })),
        })
      }
      return
    }

    if (taskId.startsWith("optimistic:")) return

    updateWorkspaceTasks(workspaceId, (tasks) =>
      patchTaskDocs(tasks, taskId, {
        title: updates.title,
        description: updates.description,
        priority: updates.priority,
        labels: updates.labels,
        attachments: updates.attachments as TaskDoc["attachments"],
        ...(updates.attachments !== undefined
          ? { _syncStatus: undefined }
          : {}),
      })
    )

    if (isDevTask(taskId)) return

    const nextAttachments = updates.attachments?.map(
      ({ url, ...attachment }) => attachment
    ) as
      | undefined
      | {
          storageId: Id<"_storage">
          name: string
          type: string
          size: number
          width?: number
          height?: number
          displayWidth?: number
        }[]

    void updateTaskWithAttachmentFallback({
      taskId: taskId as Id<"tasks">,
      title: updates.title,
      description: updates.description,
      priority: updates.priority,
      labels: updates.labels,
      attachments: nextAttachments,
    }).catch((error) => {
      const isAttachmentUpdate = updates.attachments !== undefined
      const shouldKeepLocalAttachmentState =
        isAttachmentUpdate &&
        error instanceof Error &&
        error.message.includes("attachments")

      if (shouldKeepLocalAttachmentState) {
        updateWorkspaceTasks(workspaceId, (tasks) =>
          patchTaskDocs(tasks, taskId, {
            attachments: updates.attachments as TaskDoc["attachments"],
            _syncStatus: "error",
          })
        )
        toast.error(
          "Attachment changes are only saved locally right now. They haven't synced to the server yet."
        )
        return
      }

      if (previousTask) {
        updateWorkspaceTasks(workspaceId, (tasks) =>
          tasks.map((task) => (task._id === taskId ? previousTask : task))
        )
      }

      toast.error("Task update failed. Try again.")
    })
  }

  function handleDeleteTask(taskId: string) {
    if (
      !workspaceId ||
      !taskDocs ||
      !canManageTasks ||
      taskId.startsWith("optimistic:")
    )
      return

    const deletedTask = taskDocs.find((task) => task._id === taskId)
    if (!deletedTask) return
    lastLocalChangeRef.current = Date.now()

    trackTaskDeleted({ taskId })

    updateWorkspaceTasks(workspaceId, (tasks) =>
      tasks.filter((t) => t._id !== taskId)
    )

    if (isDevTask(taskId)) {
      toast.success(`Deleted "${deletedTask.title}".`)
      return
    }

    void deleteTask({ taskId: taskId as Id<"tasks"> })
      .then(() => {
        toast.success(`Deleted "${deletedTask.title}".`)
      })
      .catch(() => {
        updateWorkspaceTasks(workspaceId, (tasks) => {
          const restoredTasks = [...tasks, deletedTask]
          return sortTaskDocs(restoredTasks)
        })
        toast.error("Task deletion failed. Try again.")
      })
  }

  function handleMoveTask(taskId: string, toStatus: Status, toIndex: number) {
    if (!workspaceId || !canManageTasks || taskId.startsWith("optimistic:"))
      return
    lastLocalChangeRef.current = Date.now()

    const fromTask = (
      getLocalFirstStoreSnapshot().tasksByWorkspace[workspaceId] ?? []
    ).find((t) => t._id === taskId)
    trackTaskMoved({
      taskId,
      fromStatus: fromTask?.status ?? "unknown",
      toStatus,
      method: "drag",
    })

    updateWorkspaceTasks(workspaceId, (current) =>
      moveTaskDocs(current, taskId, toStatus, toIndex)
    )
    const freshTasks =
      getLocalFirstStoreSnapshot().tasksByWorkspace[workspaceId] ?? []
    const realChanges = freshTasks.filter((item) => !isDevTask(item._id))
    if (realChanges.length > 0) {
      void reorderTasks({
        workspaceId,
        changes: realChanges.map((item) => ({
          taskId: item._id as Id<"tasks">,
          status: item.status,
          order: item.order,
        })),
      })
    }
  }

  function handleMoveMultipleTasks(
    taskIds: string[],
    toStatus: Status,
    toIndex: number
  ) {
    if (!workspaceId || !canManageTasks) return
    lastLocalChangeRef.current = Date.now()

    const validIds = taskIds.filter((id) => !id.startsWith("optimistic:"))
    if (validIds.length === 0) return

    updateWorkspaceTasks(workspaceId, (current) => {
      let result = current
      for (let i = 0; i < validIds.length; i++) {
        result = moveTaskDocs(result, validIds[i]!, toStatus, toIndex + i)
      }
      return result
    })
    const freshTasks =
      getLocalFirstStoreSnapshot().tasksByWorkspace[workspaceId] ?? []
    const realChanges = freshTasks.filter((item) => !isDevTask(item._id))
    if (realChanges.length > 0) {
      void reorderTasks({
        workspaceId,
        changes: realChanges.map((item) => ({
          taskId: item._id as Id<"tasks">,
          status: item.status,
          order: item.order,
        })),
      })
    }
  }

  function handleBulkUpdateTasks(
    taskIds: string[],
    updates: Partial<Pick<Task, "status" | "priority" | "labels">>
  ) {
    if (!workspaceId || !canManageTasks) return
    lastLocalChangeRef.current = Date.now()

    const validIds = taskIds.filter((id) => !id.startsWith("optimistic:"))
    if (validIds.length === 0) return

    const field = updates.status
      ? "status"
      : updates.priority
        ? "priority"
        : "labels"
    const value =
      updates.status ?? updates.priority ?? (updates.labels ?? []).join(",")
    trackTasksBulkUpdated({ taskCount: validIds.length, field, value })

    const realIds = validIds.filter((id) => !isDevTask(id))

    // Optimistic update
    if (updates.status) {
      updateWorkspaceTasks(workspaceId, (current) => {
        let result = current
        for (const id of validIds) {
          const targetIndex = result.filter(
            (t) => t.status === updates.status
          ).length
          result = moveTaskDocs(result, id, updates.status!, targetIndex)
        }
        return result
      })
      if (realIds.length > 0) {
        const freshTasks =
          getLocalFirstStoreSnapshot().tasksByWorkspace[workspaceId] ?? []
        void reorderTasks({
          workspaceId,
          changes: freshTasks
            .filter((item) => !isDevTask(item._id))
            .map((item) => ({
              taskId: item._id as Id<"tasks">,
              status: item.status,
              order: item.order,
            })),
        }).then(() => {
          toast.success(
            `Updated ${validIds.length} task${validIds.length > 1 ? "s" : ""}.`
          )
        })
      } else {
        toast.success(
          `Updated ${validIds.length} task${validIds.length > 1 ? "s" : ""}.`
        )
      }
    } else {
      updateWorkspaceTasks(workspaceId, (tasks) =>
        tasks.map((task) =>
          validIds.includes(task._id)
            ? {
                ...task,
                ...Object.fromEntries(
                  Object.entries(updates).filter(([, v]) => v !== undefined)
                ),
              }
            : task
        )
      )
      if (realIds.length > 0) {
        void bulkUpdateTasks({
          workspaceId,
          taskIds: realIds as Id<"tasks">[],
          priority: updates.priority,
          labels: updates.labels,
        }).then(() => {
          toast.success(
            `Updated ${validIds.length} task${validIds.length > 1 ? "s" : ""}.`
          )
        })
      } else {
        toast.success(
          `Updated ${validIds.length} task${validIds.length > 1 ? "s" : ""}.`
        )
      }
    }
  }

  function handleBulkDeleteTasks(taskIds: string[]) {
    lastLocalChangeRef.current = Date.now()
    if (!workspaceId || !taskDocs || !canManageTasks) return

    const validIds = taskIds.filter((id) => !id.startsWith("optimistic:"))
    if (validIds.length === 0) return

    trackTasksBulkDeleted({ taskCount: validIds.length })

    const realIds = validIds.filter((id) => !isDevTask(id))
    const deletedTasks = taskDocs.filter((t) => validIds.includes(t._id))

    updateWorkspaceTasks(workspaceId, (tasks) =>
      tasks.filter((t) => !validIds.includes(t._id))
    )

    if (realIds.length === 0) {
      toast.success(
        `Deleted ${validIds.length} task${validIds.length > 1 ? "s" : ""}.`
      )
      return
    }

    void bulkDeleteTasks({
      workspaceId,
      taskIds: realIds as Id<"tasks">[],
    })
      .then(() => {
        toast.success(
          `Deleted ${validIds.length} task${validIds.length > 1 ? "s" : ""}.`
        )
      })
      .catch(() => {
        updateWorkspaceTasks(workspaceId, (tasks) =>
          sortTaskDocs([...tasks, ...deletedTasks])
        )
        toast.error("Bulk deletion failed. Try again.")
      })
  }

  const labelConfig = useMemo<LabelConfig>(() => {
    const wsLabels = currentWorkspace?.labels
    const labels =
      wsLabels && wsLabels.length > 0 ? wsLabels : DEFAULT_WORKSPACE_LABELS
    return {
      names: labels.map((l) => l.name),
      colors: buildLabelColors(labels),
    }
  }, [currentWorkspace?.labels])

  if (
    !workspaceId ||
    (taskDocs === undefined &&
      (isAuthLoading || !hasFetchedTasks || isCleaningDemoTasks))
  ) {
    return <BoardLoadingState />
  }

  return (
    <BoardMountedContext.Provider value={boardMounted}>
      <LabelConfigContext.Provider value={labelConfig}>
        <div className="flex h-full flex-col">
          {!canManageTasks ? (
            <div className="mx-4 mt-4 rounded-[4px] bg-card px-3 py-3 text-[13px] text-muted-foreground ring-1 ring-border">
              You’re in guest mode. Tasks are read-only in this workspace.
            </div>
          ) : null}

          {/* Toolbar */}
          <div className="scrollbar-hide flex items-center gap-1 overflow-x-auto border-b border-border bg-sidebar/60 px-3 py-2 dark:bg-accent/30">
            <ViewToggle view={boardView} onViewChange={handleViewChange} />
            {hiddenColumns.length > 0 && (
              <HiddenColumnsToolbar
                hiddenColumns={hiddenColumns}
                onShow={handleShowColumn}
                tasks={tasks}
              />
            )}
          </div>

          {/* Content */}
          <div className="min-h-0 flex-1">
            {boardView === "board" ? (
              <ColumnBoardView
                tasks={tasks}
                hiddenColumns={hiddenColumns}
                canManageTasks={canManageTasks}
                onMoveTask={handleMoveTask}
                onMoveMultipleTasks={handleMoveMultipleTasks}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
                onBulkUpdateTasks={handleBulkUpdateTasks}
                onBulkDeleteTasks={handleBulkDeleteTasks}
                onAcceptRequest={handleAcceptRequest}
                onDenyRequest={handleDenyRequest}
              />
            ) : (
              <ListView
                tasks={tasks}
                hiddenColumns={hiddenColumns}
                collapsedColumns={collapsedColumns}
                canManageTasks={canManageTasks}
                onToggleCollapsedColumn={handleToggleCollapsedColumn}
                onMoveTask={handleMoveTask}
                onMoveMultipleTasks={handleMoveMultipleTasks}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
                onBulkUpdateTasks={handleBulkUpdateTasks}
                onBulkDeleteTasks={handleBulkDeleteTasks}
                onAcceptRequest={handleAcceptRequest}
                onDenyRequest={handleDenyRequest}
              />
            )}
          </div>

          {/* New task modal */}
          <NewTaskModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            defaultStatus={modalDefaultStatus}
          />
        </div>
      </LabelConfigContext.Provider>
    </BoardMountedContext.Provider>
  )
}
