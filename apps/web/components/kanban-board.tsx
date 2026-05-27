"use client"

import {
  createContext,
  Fragment,
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
import { useUser } from "@clerk/nextjs"
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
  Paperclip,
  X,
  Plus,
  FunnelSimple,
  MagnifyingGlass,
  DotsSixVertical,
  DotsThree,
  Users,
  At,
  Sparkle,
} from "@phosphor-icons/react"
import { NewTaskModal } from "@/components/new-task-modal"
import {
  AssigneeContextSubmenu,
  AssigneePickerContent,
  AssigneeStack,
  type TaskAssignee,
} from "@/components/assignee-picker"
import {
  TaskAttachmentGallery,
  cacheAttachmentPreview,
  getDefaultAttachmentDisplayWidth,
  type TaskAttachment,
} from "@/components/task-attachments"
import { TaskCommentsPanel } from "@/components/task-comments-panel"
import { LoadingState } from "@/components/loading-state"
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
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@workspace/ui/components/context-menu"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
  rectIntersection,
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
import { sanitizeExternalUrl } from "@/lib/task-sources"
import { useSearchPaletteTaskEvent } from "@/components/search-palette"
import {
  trackTaskUpdated,
  trackTaskDeleted,
  trackTaskMoved,
  trackTasksBulkUpdated,
  trackTasksBulkDeleted,
  trackColumnToggled,
  trackNewTaskModalOpened,
} from "@/lib/analytics"
import { useRequestActions } from "@/hooks/use-request-actions"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"

interface Task extends Omit<TaskDoc, "attachments"> {
  id: string
  createdAt: string
  attachments?: TaskAttachment[]
}

// Compute the intersection of assignees across the selected tasks. Only
// assignees present on every selected task are returned. Legacy
// single-assignee tasks (`task.assignee`) are intentionally excluded — that
// field uses display-name as the identifier, which would write fake user IDs
// back through the picker's onChange.
function computeCommonAssignees(
  tasks: Task[],
  selectedTaskIds: Set<string>
): TaskAssignee[] {
  if (selectedTaskIds.size === 0) return []
  const selected = tasks.filter((t) => selectedTaskIds.has(t.id))
  if (selected.length === 0) return []
  const first = (selected[0]!.assignees ?? []) as TaskAssignee[]
  if (first.length === 0) return []
  const common = new Map<string, TaskAssignee>()
  for (const a of first) common.set(a.userId, a)
  for (let i = 1; i < selected.length; i++) {
    const ids = new Set((selected[i]!.assignees ?? []).map((a) => a.userId))
    for (const userId of Array.from(common.keys())) {
      if (!ids.has(userId)) common.delete(userId)
    }
    if (common.size === 0) break
  }
  return Array.from(common.values())
}

// Column config — note: "requests" is intentionally absent. Requests now
// have their own dedicated tab at /app/requests.
const COLUMNS: { id: Status; label: string }[] = [
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

const UnreadMentionsContext = createContext<Record<string, number>>({})
function useUnreadMentionCount(taskId: string): number {
  return useContext(UnreadMentionsContext)[taskId] ?? 0
}

// ── Task detail side panel: width persistence ──
const TASK_PANEL_WIDTH_STORAGE_KEY = "median_task_panel_width_v1"
const TASK_PANEL_DEFAULT_WIDTH = 480
const TASK_PANEL_MIN_WIDTH = 360
const TASK_PANEL_MAX_WIDTH_PX = 960
const MOBILE_BREAKPOINT = 768

function clampTaskPanelWidth(width: number): number {
  if (typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT) {
    return Math.min(Math.max(width, 0), window.innerWidth)
  }
  const ceiling =
    typeof window === "undefined"
      ? TASK_PANEL_MAX_WIDTH_PX
      : Math.min(TASK_PANEL_MAX_WIDTH_PX, window.innerWidth * 0.7)
  return Math.min(Math.max(width, TASK_PANEL_MIN_WIDTH), ceiling)
}

function loadTaskPanelWidth(): number {
  if (typeof window === "undefined") return TASK_PANEL_DEFAULT_WIDTH
  try {
    const raw = window.localStorage.getItem(TASK_PANEL_WIDTH_STORAGE_KEY)
    if (!raw) return TASK_PANEL_DEFAULT_WIDTH
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return TASK_PANEL_DEFAULT_WIDTH
    return clampTaskPanelWidth(parsed)
  } catch {
    return TASK_PANEL_DEFAULT_WIDTH
  }
}

function saveTaskPanelWidth(width: number) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(TASK_PANEL_WIDTH_STORAGE_KEY, String(width))
  } catch {
    // ignore storage errors (private mode, full storage, etc.)
  }
}

// ── Task detail body: vertical split between description and comments ──
const TASK_COMMENT_SPLIT_STORAGE_KEY = "median_task_comment_split_v1"
const TASK_COMMENT_SPLIT_DEFAULT = 0.5
const TASK_COMMENT_SPLIT_MIN = 0.25
const TASK_COMMENT_SPLIT_MAX = 0.75

function clampCommentSplit(ratio: number): number {
  if (!Number.isFinite(ratio)) return TASK_COMMENT_SPLIT_DEFAULT
  return Math.min(
    Math.max(ratio, TASK_COMMENT_SPLIT_MIN),
    TASK_COMMENT_SPLIT_MAX
  )
}

function loadCommentSplitRatio(): number {
  if (typeof window === "undefined") return TASK_COMMENT_SPLIT_DEFAULT
  try {
    const raw = window.localStorage.getItem(TASK_COMMENT_SPLIT_STORAGE_KEY)
    if (!raw) return TASK_COMMENT_SPLIT_DEFAULT
    const parsed = Number(raw)
    return clampCommentSplit(parsed)
  } catch {
    return TASK_COMMENT_SPLIT_DEFAULT
  }
}

function saveCommentSplitRatio(ratio: number) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(TASK_COMMENT_SPLIT_STORAGE_KEY, String(ratio))
  } catch {
    // ignore
  }
}

const STATUS_LABELS = TASK_STATUS_LABELS

const SORTABLE_TRANSITION = {
  duration: 200,
  easing: "cubic-bezier(0.25, 1, 0.5, 1)",
}

const DROP_ANIMATION = {
  duration: 200,
  easing: "cubic-bezier(0.25, 1, 0.5, 1)",
}

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
    task.source.author === "cli"
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
  return tasks.map((task) => {
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
      | "assignees"
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
      JSON.stringify(current.assignees ?? null) !==
        JSON.stringify(next.assignees ?? null) ||
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

function BoardLoadingState() {
  return <LoadingState className="h-full" />
}

function EmptyBoardState({ onCreateTask }: { onCreateTask: () => void }) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-sm rounded-[8px] gradient-border gradient-border-to-tl gradient-border-from-neutral-700 gradient-border-via-neutral-800 gradient-border-to-neutral-600 bg-card p-5 text-center ring-1 ring-border"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
          className="mx-auto mb-4 flex size-12 items-center justify-center rounded-[8px] bg-accent text-foreground"
        >
          <SealCheck size={22} weight="fill" />
        </motion.div>
        <h2 className="text-[15px] font-semibold tracking-tight text-pretty">
          No tasks yet
        </h2>
        <p className="mt-2 text-[14px] leading-6 text-muted-foreground">
          This workspace starts empty now. Create your first task and the board
          will fill in immediately.
        </p>
        <button
          onClick={onCreateTask}
          className="mt-6 inline-flex h-8 items-center justify-center rounded-[8px] bg-primary px-3.5 text-[14px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
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
              className="flex items-center gap-1.5 rounded-[8px] bg-sidebar px-2 py-1 text-[13px] text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground dark:gradient-border dark:gradient-border-to-tl dark:gradient-border-from-neutral-700 dark:gradient-border-via-neutral-800 dark:gradient-border-to-neutral-600 bg-card"
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
                <span className="text-[13px] text-muted-foreground">
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
                className="flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground"
              >
                <Eye size={13} />
                Show column
              </button>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {selectedTasks.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-[14px] text-muted-foreground">
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
  api: { label: "API", color: "#0ea5e9", bg: "#0ea5e918" },
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
  if (platform === "api") {
    return (
      <svg
        width={s}
        height={s}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#0ea5e9"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="8 6 2 12 8 18" />
        <polyline points="16 6 22 12 16 18" />
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

// ── Context Menu ──
//
// All positioning, focus, keyboard nav, safe-triangle submenu hovering,
// single-active-submenu coordination, viewport collision avoidance and
// theming come from base-ui's <ContextMenu> primitive — wrapped in
// @workspace/ui/components/context-menu. We only describe the items.

function TaskContextMenuContent({
  task,
  onUpdate,
  onDelete,
  canManageTasks,
}: {
  task: Task
  onUpdate: (taskId: string, updates: Partial<Task>) => void
  onDelete: (taskId: string) => void
  canManageTasks: boolean
}) {
  const labelConfig = useLabelConfig()

  function toggleLabel(label: Label) {
    const labels = task.labels ?? []
    const has = labels.includes(label)
    const updated = has ? labels.filter((l) => l !== label) : [...labels, label]
    onUpdate(task.id, { labels: updated })
  }

  return (
    <ContextMenuContent>
      {!canManageTasks ? (
        <div className="px-2 py-1.5 text-[13px] text-muted-foreground">
          Guests can only view tasks.
        </div>
      ) : null}

      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={!canManageTasks}>
          {getStatusIcon(task.status, 14)}
          <span>Status</span>
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {ALL_STATUSES.map((s) => (
            <ContextMenuItem
              key={s}
              disabled={!canManageTasks}
              onClick={() => onUpdate(task.id, { status: s })}
              className={task.status === s ? "font-medium" : ""}
            >
              {getStatusIcon(s, 14)}
              <span>{STATUS_LABELS[s]}</span>
              {task.status === s && (
                <Check size={12} weight="bold" className="ml-auto" />
              )}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={!canManageTasks}>
          {getPriorityIcon(task.priority, 14)}
          <span>Priority</span>
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {ALL_PRIORITIES.map((p) => (
            <ContextMenuItem
              key={p}
              disabled={!canManageTasks}
              onClick={() => onUpdate(task.id, { priority: p })}
              className={task.priority === p ? "font-medium" : ""}
            >
              {getPriorityIcon(p, 14)}
              <span>{PRIORITY_LABELS[p]}</span>
              {task.priority === p && (
                <Check size={12} weight="bold" className="ml-auto" />
              )}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={!canManageTasks}>
          <Tag size={14} />
          <span>Labels</span>
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {labelConfig.names.map((label) => (
            <ContextMenuCheckboxItem
              key={label}
              disabled={!canManageTasks}
              checked={(task.labels ?? []).includes(label)}
              onCheckedChange={() => toggleLabel(label)}
              closeOnClick={false}
              className="capitalize"
            >
              <div
                className="size-2.5 shrink-0 rounded-[8px]"
                style={{ backgroundColor: labelConfig.colors[label] ?? "#888" }}
              />
              <span>{label}</span>
            </ContextMenuCheckboxItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>

      <AssigneeContextSubmenu
        workspaceId={task.workspaceId}
        assignees={(task.assignees ?? []) as TaskAssignee[]}
        disabled={!canManageTasks}
        onChange={(next) =>
          onUpdate(task.id, {
            assignees: next.map((a) => ({
              userId: a.userId,
              name: a.name,
              imageUrl: a.imageUrl ?? undefined,
            })),
          })
        }
      />

      <ContextMenuSeparator />

      <ContextMenuItem
        variant="destructive"
        disabled={!canManageTasks}
        onClick={() => onDelete(task.id)}
      >
        <Trash size={14} />
        <span>Delete task</span>
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

// ── List View Components ──

const UnreadMentionBadge = memo(function UnreadMentionBadge({
  taskId,
}: {
  taskId: string
}) {
  const count = useUnreadMentionCount(taskId)
  if (count === 0) return null
  return (
    <span
      title={`${count} unread mention${count === 1 ? "" : "s"}`}
      aria-label={`${count} unread mention${count === 1 ? "" : "s"}`}
      className="inline-flex h-[18px] min-w-[18px] items-center justify-center gap-0.5 rounded-full bg-primary/15 px-1 text-[11px] font-semibold text-primary ring-1 ring-primary/30"
    >
      <At size={10} weight="bold" aria-hidden="true" />
      {count > 1 ? <span>{count}</span> : null}
    </span>
  )
})

const AgentBadge = memo(function AgentBadge({
  agentName,
}: {
  agentName: string
}) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-[8px] border border-yellow-500/25 bg-yellow-500/10 px-1.5 py-0.5 text-[11px] font-medium text-yellow-500">
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
      <span className="hidden w-14 shrink-0 font-mono text-[12px] text-muted-foreground/50 tabular-nums sm:inline">
        {task.taskCode}
      </span>
      <div className="shrink-0">{getPriorityIcon(task.priority)}</div>
      <div className="shrink-0">{getStatusIcon(task.status)}</div>
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground/90">
        {task.title}
      </span>
      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
        <UnreadMentionBadge taskId={task.id} />
        {activeAgent && <AgentBadge agentName={activeAgent} />}
        {(task.labels ?? []).map((label) => (
          <span
            key={label}
            className="rounded-[8px] px-2 py-0.5 text-[11px] font-medium capitalize"
            style={{
              backgroundColor: (labelColors[label] ?? "#888") + "18",
              color: labelColors[label] ?? "#888",
            }}
          >
            {label}
          </span>
        ))}
        {(task.assignees ?? []).length > 0 ? (
          <AssigneeStack
            assignees={(task.assignees ?? []) as TaskAssignee[]}
            size={18}
            max={3}
          />
        ) : null}
        <span className="ml-1 text-[12px] text-muted-foreground/60">
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
  const boardMounted = useBoardMounted()
  const isMobile = useIsMobile()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", task },
    transition: SORTABLE_TRANSITION,
    disabled: !canManageTasks || isMobile,
  })

  const [hasAnimated, setHasAnimated] = useState(boardMounted)
  const rowDelay = groupDelay + Math.min(rowIndex, 8) * 0.02
  // Keep the row's layout slot in place while dragging — only fade.
  // Collapsing height/padding makes siblings reflow under dnd-kit's measurements
  // and produces the jittery over-target behavior we used to see.
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : isDraggedAway ? 0.4 : undefined,
    pointerEvents: isDragging || isDraggedAway ? "none" : undefined,
    willChange: transform ? "transform" : undefined,
    ...(!hasAnimated && !isDragging
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

  const handleCheckboxClick = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation()
      onToggleSelect(task.id, e.shiftKey)
    },
    [onToggleSelect, task.id]
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={handleClick}
        onAnimationEnd={() => setHasAnimated(true)}
        className={`group flex cursor-pointer items-center gap-3 border-b border-l-2 border-border px-3 py-2 transition-[background-color,box-shadow,opacity] duration-150 select-none hover:bg-accent/40 ${isMobile ? "" : "touch-none"} ${PRIORITY_ACCENT[task.priority]} ${isSelected ? "bg-primary/[0.06] hover:bg-primary/[0.10]" : "bg-white dark:bg-background"}`}
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
      </ContextMenuTrigger>
      <TaskContextMenuContent
        task={task}
        onUpdate={onUpdate}
        onDelete={onDelete}
        canManageTasks={canManageTasks}
      />
    </ContextMenu>
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
          <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-[8px] bg-muted ring-1 ring-border" />
          {dragCount > 2 && (
            <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-[8px] bg-muted/60 ring-1 ring-border" />
          )}
        </>
      )}
      <div className="relative w-[240px] rounded-[8px] bg-background shadow-lg ring-2 ring-primary/40 dark:bg-card">
        <div className="p-2.5 pb-0">
          {dragCount > 1 && (
            <span className="float-right ml-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
              {dragCount}
            </span>
          )}
          <p className="mb-2 line-clamp-2 text-[14px] leading-snug font-medium text-foreground/90">
            {task.title}
          </p>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="shrink-0">
                {getPriorityIcon(task.priority, 12)}
              </div>
              <UnreadMentionBadge taskId={task.id} />
              {activeAgent && <AgentBadge agentName={activeAgent} />}
              {(task.labels ?? []).map((label) => (
                <span
                  key={label}
                  className="rounded-[8px] px-1.5 py-0.5 text-[10px] font-medium capitalize"
                  style={{
                    backgroundColor: (labelColors[label] ?? "#888") + "18",
                    color: labelColors[label] ?? "#888",
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
            <SourceIcons task={task} />
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-border px-2.5 py-1.5">
          <span className="text-[11px] text-muted-foreground/50">
            {task.createdAt}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground/50 tabular-nums">
            {task.taskCode}
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
        <span className="truncate text-[14px] font-medium">{task.title}</span>
        {dragCount > 1 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[12px] font-semibold text-primary-foreground">
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
  overItemId,
  overItemAtEnd,
  activeTaskId,
  collapsed,
  selectedTaskIds,
  draggedTaskIds,
  canManageTasks,
  onToggleCollapsed,
  onSelectTask,
  onToggleSelectTask,
  onUpdateTask,
  onDeleteTask,
  onAddTask,
}: {
  column: (typeof COLUMNS)[number]
  tasks: Task[]
  groupIndex: number
  isDropTarget?: boolean
  overItemId: string | null
  overItemAtEnd: boolean
  activeTaskId: string | null
  collapsed: boolean
  selectedTaskIds: Set<string>
  draggedTaskIds: Set<string>
  canManageTasks: boolean
  onToggleCollapsed: () => void
  onSelectTask: (task: Task) => void
  onToggleSelectTask: (taskId: string, shiftKey: boolean) => void
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
  onAddTask: (status: Status) => void
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
      className="mb-1.5 overflow-hidden rounded-[8px] ring-1 ring-border"
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
          className="text-[11px] text-muted-foreground/60"
          style={{
            display: "inline-block",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </span>
        {getColumnIcon(column.id)}
        <span className="text-[14px] font-semibold tracking-tight">
          {column.label}
        </span>
        <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-[8px] bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
          {tasks.length}
        </span>
        {canManageTasks && (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation()
              onAddTask(column.id)
            }}
            className="ml-auto rounded-[8px] p-0.5 text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
            title={`Add task to ${column.label}`}
          >
            <Plus size={14} />
          </span>
        )}
      </button>

      {/* Rows */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <SortableContext
              items={taskIds}
              strategy={verticalListSortingStrategy}
            >
              {tasks.length === 0
                ? null
                : tasks.map((task, rowIndex) => {
                    const isLast = rowIndex === tasks.length - 1
                    const isOverMe =
                      overItemId === task.id &&
                      activeTaskId !== null &&
                      activeTaskId !== task.id
                    const showIndicatorBefore =
                      isOverMe && !(isLast && overItemAtEnd)
                    const showIndicatorAfter =
                      isOverMe && isLast && overItemAtEnd
                    return (
                      <Fragment key={task.id}>
                        {showIndicatorBefore && (
                          <motion.div
                            initial={{ opacity: 0, scaleX: 0.5 }}
                            animate={{ opacity: 1, scaleX: 1 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            style={{ originX: 0 }}
                            className="relative flex items-center"
                          >
                            <div className="absolute -left-0.5 z-10 size-2 rounded-full bg-primary" />
                            <div className="h-0.5 w-full bg-primary" />
                          </motion.div>
                        )}
                        <SortableListRow
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
                        {showIndicatorAfter && (
                          <motion.div
                            initial={{ opacity: 0, scaleX: 0.5 }}
                            animate={{ opacity: 1, scaleX: 1 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            style={{ originX: 0 }}
                            className="relative flex items-center"
                          >
                            <div className="absolute -left-0.5 z-10 size-2 rounded-full bg-primary" />
                            <div className="h-0.5 w-full bg-primary" />
                          </motion.div>
                        )}
                      </Fragment>
                    )
                  })}
            </SortableContext>
          </motion.div>
        )}
      </AnimatePresence>
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
const FILTER_STATUSES: Status[] = ["requests", ...ALL_STATUSES]
const ALL_PRIORITIES: Priority[] = ["urgent", "high", "medium", "low", "none"]
// ALL_LABELS is now dynamic from workspace config via LabelConfigContext

const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
}

function TaskDetailSidePanel({
  task,
  width,
  onWidthChange,
  onClose,
  onUpdate,
  onDelete,
  onAccept,
  onDeny,
  canManageTasks,
}: {
  task: Task | null
  width: number
  onWidthChange: (width: number) => void
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
  const [uploading, setUploading] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [commentSplitRatio, setCommentSplitRatio] = useState<number>(() =>
    loadCommentSplitRatio()
  )
  const [isSplitResizing, setIsSplitResizing] = useState(false)
  const splitContainerRef = useRef<HTMLDivElement | null>(null)
  const markTaskMentionsRead = useMutation(
    api.taskComments.markTaskMentionsRead
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const normalizedAssignees: TaskAssignee[] =
    task?.assignees ??
    (task?.assignee
      ? [
          {
            userId: task.assignee.name,
            name: task.assignee.name,
            imageUrl: task.assignee.avatar || undefined,
          },
        ]
      : [])

  // The portal target lives in the (app) layout as a flex sibling of
  // SidebarInset. Resolving it on mount keeps the panel out of the inset card
  // so it can sit at the layout's top level alongside the sidebar/inset.
  useEffect(() => {
    setPortalTarget(document.getElementById("task-panel-portal"))
  }, [])

  useEffect(() => {
    setEditingTitle(false)
    setTitleValue("")
    setEditingDesc(false)
    setDescValue("")
  }, [task?.id])

  const attachmentsRef = useRef<{
    taskId: string | null
    attachments: TaskAttachment[] | undefined
  }>({ taskId: task?.id ?? null, attachments: task?.attachments })
  if (task && task.id === attachmentsRef.current.taskId) {
    attachmentsRef.current.attachments = task.attachments
  } else if (task) {
    attachmentsRef.current = { taskId: task.id, attachments: task.attachments }
  }
  const generateUploadUrl = useMutation(api.workspaces.generateUploadUrl)

  const readImageMetadata = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      return null
    }

    return await new Promise<{
      width: number
      height: number
      displayWidth: number
    } | null>((resolve) => {
      const objectUrl = URL.createObjectURL(file)
      const image = new Image()

      image.onload = () => {
        const width = image.naturalWidth
        const height = image.naturalHeight
        URL.revokeObjectURL(objectUrl)
        resolve({
          width,
          height,
          displayWidth: getDefaultAttachmentDisplayWidth(width),
        })
      }

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        resolve(null)
      }

      image.src = objectUrl
    })
  }, [])

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!task || !canManageTasks) return

      const files = e.target.files
      if (!files || files.length === 0) return

      setUploading(true)

      const newAttachments: TaskAttachment[] = []

      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`File "${file.name}" exceeds 10MB limit.`)
          continue
        }

        let previewUrl: string | undefined
        try {
          const imageMetadata = await readImageMetadata(file)
          previewUrl = file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : undefined

          const uploadUrl = await generateUploadUrl()
          const result = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          })

          if (!result.ok) {
            if (previewUrl) URL.revokeObjectURL(previewUrl)
            toast.error(`Failed to upload "${file.name}".`)
            continue
          }

          const { storageId } = await result.json()

          if (previewUrl) {
            cacheAttachmentPreview(storageId, previewUrl)
          }

          newAttachments.push({
            storageId,
            name: file.name,
            type: file.type,
            size: file.size,
            width: imageMetadata?.width,
            height: imageMetadata?.height,
            displayWidth: imageMetadata?.displayWidth,
            url: previewUrl,
          })
        } catch {
          if (previewUrl) URL.revokeObjectURL(previewUrl)
          toast.error(`Failed to upload "${file.name}".`)
        }
      }

      if (newAttachments.length > 0) {
        const ref = attachmentsRef.current
        const existing = ref.taskId === task.id ? (ref.attachments ?? []) : []
        onUpdate(task.id, { attachments: [...existing, ...newAttachments] })
      }

      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    },
    [canManageTasks, generateUploadUrl, onUpdate, readImageMetadata, task]
  )

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

  const taskSources = task ? getTaskSources(task) : []
  const activeAgent = task ? getActiveAgent(task) : null

  const handleClose = useCallback(() => {
    setEditingTitle(false)
    setEditingDesc(false)
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!task) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose()
    }
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [task, handleClose])

  useEffect(() => {
    if (!editingTitle) return
    const el = titleRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [editingTitle, titleValue])

  // Persist width changes to localStorage when not actively resizing
  useEffect(() => {
    if (isResizing) return
    saveTaskPanelWidth(width)
  }, [isResizing, width])

  // Re-clamp width when the viewport size changes
  useEffect(() => {
    function handleResize() {
      const next = clampTaskPanelWidth(width)
      if (next !== width) onWidthChange(next)
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [width, onWidthChange])

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = width
      setIsResizing(true)

      // Disable text selection while dragging
      const previousUserSelect = document.body.style.userSelect
      const previousCursor = document.body.style.cursor
      document.body.style.userSelect = "none"
      document.body.style.cursor = "col-resize"

      function onMove(ev: PointerEvent) {
        // Dragging the handle leftward grows the panel (handle on left edge)
        const dx = startX - ev.clientX
        onWidthChange(clampTaskPanelWidth(startWidth + dx))
      }

      function onUp() {
        setIsResizing(false)
        document.body.style.userSelect = previousUserSelect
        document.body.style.cursor = previousCursor
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
      }

      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    },
    [width, onWidthChange]
  )

  // Persist split ratio after the drag completes.
  useEffect(() => {
    if (isSplitResizing) return
    saveCommentSplitRatio(commentSplitRatio)
  }, [isSplitResizing, commentSplitRatio])

  const handleSplitResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const container = splitContainerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      if (rect.height <= 0) return

      setIsSplitResizing(true)
      const previousUserSelect = document.body.style.userSelect
      const previousCursor = document.body.style.cursor
      document.body.style.userSelect = "none"
      document.body.style.cursor = "row-resize"

      function onMove(ev: PointerEvent) {
        const offsetY = rect.bottom - ev.clientY
        const nextRatio = clampCommentSplit(offsetY / rect.height)
        setCommentSplitRatio(nextRatio)
      }

      function onUp() {
        setIsSplitResizing(false)
        document.body.style.userSelect = previousUserSelect
        document.body.style.cursor = previousCursor
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
      }

      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    },
    []
  )

  // Mark this task's mentions as read whenever the panel opens or
  // switches to a different task.
  useEffect(() => {
    if (!task) return
    void markTaskMentionsRead({
      workspaceId: task.workspaceId as Id<"workspaces">,
      taskId: task.id as Id<"tasks">,
    }).catch(() => {
      // ignore — read-marking is best-effort
    })
  }, [task?.id, task?.workspaceId, markTaskMentionsRead])

  const panelContent = (
    <AnimatePresence initial={false}>
      {task && (
        <motion.aside
          key="task-detail-panel"
          initial={{ width: 0 }}
          animate={{ width }}
          exit={{ width: 0 }}
          transition={
            isResizing
              ? { duration: 0 }
              : { duration: 0.45, ease: "anticipate" }
          }
          className="relative shrink-0 self-stretch overflow-hidden"
        >
          {/* Resize handle (left edge) — sibling of inner card so it isn't clipped */}
          <div
            onPointerDown={handleResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize task panel"
            className="group absolute inset-y-0 left-0 z-30 flex w-3 cursor-col-resize items-center justify-center"
          >
            <div
              className={`absolute inset-y-0 left-0 w-px transition-colors ${
                isResizing
                  ? "bg-primary"
                  : "bg-transparent group-hover:bg-primary/40"
              }`}
            />
            <div
              className={`relative flex h-8 w-3 items-center justify-center rounded-full bg-background text-muted-foreground/60 opacity-0 ring-1 ring-border transition-opacity group-hover:opacity-100 ${
                isResizing ? "text-primary opacity-100 ring-primary/50" : ""
              }`}
            >
              <DotsSixVertical size={10} weight="bold" />
            </div>
          </div>

          {/* Inner card — sits as its own top-level card on the bg-sidebar
              gap, mirroring SidebarInset's rounded + ring treatment. The 6px
              left inset (width - 6) leaves a visible gap between this card
              and SidebarInset on the left. */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.45, ease: "anticipate" }}
            className="absolute top-px right-0 bottom-px flex flex-col overflow-hidden rounded-[8px] bg-background ring-1 ring-sidebar-border"
            style={{ width: `${Math.max(width - 6, 1)}px` }}
          >
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex min-h-0 flex-1 flex-col"
            >
              {/* ── Header: Title + Meta + Top-right actions ── */}
              <div className="relative px-5 pt-5 pb-3">
                {/* Top-right action cluster */}
                <div className="absolute top-4 right-4 flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      disabled={!canManageTasks}
                      className="rounded-[8px] p-1.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      title="More actions"
                    >
                      <DotsThree size={16} weight="bold" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="bottom" align="end">
                      <DropdownMenuItem
                        disabled={!canManageTasks}
                        onClick={() => onDelete(task.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <div className="flex items-center gap-2">
                          <Trash size={13} />
                          <span>Delete task</span>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button
                    onClick={handleClose}
                    className="rounded-[8px] p-1.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                    title="Close"
                  >
                    <X size={14} weight="bold" />
                  </button>
                </div>

                {/* Title */}
                <div className="pr-16">
                  <span className="sr-only">{task.title}</span>
                  {editingTitle ? (
                    <textarea
                      ref={titleRef}
                      autoFocus
                      rows={1}
                      value={titleValue}
                      onChange={(e) => setTitleValue(e.target.value)}
                      onBlur={handleTitleSave}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault()
                          handleTitleSave()
                        }
                        if (e.key === "Escape") {
                          e.preventDefault()
                          e.stopPropagation()
                          setTitleValue(task.title)
                          setEditingTitle(false)
                        }
                      }}
                      className="block w-full resize-none overflow-hidden bg-transparent text-[17px] leading-snug font-semibold tracking-tight break-words outline-none"
                    />
                  ) : (
                    <h2
                      onClick={() => {
                        if (!canManageTasks) return
                        setTitleValue(task.title)
                        setEditingTitle(true)
                      }}
                      className={`text-[17px] leading-snug font-semibold tracking-tight break-words transition-colors ${canManageTasks ? "cursor-text" : ""}`}
                    >
                      {task.title}
                    </h2>
                  )}
                </div>

                {/* Meta row: task code · date */}
                <div className="mt-1.5 flex items-center gap-2 text-[12px] text-muted-foreground/60">
                  <span className="font-mono">{task.taskCode}</span>
                  <span className="text-muted-foreground/30">·</span>
                  <span>{task.createdAt}</span>
                </div>
              </div>

              {/* ── Properties row (Status, Priority, Labels, Assignees) — floating, borderless ── */}
              <div className="flex flex-wrap items-center gap-1 px-4 pb-3">
                {/* Status */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={!canManageTasks}
                    className="flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {getStatusIcon(task.status, 12)}
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
                    className="flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {getPriorityIcon(task.priority, 12)}
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
                    className="flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {(task.labels ?? []).length > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <div className="flex -space-x-0.5">
                          {(task.labels ?? []).map((label) => (
                            <div
                              key={label}
                              className="size-2 rounded-full ring-1 ring-background"
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
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Tag size={12} />
                        <span>Labels</span>
                      </div>
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
                            className="size-2.5 rounded-full"
                            style={{
                              backgroundColor:
                                labelConfig.colors[label] ?? "#888",
                            }}
                          />
                          <span>{label}</span>
                          {(task.labels ?? []).includes(label) && (
                            <Check
                              size={12}
                              weight="bold"
                              className="ml-auto text-primary"
                            />
                          )}
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Assignees */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={!canManageTasks}
                    className="flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {normalizedAssignees.length > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <AssigneeStack
                          assignees={normalizedAssignees}
                          size={16}
                        />
                        <span>
                          {normalizedAssignees.length === 1
                            ? (normalizedAssignees[0]?.name ?? "Assignee")
                            : `${normalizedAssignees.length} assignees`}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Users size={12} />
                        <span>Assign</span>
                      </div>
                    )}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="bottom"
                    align="start"
                    className="w-auto p-0"
                  >
                    <AssigneePickerContent
                      workspaceId={task.workspaceId}
                      assignees={normalizedAssignees}
                      onChange={(next) =>
                        onUpdate(task.id, {
                          assignees: next.map((a) => ({
                            userId: a.userId,
                            name: a.name,
                            imageUrl: a.imageUrl ?? undefined,
                          })),
                        })
                      }
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Hidden file input (Attach lives inline in description) */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* ── Accept / Deny row — only for incoming requests ── */}
              {task.status === "requests" && onAccept && onDeny && (
                <div className="flex items-center gap-1.5 border-t border-border bg-muted/30 px-5 py-2.5">
                  <button
                    disabled={!canManageTasks}
                    onClick={() => {
                      onAccept(task)
                      handleClose()
                    }}
                    className="flex items-center gap-1.5 rounded-[8px] border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[12px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
                  >
                    <CheckCircle size={13} weight="fill" />
                    Accept
                  </button>
                  <button
                    disabled={!canManageTasks}
                    onClick={() => {
                      onDeny(task)
                      handleClose()
                    }}
                    className="flex items-center gap-1.5 rounded-[8px] border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-500/20 disabled:opacity-50 dark:text-red-400"
                  >
                    <XCircle size={13} />
                    Deny
                  </button>
                </div>
              )}

              {/* Top divider for body section */}
              <div className="border-t border-border" />

              {/* ── Body: Description scrolls naturally; Comments float as a card on top ── */}
              <div
                ref={splitContainerRef}
                className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <div
                  className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-4"
                  style={{
                    paddingBottom: `calc(${commentSplitRatio * 100}% + 32px)`,
                  }}
                >
                  {task._syncStatus === "error" ? (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-4 flex items-start gap-2 rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-200"
                    >
                      <WarningCircle
                        size={14}
                        weight="fill"
                        className="mt-0.5 shrink-0 text-amber-400"
                      />
                      <span className="leading-relaxed">
                        Attachment changes are visible locally, but they have
                        not synced to the server yet.
                      </span>
                    </motion.div>
                  ) : null}

                  {/* Description */}
                  <div className="flex-1">
                    {editingDesc ? (
                      <textarea
                        autoFocus
                        value={descValue}
                        onChange={(e) => setDescValue(e.target.value)}
                        onBlur={handleDescSave}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault()
                            e.stopPropagation()
                            setDescValue(task.description ?? "")
                            setEditingDesc(false)
                          }
                        }}
                        placeholder="Add a description..."
                        className="min-h-[180px] w-full resize-none rounded-[8px] bg-transparent text-[14px] leading-relaxed text-foreground/80 outline-none placeholder:text-muted-foreground/40"
                      />
                    ) : (
                      <div
                        onClick={() => {
                          if (!canManageTasks) return
                          setDescValue(task.description ?? "")
                          setEditingDesc(true)
                        }}
                        className={`min-h-[180px] text-[14px] leading-relaxed transition-colors ${canManageTasks ? "cursor-text" : ""}`}
                      >
                        {task.description ? (
                          <span className="block break-words whitespace-pre-wrap text-foreground/80">
                            {task.description}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">
                            Add a description...
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Attachments */}
                  {task.attachments && task.attachments.length > 0 ? (
                    <div className="mt-4 border-t border-border pt-4">
                      <TaskAttachmentGallery
                        attachments={task.attachments}
                        workspaceId={task.workspaceId}
                        canManageAttachments={canManageTasks}
                        onAttachmentsChange={(attachments) =>
                          onUpdate(task.id, { attachments })
                        }
                      />
                    </div>
                  ) : null}

                  {/* Inline attach affordance */}
                  <div className="mt-3">
                    <button
                      disabled={!canManageTasks || uploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      title="Attach files"
                    >
                      {uploading ? (
                        <SpinnerGap size={13} className="animate-spin" />
                      ) : (
                        <Paperclip size={13} />
                      )}
                      {uploading ? "Uploading..." : "Attach files"}
                    </button>
                  </div>
                </div>

                {/* Floating Comments card — sits on top of the description */}
                <div
                  className="pointer-events-none absolute right-3 bottom-3 left-3"
                  style={{ height: `${commentSplitRatio * 100}%` }}
                >
                  <div className="pointer-events-auto flex h-full min-h-[180px] flex-col overflow-hidden rounded-[16px] border border-border bg-card shadow-xl shadow-black/20 ring-1 ring-black/[0.03]">
                    {/* Drag handle to grow/shrink the floating card */}
                    <div
                      onPointerDown={handleSplitResizeStart}
                      role="separator"
                      aria-orientation="horizontal"
                      aria-label="Resize comments card"
                      className="group relative flex h-3 shrink-0 cursor-row-resize items-center justify-center"
                    >
                      <div
                        className={`h-1 w-9 rounded-full transition-colors ${
                          isSplitResizing
                            ? "bg-primary"
                            : "bg-muted-foreground/30 group-hover:bg-muted-foreground/60"
                        }`}
                      />
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                      <TaskCommentsPanel
                        workspaceId={task.workspaceId as Id<"workspaces">}
                        taskId={task.id as Id<"tasks">}
                        canComment={canManageTasks}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Bottom toolbar: Sources only ── */}
              {(taskSources.length > 0 || activeAgent) && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
                  {taskSources.map((src) => {
                    const cfg = SOURCE_CONFIG[src.platform]
                    const safeUrl = sanitizeExternalUrl(src.url)
                    return safeUrl ? (
                      <a
                        key={`${src.platform}-${src.url}-${src.author}`}
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] font-medium transition-opacity hover:opacity-80"
                        style={{
                          backgroundColor: cfg.bg,
                          color: cfg.color,
                        }}
                      >
                        <SourceIcon platform={src.platform} size={12} />
                        <span>{src.author}</span>
                        <LinkIcon size={10} className="opacity-50" />
                      </a>
                    ) : (
                      <span
                        key={`${src.platform}-${src.url}-${src.author}`}
                        className="flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] font-medium"
                        style={{
                          backgroundColor: cfg.bg,
                          color: cfg.color,
                        }}
                      >
                        <SourceIcon platform={src.platform} size={12} />
                        <span>{src.author}</span>
                      </span>
                    )
                  })}
                  {activeAgent && (
                    <span className="flex items-center gap-1.5 rounded-[8px] bg-emerald-500/10 px-2.5 py-1.5 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
                      <span className="text-[13px]">
                        {getAgentIcon(activeAgent)}
                      </span>
                      <span className="capitalize">{activeAgent}</span>
                    </span>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        </motion.aside>
      )}
    </AnimatePresence>
  )

  if (!portalTarget) {
    return null
  }

  return createPortal(panelContent, portalTarget)
}

// ── Bulk Action Toolbar ──

function BulkActionToolbar({
  selectedCount,
  workspaceId,
  commonAssignees,
  onChangeStatus,
  onChangePriority,
  onChangeLabels,
  onChangeAssignees,
  onCleanUp,
  isCleaningUp,
  onDelete,
  onClearSelection,
}: {
  selectedCount: number
  workspaceId: Id<"workspaces"> | undefined
  commonAssignees: TaskAssignee[]
  onChangeStatus: (status: Status) => void
  onChangePriority: (priority: Priority) => void
  onChangeLabels: (labels: string[]) => void
  onChangeAssignees: (assignees: TaskAssignee[]) => void
  onCleanUp: () => void
  isCleaningUp: boolean
  onDelete: () => void
  onClearSelection: () => void
}) {
  const labelConfig = useLabelConfig()

  return createPortal(
    <div className="fixed bottom-6 left-1/2 z-50 scrollbar-hide flex w-[calc(100%-2rem)] max-w-fit -translate-x-1/2 items-center gap-1.5 overflow-x-auto rounded-[8px] border-2 border-border bg-popover px-3 py-2 shadow-none">
      {/* Selection count & clear */}
      <div className="mr-1 flex items-center gap-2 border-r border-border pr-2">
        <span className="text-[13px] font-semibold text-foreground tabular-nums">
          {selectedCount} selected
        </span>
        <button
          onClick={onClearSelection}
          className="rounded-[8px] p-0.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
          title="Clear selection"
        >
          <X size={13} />
        </button>
      </div>

      {/* Status */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground">
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
        <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground">
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
        <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground">
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
                  className="size-2.5 rounded-[8px]"
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

      {/* Assignees */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground">
          {commonAssignees.length > 0 ? (
            <AssigneeStack
              assignees={commonAssignees}
              size={16}
              max={3}
              ringColorClass="ring-popover"
            />
          ) : (
            <Users size={13} />
          )}
          <span>
            {commonAssignees.length === 0
              ? "Assignees"
              : commonAssignees.length === 1
                ? commonAssignees[0]!.name
                : `${commonAssignees.length} assignees`}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" className="p-0">
          <AssigneePickerContent
            workspaceId={workspaceId}
            assignees={commonAssignees}
            onChange={onChangeAssignees}
          />
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onChangeAssignees([])}>
            <div className="flex items-center gap-2">
              <XCircle size={12} className="text-muted-foreground" />
              <span>Clear assignees</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Divider */}
      <div className="mx-0.5 h-5 w-px bg-border" />

      {/* Clean Up */}
      <button
        onClick={onCleanUp}
        disabled={isCleaningUp}
        className="flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isCleaningUp ? (
          <SpinnerGap size={13} className="animate-spin" />
        ) : (
          <Sparkle size={13} />
        )}
        <span>{isCleaningUp ? "Cleaning..." : "Clean Up"}</span>
      </button>

      {/* Divider */}
      <div className="mx-0.5 h-5 w-px bg-border" />

      {/* Delete */}
      <button
        onClick={onDelete}
        className="flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10"
      >
        <Trash size={13} />
        <span>Delete</span>
      </button>
    </div>,
    document.body
  )
}

// ── Source Integration Icons ──

function SourceIcons({ task }: { task: Pick<Task, "source" | "sources"> }) {
  const sources = getTaskSources(task)
  if (sources.length === 0) return null

  // Dedupe by platform
  const seen = new Set<string>()
  const platforms = sources.filter((s) => {
    if (seen.has(s.platform)) return false
    seen.add(s.platform)
    return true
  })

  return (
    <div className="flex shrink-0 items-center gap-1">
      {platforms.map((source) => {
        const config = SOURCE_CONFIG[source.platform]
        return (
          <span
            key={source.platform}
            className="flex size-6 items-center justify-center rounded-[8px] ring-1 ring-border"
            style={{ backgroundColor: config.bg }}
            title={config.label}
          >
            <SourceIcon platform={source.platform} size={12} />
          </span>
        )
      })}
    </div>
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
  const isMobile = useIsMobile()
  const activeAgent = getActiveAgent(task)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", task },
    transition: SORTABLE_TRANSITION,
    disabled: !canManageTasks || isMobile,
  })

  // Keep the card's layout slot stable while dragging — only fade.
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : isDraggedAway ? 0.4 : undefined,
    pointerEvents: isDragging || isDraggedAway ? "none" : undefined,
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
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <motion.div
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
          />
        }
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={handleClick}
        className={`group relative cursor-pointer rounded-[8px] bg-card ring-1 ring-border transition-[background-color,box-shadow,opacity] duration-150 select-none hover:bg-accent/20 dark:gradient-border dark:gradient-border-to-tl dark:gradient-border-from-neutral-700 dark:gradient-border-via-neutral-800 dark:gradient-border-to-neutral-600 ${isMobile ? "" : "touch-none"} ${isSelected ? "bg-primary/[0.06] ring-2 ring-primary/40" : ""} ${isDragging || isDraggedAway ? "!ring-0" : ""}`}
      >
        {/* Checkbox overlay */}
        <div
          onClick={handleCheckboxClick}
          className={`absolute top-2 right-2 z-10 flex size-3.5 shrink-0 items-center justify-center rounded border transition-all ${
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background opacity-0 group-hover:opacity-100"
          } ${hasSelection ? "!opacity-100" : ""}`}
        >
          {isSelected && <Check size={8} weight="bold" />}
        </div>

        {/* Card body */}
        <div className="relative p-2.5 pb-0">
          {/* Title */}
          <p className="mb-2 line-clamp-2 pr-5 text-[14px] leading-snug font-medium text-foreground/90">
            {task.title}
          </p>

          {/* Middle: priority + labels + agent (left) | integration icons (right) */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="shrink-0">
                {getPriorityIcon(task.priority, 12)}
              </div>
              <UnreadMentionBadge taskId={task.id} />
              {activeAgent && <AgentBadge agentName={activeAgent} />}
              {(task.labels ?? []).map((label) => (
                <span
                  key={label}
                  className="rounded-[8px] px-1.5 py-0.5 text-[10px] font-medium capitalize"
                  style={{
                    backgroundColor: (labelColors[label] ?? "#888") + "18",
                    color: labelColors[label] ?? "#888",
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
            <SourceIcons task={task} />
          </div>
        </div>

        {/* Footer: date + task code */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-1.5">
          <span className="text-[11px] text-muted-foreground/50">
            {task.createdAt}
          </span>
          <div className="flex items-center gap-2">
            {(task.assignees ?? []).length > 0 ? (
              <AssigneeStack
                assignees={(task.assignees ?? []) as TaskAssignee[]}
                size={16}
                max={3}
              />
            ) : null}
            <span className="font-mono text-[11px] text-muted-foreground/50 tabular-nums">
              {task.taskCode}
            </span>
          </div>
        </div>
      </ContextMenuTrigger>
      <TaskContextMenuContent
        task={task}
        onUpdate={onUpdate}
        onDelete={onDelete}
        canManageTasks={canManageTasks}
      />
    </ContextMenu>
  )
})

// ── Kanban Column (for Board View) ──

function KanbanColumn({
  column,
  columnIndex,
  tasks,
  isDropTarget,
  overItemId,
  overItemAtEnd,
  activeTaskId,
  selectedTaskIds,
  draggedTaskIds,
  canManageTasks,
  onSelectTask,
  onToggleSelectTask,
  onUpdateTask,
  onDeleteTask,
  onAddTask,
}: {
  column: (typeof COLUMNS)[number]
  columnIndex: number
  tasks: Task[]
  isDropTarget?: boolean
  overItemId: string | null
  overItemAtEnd: boolean
  activeTaskId: string | null
  selectedTaskIds: Set<string>
  draggedTaskIds: Set<string>
  canManageTasks: boolean
  onSelectTask: (task: Task) => void
  onToggleSelectTask: (taskId: string, shiftKey: boolean) => void
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
  onAddTask: (status: Status) => void
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
      className={`flex h-full w-[260px] shrink-0 flex-col overflow-hidden rounded-[8px] ring-1 ring-border transition-shadow duration-200 ${isDropTarget ? "bg-primary/[0.03] ring-2 ring-primary" : ""}`}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 bg-card px-3 py-1.5 shadow-[inset_0_-1px_0_var(--border)] dark:bg-card">
        {getColumnIcon(column.id)}
        <span className="text-[14px] font-semibold tracking-tight">
          {column.label}
        </span>
        <motion.span
          key={tasks.length}
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className="flex h-4.5 min-w-4.5 items-center justify-center rounded-[8px] bg-muted px-1.5 text-[11px] font-medium text-muted-foreground"
        >
          {tasks.length}
        </motion.span>
        {canManageTasks && (
          <button
            onClick={() => onAddTask(column.id)}
            className="ml-auto rounded-[8px] p-0.5 text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
            title={`Add task to ${column.label}`}
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Cards */}
      <div
        data-column-scroll
        className="scrollbar-hide flex-1 overflow-y-auto p-2"
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {tasks.map((task, cardIndex) => {
              const isLast = cardIndex === tasks.length - 1
              const isOverMe =
                overItemId === task.id &&
                activeTaskId !== null &&
                activeTaskId !== task.id
              const showIndicatorBefore = isOverMe && !(isLast && overItemAtEnd)
              const showIndicatorAfter = isOverMe && isLast && overItemAtEnd
              return (
                <Fragment key={task.id}>
                  {showIndicatorBefore && (
                    <motion.div
                      initial={{ opacity: 0, scaleX: 0.5 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      style={{ originX: 0 }}
                      className="relative flex items-center"
                    >
                      <div className="absolute -left-0.5 size-2 rounded-full bg-primary" />
                      <div className="h-0.5 w-full rounded-full bg-primary" />
                    </motion.div>
                  )}
                  <KanbanCard
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
                  {showIndicatorAfter && (
                    <motion.div
                      initial={{ opacity: 0, scaleX: 0.5 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      style={{ originX: 0 }}
                      className="relative flex items-center"
                    >
                      <div className="absolute -left-0.5 size-2 rounded-full bg-primary" />
                      <div className="h-0.5 w-full rounded-full bg-primary" />
                    </motion.div>
                  )}
                </Fragment>
              )
            })}
          </div>
        </SortableContext>
      </div>
    </motion.div>
  )
}

// ── Shared drag-and-drop hook for list + board views ──

function useKanbanDragAndDrop({
  tasksByColumn,
  selectedTaskIds,
  canManageTasks,
  onMoveTask,
  onMoveMultipleTasks,
  onClearSelection,
}: {
  tasksByColumn: Record<Status, Task[]>
  selectedTaskIds: Set<string>
  canManageTasks: boolean
  onMoveTask: (taskId: string, toStatus: Status, toIndex: number) => void
  onMoveMultipleTasks: (
    taskIds: string[],
    toStatus: Status,
    toIndex: number
  ) => void
  onClearSelection: () => void
}) {
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [draggedTaskIds, setDraggedTaskIds] = useState<Set<string>>(new Set())
  const [overColumn, setOverColumn] = useState<Status | null>(null)
  const [overItemId, setOverItemId] = useState<string | null>(null)
  const [overItemAtEnd, setOverItemAtEnd] = useState(false)
  // Ref mirrors the state so handleDragEnd reads the latest value without
  // depending on React having flushed the setState from handleDragOver.
  const overItemAtEndRef = useRef(false)

  function findColumnOfTask(taskId: string): Status | null {
    for (const col of COLUMNS) {
      if (tasksByColumn[col.id].some((t) => t.id === taskId)) {
        return col.id
      }
    }
    return null
  }

  function resetDragState() {
    setActiveTask(null)
    setDraggedTaskIds(new Set())
    setOverColumn(null)
    setOverItemId(null)
    setOverItemAtEnd(false)
    overItemAtEndRef.current = false
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
    const { active, over } = event
    if (!over) {
      setOverColumn(null)
      setOverItemId(null)
      setOverItemAtEnd(false)
      overItemAtEndRef.current = false
      return
    }

    const overId = over.id as string
    const targetCol =
      over.data.current?.type === "column"
        ? (over.id as Status)
        : findColumnOfTask(overId)

    if (targetCol === "requests") {
      setOverColumn(null)
      setOverItemId(null)
      setOverItemAtEnd(false)
      overItemAtEndRef.current = false
      return
    }

    setOverColumn((current) => (current === targetCol ? current : targetCol))
    const isColumnTarget = over.data.current?.type === "column"
    setOverItemId(isColumnTarget ? null : overId)

    if (isColumnTarget || !targetCol) {
      setOverItemAtEnd(false)
      overItemAtEndRef.current = false
      return
    }

    const columnTasks = tasksByColumn[targetCol]
    const lastTask = columnTasks[columnTasks.length - 1]
    const isOverLast =
      lastTask?.id === overId && lastTask?.id !== (active.id as string)
    const activeRect = active.rect.current.translated
    const overRect = over.rect
    const isPastMidpoint =
      !!activeRect &&
      activeRect.top + activeRect.height / 2 >
        overRect.top + overRect.height / 2
    const atEnd = isOverLast && isPastMidpoint
    setOverItemAtEnd(atEnd)
    overItemAtEndRef.current = atEnd
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    const currentDraggedIds = draggedTaskIds
    const wasOverItemAtEnd = overItemAtEndRef.current
    resetDragState()

    if (!canManageTasks) return
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

    const endOffset = wasOverItemAtEnd ? 1 : 0
    const isMultiDrag = currentDraggedIds.size > 1

    if (isMultiDrag) {
      const targetIndex =
        over.data.current?.type === "column"
          ? tasksByColumn[targetColumn].length
          : Math.max(
              0,
              tasksByColumn[targetColumn].findIndex((t) => t.id === overId)
            ) + endOffset

      onMoveMultipleTasks(
        Array.from(currentDraggedIds),
        targetColumn,
        targetIndex
      )
      onClearSelection()
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
        onMoveTask(activeId, activeColumn, newIndex + endOffset)
      }
      return
    }

    const overIndex = tasksByColumn[targetColumn].findIndex(
      (t) => t.id === overId
    )
    onMoveTask(
      activeId,
      targetColumn,
      overIndex !== -1 ? overIndex + endOffset : 0
    )
  }

  function handleDragCancel() {
    resetDragState()
  }

  return {
    activeTask,
    draggedTaskIds,
    overColumn,
    overItemId,
    overItemAtEnd,
    findColumnOfTask,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  }
}

// ── Board View (Kanban Columns) ──

function ColumnBoardView({
  tasks,
  hiddenColumns,
  canManageTasks,
  selectedTaskId,
  onSelectTaskId,
  onMoveTask,
  onMoveMultipleTasks,
  onUpdateTask,
  onDeleteTask,
  onBulkUpdateTasks,
  onBulkDeleteTasks,
  onCleanUp,
  isCleaningUp,
  onAddTask,
}: {
  tasks: Task[]
  hiddenColumns: Status[]
  canManageTasks: boolean
  selectedTaskId: string | null
  onSelectTaskId: (taskId: string | null) => void
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
    updates: Partial<Pick<Task, "status" | "priority" | "labels" | "assignees">>
  ) => void
  onBulkDeleteTasks: (taskIds: string[]) => void
  onCleanUp: (taskIds: string[]) => void
  isCleaningUp: boolean
  onAddTask: (status: Status) => void
}) {
  const visibleColumns = COLUMNS.filter((c) => !hiddenColumns.includes(c.id))
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const lastToggledTaskIdRef = useRef<string | null>(null)

  const orderedTaskIds = useMemo(() => {
    const ids: string[] = []
    for (const col of visibleColumns) {
      for (const task of tasks) {
        if (task.status === col.id) ids.push(task.id)
      }
    }
    return ids
  }, [tasks, visibleColumns])

  const handleSelectTask = useCallback(
    (task: Task) => {
      onSelectTaskId(task.id)
    },
    [onSelectTaskId]
  )

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("search-palette:board-ready"))
  }, [])

  useSearchPaletteTaskEvent(
    useCallback(
      (taskId: string) => {
        onSelectTaskId(taskId)
      },
      [onSelectTaskId]
    )
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

  const handleBulkChangeAssignees = useCallback(
    (assignees: TaskAssignee[]) => {
      onBulkUpdateTasks(Array.from(selectedTaskIds), {
        assignees: assignees.map((a) => ({
          userId: a.userId,
          name: a.name,
          imageUrl: a.imageUrl ?? undefined,
        })),
      })
    },
    [selectedTaskIds, onBulkUpdateTasks]
  )

  const handleBulkDelete = useCallback(() => {
    onBulkDeleteTasks(Array.from(selectedTaskIds))
    handleClearSelection()
  }, [selectedTaskIds, onBulkDeleteTasks, handleClearSelection])

  const handleCleanUp = useCallback(() => {
    onCleanUp(Array.from(selectedTaskIds))
  }, [selectedTaskIds, onCleanUp])

  const isMobile = useIsMobile()
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  })
  const sensors = useSensors(...(isMobile ? [] : [pointerSensor]))

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

  const commonBulkAssignees = useMemo(
    () => computeCommonAssignees(tasks, selectedTaskIds),
    [tasks, selectedTaskIds]
  )
  const bulkWorkspaceId = (tasks[0]?.workspaceId ?? undefined) as
    | Id<"workspaces">
    | undefined

  const {
    activeTask,
    draggedTaskIds,
    overColumn,
    overItemId,
    overItemAtEnd,
    handleDragStart,
    handleDragOver,
    handleDragEnd: hookHandleDragEnd,
    handleDragCancel: hookHandleDragCancel,
  } = useKanbanDragAndDrop({
    tasksByColumn,
    selectedTaskIds,
    canManageTasks,
    onMoveTask,
    onMoveMultipleTasks,
    onClearSelection: handleClearSelection,
  })

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
    hookHandleDragEnd(event)
  }

  function handleDragCancel() {
    stopAutoScroll()
    hookHandleDragCancel()
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
          // Prefer pointer-based hits (works for empty columns), fall back
          // to corner-based for sortable stability, then rect-intersection
          // as a last resort during fast moves.
          const pointerIntersections = pointerWithin(args)
          if (pointerIntersections.length > 0) return pointerIntersections
          const corners = closestCorners(args)
          if (corners.length > 0) return corners
          return rectIntersection(args)
        }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          ref={scrollContainerRef}
          className="scrollbar-hide flex h-full gap-2 overflow-x-auto p-2"
        >
          {visibleColumns.map((column, colIdx) => {
            const columnTasks = tasksByColumn[column.id]
            const columnIndex = colIdx
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
                  overItemId={overItemId}
                  overItemAtEnd={overItemAtEnd}
                  activeTaskId={activeTask?.id ?? null}
                  selectedTaskIds={selectedTaskIds}
                  draggedTaskIds={draggedTaskIds}
                  canManageTasks={canManageTasks}
                  onSelectTask={handleSelectTask}
                  onToggleSelectTask={handleToggleSelectTask}
                  onUpdateTask={onUpdateTask}
                  onDeleteTask={onDeleteTask}
                  onAddTask={onAddTask}
                />
              </div>
            )
          })}
        </div>
        <DragOverlay dropAnimation={DROP_ANIMATION}>
          {activeTask ? (
            <DragOverlayCard
              task={activeTask}
              dragCount={draggedTaskIds.size}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {canManageTasks && selectedTaskIds.size > 0 && (
        <BulkActionToolbar
          selectedCount={selectedTaskIds.size}
          workspaceId={bulkWorkspaceId}
          commonAssignees={commonBulkAssignees}
          onChangeStatus={handleBulkChangeStatus}
          onChangePriority={handleBulkChangePriority}
          onChangeLabels={handleBulkChangeLabels}
          onChangeAssignees={handleBulkChangeAssignees}
          onCleanUp={handleCleanUp}
          isCleaningUp={isCleaningUp}
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
    <div className="relative flex items-center gap-0.5 rounded-[9px] bg-muted/60 p-0.5">
      {/* Sliding indicator */}
      <motion.div
        layout
        layoutId="view-toggle-indicator"
        className="absolute inset-y-0.5 w-[calc(50%-2px)] rounded-[8px] bg-background shadow-sm ring-1 ring-border/50"
        style={{ left: view === "list" ? 2 : "calc(50% + 0px)" }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
      />
      <button
        onClick={() => onViewChange("list")}
        className={`relative z-10 flex items-center justify-center rounded-[8px] p-1.5 transition-colors ${
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
        className={`relative z-10 flex items-center justify-center rounded-[8px] p-1.5 transition-colors ${
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
  selectedTaskId,
  onSelectTaskId,
  onToggleCollapsedColumn,
  onMoveTask,
  onMoveMultipleTasks,
  onUpdateTask,
  onDeleteTask,
  onBulkUpdateTasks,
  onBulkDeleteTasks,
  onCleanUp,
  isCleaningUp,
  onAddTask,
}: {
  tasks: Task[]
  hiddenColumns: Status[]
  collapsedColumns: Status[]
  canManageTasks: boolean
  selectedTaskId: string | null
  onSelectTaskId: (taskId: string | null) => void
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
    updates: Partial<Pick<Task, "status" | "priority" | "labels" | "assignees">>
  ) => void
  onBulkDeleteTasks: (taskIds: string[]) => void
  onCleanUp: (taskIds: string[]) => void
  isCleaningUp: boolean
  onAddTask: (status: Status) => void
}) {
  const visibleColumns = COLUMNS.filter((c) => !hiddenColumns.includes(c.id))
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const lastToggledTaskIdRef = useRef<string | null>(null)

  const orderedTaskIds = useMemo(() => {
    const ids: string[] = []
    for (const col of visibleColumns) {
      if (!collapsedColumns.includes(col.id)) {
        for (const task of tasks) {
          if (task.status === col.id) ids.push(task.id)
        }
      }
    }
    return ids
  }, [tasks, visibleColumns, collapsedColumns])

  const handleSelectTask = useCallback(
    (task: Task) => {
      onSelectTaskId(task.id)
    },
    [onSelectTaskId]
  )

  // Signal that the board is mounted and ready to receive task-open events
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("search-palette:board-ready"))
  }, [])

  // Listen for task-open events from search palette
  useSearchPaletteTaskEvent(
    useCallback(
      (taskId: string) => {
        onSelectTaskId(taskId)
      },
      [onSelectTaskId]
    )
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

  const handleBulkChangeAssignees = useCallback(
    (assignees: TaskAssignee[]) => {
      onBulkUpdateTasks(Array.from(selectedTaskIds), {
        assignees: assignees.map((a) => ({
          userId: a.userId,
          name: a.name,
          imageUrl: a.imageUrl ?? undefined,
        })),
      })
    },
    [selectedTaskIds, onBulkUpdateTasks]
  )

  const handleBulkDelete = useCallback(() => {
    onBulkDeleteTasks(Array.from(selectedTaskIds))
    handleClearSelection()
  }, [selectedTaskIds, onBulkDeleteTasks, handleClearSelection])

  const handleCleanUp = useCallback(() => {
    onCleanUp(Array.from(selectedTaskIds))
  }, [selectedTaskIds, onCleanUp])

  const isMobile = useIsMobile()
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  })
  const sensors = useSensors(...(isMobile ? [] : [pointerSensor]))

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

  const commonBulkAssignees = useMemo(
    () => computeCommonAssignees(tasks, selectedTaskIds),
    [tasks, selectedTaskIds]
  )
  const bulkWorkspaceId = (tasks[0]?.workspaceId ?? undefined) as
    | Id<"workspaces">
    | undefined

  const {
    activeTask,
    draggedTaskIds,
    overColumn,
    overItemId,
    overItemAtEnd,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  } = useKanbanDragAndDrop({
    tasksByColumn,
    selectedTaskIds,
    canManageTasks,
    onMoveTask,
    onMoveMultipleTasks,
    onClearSelection: handleClearSelection,
  })

  const activeTaskSource = activeTask ? activeTask.status : null

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={(args) => {
          const pointerIntersections = pointerWithin(args)
          if (pointerIntersections.length > 0) return pointerIntersections
          const corners = closestCorners(args)
          if (corners.length > 0) return corners
          return rectIntersection(args)
        }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="scrollbar-hide h-full overflow-y-auto px-3 py-2">
          {visibleColumns.map((column, groupIndex) => {
            const columnTasks = tasksByColumn[column.id]
            return (
              <ListGroup
                key={column.id}
                column={column}
                tasks={columnTasks}
                groupIndex={groupIndex}
                isDropTarget={
                  overColumn === column.id &&
                  activeTaskSource !== null &&
                  activeTaskSource !== column.id
                }
                overItemId={overItemId}
                overItemAtEnd={overItemAtEnd}
                activeTaskId={activeTask?.id ?? null}
                collapsed={collapsedColumns.includes(column.id)}
                selectedTaskIds={selectedTaskIds}
                draggedTaskIds={draggedTaskIds}
                canManageTasks={canManageTasks}
                onToggleCollapsed={() => onToggleCollapsedColumn(column.id)}
                onSelectTask={handleSelectTask}
                onToggleSelectTask={handleToggleSelectTask}
                onUpdateTask={onUpdateTask}
                onDeleteTask={onDeleteTask}
                onAddTask={onAddTask}
              />
            )
          })}
        </div>
        <DragOverlay dropAnimation={DROP_ANIMATION}>
          {activeTask ? (
            <DragOverlayListRow
              task={activeTask}
              dragCount={draggedTaskIds.size}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Bulk action toolbar */}
      {canManageTasks && selectedTaskIds.size > 0 && (
        <BulkActionToolbar
          selectedCount={selectedTaskIds.size}
          workspaceId={bulkWorkspaceId}
          commonAssignees={commonBulkAssignees}
          onChangeStatus={handleBulkChangeStatus}
          onChangePriority={handleBulkChangePriority}
          onChangeLabels={handleBulkChangeLabels}
          onChangeAssignees={handleBulkChangeAssignees}
          onCleanUp={handleCleanUp}
          isCleaningUp={isCleaningUp}
          onDelete={handleBulkDelete}
          onClearSelection={handleClearSelection}
        />
      )}
    </>
  )
}

// ── Board Filter ──

type BoardFilterState = {
  search: string
  statuses: Status[]
  priorities: Priority[]
  labels: string[]
  sources: RequestSource[]
  assignedToMe: boolean
}

const EMPTY_FILTER_STATE: BoardFilterState = {
  search: "",
  statuses: [],
  priorities: [],
  labels: [],
  sources: [],
  assignedToMe: false,
}

const ALL_SOURCES: RequestSource[] = [
  "discord",
  "slack",
  "github",
  "linear",
  "x",
  "cli",
  "api",
]

function BoardFilter({
  filter,
  onFilterChange,
  availableLabels,
}: {
  filter: BoardFilterState
  onFilterChange: (next: BoardFilterState) => void
  availableLabels: { name: string; color: string }[]
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [position, setPosition] = useState<{
    top: number
    right: number
  } | null>(null)

  const filterCount =
    (filter.search.trim() ? 1 : 0) +
    (filter.assignedToMe ? 1 : 0) +
    filter.statuses.length +
    filter.priorities.length +
    filter.labels.length +
    filter.sources.length
  const isActive = filterCount > 0

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    setPosition({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePosition()
    const onResize = () => updatePosition()
    window.addEventListener("resize", onResize)
    window.addEventListener("scroll", onResize, true)
    return () => {
      window.removeEventListener("resize", onResize)
      window.removeEventListener("scroll", onResize, true)
    }
  }, [open, updatePosition])

  // Click outside / escape to close
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null
      if (!target) return
      if (popoverRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  // Auto-focus search when popover opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [open])

  function toggleStatus(status: Status) {
    onFilterChange({
      ...filter,
      statuses: filter.statuses.includes(status)
        ? filter.statuses.filter((s) => s !== status)
        : [...filter.statuses, status],
    })
  }

  function togglePriority(priority: Priority) {
    onFilterChange({
      ...filter,
      priorities: filter.priorities.includes(priority)
        ? filter.priorities.filter((p) => p !== priority)
        : [...filter.priorities, priority],
    })
  }

  function toggleLabel(label: string) {
    onFilterChange({
      ...filter,
      labels: filter.labels.includes(label)
        ? filter.labels.filter((l) => l !== label)
        : [...filter.labels, label],
    })
  }

  function toggleSource(source: RequestSource) {
    onFilterChange({
      ...filter,
      sources: filter.sources.includes(source)
        ? filter.sources.filter((s) => s !== source)
        : [...filter.sources, source],
    })
  }

  function clearAll() {
    onFilterChange(EMPTY_FILTER_STATE)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Filter tasks"
        aria-expanded={open}
        className={`relative flex items-center gap-1.5 rounded-[9px] px-2 py-1.5 text-[13px] font-medium transition-colors ${
          isActive
            ? "bg-primary/10 text-primary ring-1 ring-primary/30 hover:bg-primary/15 dark:bg-primary/15 dark:text-primary dark:ring-primary/40"
            : "text-muted-foreground ring-1 ring-border hover:bg-accent hover:text-foreground"
        }`}
      >
        <FunnelSimple size={13} weight={isActive ? "bold" : "regular"} />
        <span>Filter</span>
        <AnimatePresence initial={false}>
          {isActive && (
            <motion.span
              key="filter-badge"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="flex min-w-[16px] items-center justify-center rounded-full bg-primary px-1 py-0 text-[11px] leading-4 font-semibold text-primary-foreground"
            >
              {filterCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && position && (
              <motion.div
                ref={popoverRef}
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.12, ease: [0.25, 1, 0.5, 1] }}
                style={{
                  position: "fixed",
                  top: position.top,
                  right: position.right,
                  zIndex: 50,
                }}
                className="w-[280px] origin-top-right overflow-hidden rounded-[10px] bg-popover text-popover-foreground shadow-lg ring-1 ring-border"
              >
                {/* Search input */}
                <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
                  <MagnifyingGlass
                    size={13}
                    className="shrink-0 text-muted-foreground"
                  />
                  <input
                    ref={inputRef}
                    type="text"
                    value={filter.search}
                    onChange={(e) =>
                      onFilterChange({ ...filter, search: e.target.value })
                    }
                    placeholder="Search tasks..."
                    className="w-full bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                  {filter.search && (
                    <button
                      type="button"
                      onClick={() => onFilterChange({ ...filter, search: "" })}
                      className="shrink-0 rounded-[6px] p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Clear search"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>

                <div className="max-h-[60vh] overflow-y-auto">
                  {/* Assignee */}
                  <div className="px-2 pt-2 pb-1">
                    <div className="px-1 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      Assignee
                    </div>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() =>
                          onFilterChange({
                            ...filter,
                            assignedToMe: !filter.assignedToMe,
                          })
                        }
                        className={`flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-[14px] transition-colors hover:bg-accent ${
                          filter.assignedToMe
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        <span
                          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[6px] ring-1 transition-colors ${
                            filter.assignedToMe
                              ? "bg-primary text-primary-foreground ring-primary"
                              : "bg-transparent ring-border"
                          }`}
                        >
                          {filter.assignedToMe && (
                            <Check size={10} weight="bold" />
                          )}
                        </span>
                        <Users size={12} />
                        <span className="truncate">My tasks</span>
                      </button>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="px-2 pt-2 pb-1">
                    <div className="px-1 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      Status
                    </div>
                    <div className="flex flex-col">
                      {FILTER_STATUSES.map((status) => {
                        const checked = filter.statuses.includes(status)
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => toggleStatus(status)}
                            className={`flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-[14px] transition-colors hover:bg-accent ${
                              checked
                                ? "text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            <span
                              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[6px] ring-1 transition-colors ${
                                checked
                                  ? "bg-primary text-primary-foreground ring-primary"
                                  : "bg-transparent ring-border"
                              }`}
                            >
                              {checked && <Check size={10} weight="bold" />}
                            </span>
                            {getStatusIcon(status, 12)}
                            <span className="truncate">
                              {STATUS_LABELS[status]}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Priority */}
                  <div className="px-2 pt-2 pb-1">
                    <div className="px-1 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      Priority
                    </div>
                    <div className="flex flex-col">
                      {ALL_PRIORITIES.map((priority) => {
                        const checked = filter.priorities.includes(priority)
                        return (
                          <button
                            key={priority}
                            type="button"
                            onClick={() => togglePriority(priority)}
                            className={`flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-[14px] transition-colors hover:bg-accent ${
                              checked
                                ? "text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            <span
                              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[6px] ring-1 transition-colors ${
                                checked
                                  ? "bg-primary text-primary-foreground ring-primary"
                                  : "bg-transparent ring-border"
                              }`}
                            >
                              {checked && <Check size={10} weight="bold" />}
                            </span>
                            {getPriorityIcon(priority, 12)}
                            <span className="truncate">
                              {PRIORITY_LABELS[priority]}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Labels */}
                  {availableLabels.length > 0 && (
                    <div className="px-2 pt-2 pb-1">
                      <div className="px-1 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        Labels
                      </div>
                      <div className="flex flex-col">
                        {availableLabels.map((label) => {
                          const checked = filter.labels.includes(label.name)
                          return (
                            <button
                              key={label.name}
                              type="button"
                              onClick={() => toggleLabel(label.name)}
                              className={`flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-[14px] transition-colors hover:bg-accent ${
                                checked
                                  ? "text-foreground"
                                  : "text-muted-foreground"
                              }`}
                            >
                              <span
                                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[6px] ring-1 transition-colors ${
                                  checked
                                    ? "bg-primary text-primary-foreground ring-primary"
                                    : "bg-transparent ring-border"
                                }`}
                              >
                                {checked && <Check size={10} weight="bold" />}
                              </span>
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: label.color }}
                              />
                              <span className="truncate">{label.name}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Sources */}
                  <div className="px-2 pt-2 pb-2">
                    <div className="px-1 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      Source
                    </div>
                    <div className="flex flex-col">
                      {ALL_SOURCES.map((source) => {
                        const checked = filter.sources.includes(source)
                        const config = SOURCE_CONFIG[source]
                        return (
                          <button
                            key={source}
                            type="button"
                            onClick={() => toggleSource(source)}
                            className={`flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-[14px] transition-colors hover:bg-accent ${
                              checked
                                ? "text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            <span
                              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[6px] ring-1 transition-colors ${
                                checked
                                  ? "bg-primary text-primary-foreground ring-primary"
                                  : "bg-transparent ring-border"
                              }`}
                            >
                              {checked && <Check size={10} weight="bold" />}
                            </span>
                            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                              <SourceIcon platform={source} size={12} />
                            </span>
                            <span className="truncate">{config.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Footer: clear all */}
                {isActive && (
                  <div className="flex items-center justify-between border-t border-border px-2.5 py-1.5">
                    <span className="text-[12px] text-muted-foreground">
                      {filterCount} active{" "}
                      {filterCount === 1 ? "filter" : "filters"}
                    </span>
                    <button
                      type="button"
                      onClick={clearAll}
                      className="flex items-center gap-1 rounded-[8px] px-1.5 py-0.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <X size={10} />
                      Clear all
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
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
  const [filter, setFilter] = useState<BoardFilterState>(EMPTY_FILTER_STATE)
  const { user: clerkUser } = useUser()
  const currentUserId = clerkUser?.id ?? null

  const unreadMentionCounts = useQuery(
    api.taskComments.unreadMentionCountsForWorkspace,
    currentWorkspace
      ? { workspaceId: currentWorkspace._id as Id<"workspaces"> }
      : "skip"
  )
  const unreadMentionsMap = useMemo(
    () => unreadMentionCounts ?? {},
    [unreadMentionCounts]
  )

  // Side panel state — lifted here so the panel is a layout sibling of the
  // board content and shifts the main view when open.
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [taskPanelWidth, setTaskPanelWidth] = useState<number>(
    TASK_PANEL_DEFAULT_WIDTH
  )

  // Hydrate the persisted panel width on the client only (avoids SSR mismatch)
  useEffect(() => {
    setTaskPanelWidth(loadTaskPanelWidth())
  }, [])

  // Mark board as mounted after initial render to suppress entry animations on subsequent updates
  useEffect(() => {
    const timer = setTimeout(() => setBoardMounted(true), 800)
    return () => clearTimeout(timer)
  }, [])
  const [hasFetchedTasks, setHasFetchedTasks] = useState(false)
  const cleanedWorkspaceIds = useState(() => new Set<string>())[0]
  const lastLoadedWorkspaceIdRef = useRef<string | null>(null)
  const lastLocalChangeRef = useRef<number>(0)

  const { acceptRequest, denyRequest } = useRequestActions({
    onLocalChange: () => {
      lastLocalChangeRef.current = Date.now()
    },
  })

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
      assignees,
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
      assignees?:
        | { userId: string; name: string; imageUrl?: string }[]
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
          assignees,
        } as any)
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
          assignees,
        } as any)
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

  const tasks = useMemo(
    () =>
      (taskDocs ?? [])
        .filter((doc) => doc.status !== "requests")
        .map(mapTaskDoc),
    [taskDocs]
  )

  const filteredTasks = useMemo(() => {
    const search = filter.search.trim().toLowerCase()
    const hasFilter =
      search.length > 0 ||
      filter.statuses.length > 0 ||
      filter.priorities.length > 0 ||
      filter.labels.length > 0 ||
      filter.sources.length > 0 ||
      filter.assignedToMe
    if (!hasFilter) return tasks
    return tasks.filter((task) => {
      const taskLabels = task.labels ?? []

      if (filter.assignedToMe) {
        if (!currentUserId) return false
        const assignees = task.assignees ?? []
        if (!assignees.some((a) => a.userId === currentUserId)) {
          return false
        }
      }

      if (
        filter.statuses.length > 0 &&
        !filter.statuses.includes(task.status)
      ) {
        return false
      }
      if (
        filter.priorities.length > 0 &&
        !filter.priorities.includes(task.priority)
      ) {
        return false
      }
      if (
        filter.labels.length > 0 &&
        !filter.labels.some((l) => taskLabels.includes(l))
      ) {
        return false
      }
      if (filter.sources.length > 0) {
        const taskSources = getTaskSources(task)
        if (
          !taskSources.some((s) =>
            filter.sources.includes(s.platform as RequestSource)
          )
        ) {
          return false
        }
      }
      if (search.length > 0) {
        const assigneeNames =
          task.assignees?.map((assignee) => assignee.name).join(" ") ?? ""
        const haystack = [
          task.title,
          task.description ?? "",
          task.taskCode,
          task.assignee?.name ?? "",
          assigneeNames,
          taskLabels.join(" "),
        ]
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(search)) return false
      }
      return true
    })
  }, [tasks, filter, currentUserId])

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
        assignees: updates.assignees as TaskDoc["assignees"],
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
      assignees: updates.assignees as
        | { userId: string; name: string; imageUrl?: string }[]
        | undefined,
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
    updates: Partial<Pick<Task, "status" | "priority" | "labels" | "assignees">>
  ) {
    if (!workspaceId || !canManageTasks) return
    lastLocalChangeRef.current = Date.now()

    const validIds = taskIds.filter((id) => !id.startsWith("optimistic:"))
    if (validIds.length === 0) return

    const field = updates.status
      ? "status"
      : updates.priority
        ? "priority"
        : updates.labels
          ? "labels"
          : "assignees"
    const value =
      updates.status ??
      updates.priority ??
      (updates.labels !== undefined
        ? updates.labels.join(",")
        : (updates.assignees ?? []).map((a) => a.userId).join(","))
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
          assignees: updates.assignees,
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

  const [isCleaningUp, setIsCleaningUp] = useState(false)

  async function handleCleanUpTasks(taskIds: string[]) {
    if (!workspaceId || !canManageTasks) return

    const validIds = taskIds.filter((id) => !id.startsWith("optimistic:"))
    if (validIds.length === 0) return

    const allTasks =
      getLocalFirstStoreSnapshot().tasksByWorkspace[workspaceId] ?? []
    const selectedTasks = allTasks.filter((t) => validIds.includes(t._id))
    if (selectedTasks.length === 0) return

    setIsCleaningUp(true)
    const toastId = toast.loading("Cleaning up tasks...")

    try {
      const response = await fetch("/api/tasks/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          tasks: selectedTasks.map((t) => ({
            id: t._id,
            title: t.title,
            description: t.description ?? null,
            status: t.status,
            priority: t.priority,
            labels: t.labels ?? [],
            order: t.order,
          })),
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        if (response.status === 402 && payload?.code === "credits_exhausted") {
          toast.error(payload?.error ?? "Credits exhausted.", { id: toastId })
          return
        }
        throw new Error(payload?.error || "Cleanup failed.")
      }

      const cleanedTasks: Array<{
        id: string
        order: number
        priority: string
        labels: string[]
      }> = payload.tasks

      // Apply optimistic updates
      lastLocalChangeRef.current = Date.now()
      updateWorkspaceTasks(workspaceId, (tasks) =>
        tasks.map((task) => {
          const cleaned = cleanedTasks.find((c) => c.id === task._id)
          if (!cleaned) return task
          return {
            ...task,
            order: cleaned.order,
            priority: cleaned.priority as Task["priority"],
            labels: cleaned.labels,
          }
        })
      )

      // Apply reorder
      const realIds = validIds.filter((id) => !isDevTask(id))
      if (realIds.length > 0) {
        const reorderChanges = cleanedTasks
          .filter((t) => !isDevTask(t.id))
          .map((t) => ({
            taskId: t.id as Id<"tasks">,
            status: selectedTasks.find((st) => st._id === t.id)!.status,
            order: t.order,
          }))

        await reorderTasks({ workspaceId, changes: reorderChanges })

        // Apply priority + label changes
        const updates = cleanedTasks.filter((t) => {
          if (isDevTask(t.id)) return false
          const orig = selectedTasks.find((st) => st._id === t.id)
          return (
            orig &&
            (orig.priority !== t.priority ||
              JSON.stringify(orig.labels ?? []) !== JSON.stringify(t.labels))
          )
        })

        await Promise.all(
          updates.map((t) =>
            updateTask({
              taskId: t.id as Id<"tasks">,
              priority: t.priority as Task["priority"],
              labels: t.labels,
            })
          )
        )
      }

      toast.success(
        `Cleaned up ${selectedTasks.length} task${selectedTasks.length > 1 ? "s" : ""}.`,
        { id: toastId }
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Cleanup failed.",
        { id: toastId }
      )
    } finally {
      setIsCleaningUp(false)
    }
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

  const handleClosePanel = useCallback(() => {
    setSelectedTaskId(null)
  }, [])

  const handlePanelDelete = useCallback(
    (taskId: string) => {
      handleDeleteTask(taskId)
      setSelectedTaskId(null)
    },
    [handleDeleteTask]
  )

  const handlePanelAccept = useCallback(
    (task: Task) => {
      acceptRequest(task)
      setSelectedTaskId(null)
    },
    [acceptRequest]
  )

  const handlePanelDeny = useCallback(
    (task: Task) => {
      denyRequest(task)
      setSelectedTaskId(null)
    },
    [denyRequest]
  )

  if (
    !workspaceId ||
    (taskDocs === undefined &&
      (isAuthLoading || !hasFetchedTasks || isCleaningDemoTasks))
  ) {
    return <BoardLoadingState />
  }

  const selectedTask = selectedTaskId
    ? (filteredTasks.find((task) => task.id === selectedTaskId) ??
      tasks.find((task) => task.id === selectedTaskId) ??
      null)
    : null

  return (
    <BoardMountedContext.Provider value={boardMounted}>
      <LabelConfigContext.Provider value={labelConfig}>
        <UnreadMentionsContext.Provider value={unreadMentionsMap}>
          <div className="flex h-full">
            {/* Main content — shrinks to make room for the side panel */}
            <div className="flex min-w-0 flex-1 flex-col">
              {!canManageTasks ? (
                <div className="mx-4 mt-4 rounded-[8px] gradient-border gradient-border-to-tl gradient-border-from-neutral-700 gradient-border-via-neutral-800 gradient-border-to-neutral-600 bg-card px-3 py-3 text-[14px] text-muted-foreground ring-1 ring-border">
                  You’re in guest mode. Tasks are read-only in this workspace.
                </div>
              ) : null}

              {/* Toolbar */}
              <div className="scrollbar-hide flex items-center gap-1 overflow-x-auto bg-sidebar px-3 py-2 text-toolbar-foreground">
                <ViewToggle view={boardView} onViewChange={handleViewChange} />
                {hiddenColumns.length > 0 && (
                  <HiddenColumnsToolbar
                    hiddenColumns={hiddenColumns}
                    onShow={handleShowColumn}
                    tasks={filteredTasks}
                  />
                )}
                <div className="ml-auto flex items-center gap-1">
                  <BoardFilter
                    filter={filter}
                    onFilterChange={setFilter}
                    availableLabels={
                      currentWorkspace?.labels &&
                      currentWorkspace.labels.length > 0
                        ? currentWorkspace.labels
                        : DEFAULT_WORKSPACE_LABELS
                    }
                  />
                </div>
              </div>

              {/* Content */}
              <div className="min-h-0 flex-1">
                {boardView === "board" ? (
                  <ColumnBoardView
                    tasks={filteredTasks}
                    hiddenColumns={hiddenColumns}
                    canManageTasks={canManageTasks}
                    selectedTaskId={selectedTaskId}
                    onSelectTaskId={setSelectedTaskId}
                    onMoveTask={handleMoveTask}
                    onMoveMultipleTasks={handleMoveMultipleTasks}
                    onUpdateTask={handleUpdateTask}
                    onDeleteTask={handleDeleteTask}
                    onBulkUpdateTasks={handleBulkUpdateTasks}
                    onBulkDeleteTasks={handleBulkDeleteTasks}
                    onCleanUp={handleCleanUpTasks}
                    isCleaningUp={isCleaningUp}
                    onAddTask={handleAddTask}
                  />
                ) : (
                  <ListView
                    tasks={filteredTasks}
                    hiddenColumns={hiddenColumns}
                    collapsedColumns={collapsedColumns}
                    canManageTasks={canManageTasks}
                    selectedTaskId={selectedTaskId}
                    onSelectTaskId={setSelectedTaskId}
                    onToggleCollapsedColumn={handleToggleCollapsedColumn}
                    onMoveTask={handleMoveTask}
                    onMoveMultipleTasks={handleMoveMultipleTasks}
                    onUpdateTask={handleUpdateTask}
                    onDeleteTask={handleDeleteTask}
                    onBulkUpdateTasks={handleBulkUpdateTasks}
                    onBulkDeleteTasks={handleBulkDeleteTasks}
                    onCleanUp={handleCleanUpTasks}
                    isCleaningUp={isCleaningUp}
                    onAddTask={handleAddTask}
                  />
                )}
              </div>
            </div>

            {/* Side panel — slides in from the right and shifts the layout */}
            <TaskDetailSidePanel
              task={selectedTask}
              width={taskPanelWidth}
              onWidthChange={setTaskPanelWidth}
              onClose={handleClosePanel}
              onUpdate={handleUpdateTask}
              onDelete={handlePanelDelete}
              onAccept={handlePanelAccept}
              onDeny={handlePanelDeny}
              canManageTasks={canManageTasks}
            />

            {/* New task modal */}
            <NewTaskModal
              open={modalOpen}
              onOpenChange={setModalOpen}
              defaultStatus={modalDefaultStatus}
            />
          </div>
        </UnreadMentionsContext.Provider>
      </LabelConfigContext.Provider>
    </BoardMountedContext.Provider>
  )
}
