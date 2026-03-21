"use client"

import { memo, useMemo, useState } from "react"
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
  DndContext,
  DragOverlay,
  PointerSensor,
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

// Types
type Priority = "urgent" | "high" | "medium" | "low" | "none"
type Status = "requests" | "todo" | "in_progress" | "ready" | "shipped" | "archive"
type Label = "feature" | "bug" | "improvement" | "design" | "devops"

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
  // ── Requests ──
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
    id: "MED-226",
    title: "Have the ability to view the generated file tree in real time as it builds",
    status: "requests",
    priority: "low",
    labels: ["feature"],
    project: "Median V1",
    createdAt: "Mar 11",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-230",
    title: "Multi-language support for generated components",
    status: "requests",
    priority: "low",
    labels: ["feature"],
    project: "Median V1",
    createdAt: "Mar 12",
    assignee: { name: "Abdul", avatar: "" },
  },
  // ── Todo ──
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
    id: "MED-219",
    title: "Add Style Selection for UI Generation",
    status: "todo",
    priority: "medium",
    labels: ["feature"],
    project: "Median V1",
    createdAt: "Mar 10",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-221",
    title: "Plan Feature",
    status: "todo",
    priority: "medium",
    labels: ["feature"],
    project: "Median V1",
    createdAt: "Mar 10",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-240",
    title: "Add keyboard shortcuts for common actions",
    status: "todo",
    priority: "low",
    labels: ["improvement"],
    project: "Median V1",
    createdAt: "Mar 12",
    assignee: { name: "Abdul", avatar: "" },
  },
  // ── In Progress ──
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
    id: "MED-30",
    title: "Preview refreshes after theme change",
    status: "in_progress",
    priority: "high",
    labels: ["bug"],
    project: "Median V1",
    createdAt: "Feb 1",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-270",
    title: "CI/CD pipeline for staging environment",
    status: "in_progress",
    priority: "high",
    labels: ["devops"],
    project: "Median V1",
    createdAt: "Mar 15",
    assignee: { name: "Abdul", avatar: "" },
  },
  // ── Ready ──
  {
    id: "MED-54",
    title: "WAITLIST SECURITY",
    status: "ready",
    priority: "urgent",
    labels: ["bug"],
    project: "Median V1",
    createdAt: "Feb 13",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-217",
    title: "Issue: Sidebar Dragging (Videos Attached)",
    status: "ready",
    priority: "medium",
    labels: ["bug"],
    project: "Median V1",
    createdAt: "Mar 10",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-249",
    title: "Specific prompts sometimes generate full pages",
    status: "ready",
    priority: "medium",
    labels: ["bug"],
    project: "Median V1",
    createdAt: "Mar 13",
    assignee: { name: "Abdul", avatar: "" },
  },
  // ── Shipped ──
  {
    id: "MED-40",
    title: "Landing page redesign",
    status: "shipped",
    priority: "high",
    labels: ["design"],
    project: "Median V1",
    createdAt: "Jan 28",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-35",
    title: "User authentication flow",
    status: "shipped",
    priority: "urgent",
    labels: ["feature"],
    project: "Median V1",
    createdAt: "Jan 25",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-52",
    title: "Create Waitlist",
    status: "shipped",
    priority: "medium",
    labels: [],
    project: "Median V1",
    createdAt: "Feb 12",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-222",
    title: "Further improve mic voice-to-text (Web Speech API)",
    status: "shipped",
    priority: "medium",
    labels: ["improvement"],
    project: "Median V1",
    createdAt: "Mar 10",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-29",
    title: "Theme changes save to globals.css",
    status: "shipped",
    priority: "high",
    labels: [],
    project: "Median V1",
    createdAt: "Feb 1",
    assignee: { name: "Abdul", avatar: "" },
  },
  // ── Archive ──
  {
    id: "MED-64",
    title: "Waitlist Spam Issue",
    status: "archive",
    priority: "low",
    labels: [],
    project: "Median V1",
    createdAt: "Feb 14",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    id: "MED-18",
    title: "Initial project scaffolding",
    status: "archive",
    priority: "medium",
    labels: ["devops"],
    project: "Median V1",
    createdAt: "Jan 15",
    assignee: { name: "Abdul", avatar: "" },
  },
]

// Column config
const COLUMNS: { id: Status; label: string }[] = [
  { id: "requests", label: "Requests" },
  { id: "todo", label: "Todo" },
  { id: "in_progress", label: "In Progress" },
  { id: "ready", label: "Ready" },
  { id: "shipped", label: "Shipped" },
  { id: "archive", label: "Archive" },
]

// Label colors
const LABEL_COLORS: Record<Label, string> = {
  feature: "#a855f7",
  bug: "#ef4444",
  improvement: "#06b6d4",
  design: "#3b82f6",
  devops: "#f59e0b",
}

const STATUS_LABELS: Record<Status, string> = {
  requests: "Requests",
  todo: "Todo",
  in_progress: "In Progress",
  ready: "Ready",
  shipped: "Shipped",
  archive: "Archive",
}

const SORTABLE_TRANSITION = {
  duration: 180,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
}

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
                    className="flex items-center gap-3 border-b border-border px-2 py-2.5 transition-colors hover:bg-accent/50 last:border-b-0"
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

// ── List View Components ──

const ListRowContent = memo(function ListRowContent({ task }: { task: Task }) {
  return (
    <>
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
    </>
  )
})

const SortableListRow = memo(function SortableListRow({ task }: { task: Task }) {
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
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? "none" : transition,
    opacity: isDragging ? 0.35 : 1,
    willChange: transform ? "transform" : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group flex touch-none items-center gap-3 border-b border-border bg-background px-4 py-2.5 select-none transition-colors hover:bg-accent/50 active:cursor-grabbing"
    >
      <ListRowContent task={task} />
    </div>
  )
})

function DragOverlayListRow({ task }: { task: Task }) {
  return (
    <div className="flex scale-[1.01] items-center gap-3 rounded-md border border-border bg-background px-4 py-2.5 shadow-2xl ring-1 ring-foreground/8">
      <ListRowContent task={task} />
    </div>
  )
}

function ListGroup({
  column,
  tasks,
  groupIndex,
  isDropTarget,
}: {
  column: (typeof COLUMNS)[number]
  tasks: Task[]
  groupIndex: number
  isDropTarget?: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: groupIndex * 0.05, ease: "easeOut" }}
      style={isDropTarget ? { outline: "2px solid var(--primary)", outlineOffset: "-2px", borderRadius: "6px" } : undefined}
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
            <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
              {tasks.map((task) => (
                <SortableListRow key={task.id} task={task} />
              ))}
            </SortableContext>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function ListView({
  tasks,
  hiddenColumns,
  onMoveTask,
}: {
  tasks: Task[]
  hiddenColumns: Status[]
  onMoveTask: (taskId: string, toStatus: Status, toIndex: number) => void
}) {
  const visibleColumns = COLUMNS.filter((c) => !hiddenColumns.includes(c.id))
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [overColumn, setOverColumn] = useState<Status | null>(null)

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
    const targetCol = findColumnOfTask(overId)
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
    let targetColumn = findColumnOfTask(overId)

    if (!activeColumn || !targetColumn) return

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
        {visibleColumns.map((column, groupIndex) => {
          const columnTasks = tasksByColumn[column.id]
          if (columnTasks.length === 0) return null
          return (
            <ListGroup
              key={column.id}
              column={column}
              tasks={columnTasks}
              groupIndex={groupIndex}
              isDropTarget={overColumn === column.id && activeTaskSource !== null && activeTaskSource !== column.id}
            />
          )
        })}
      </div>
      <DragOverlay
        dropAnimation={{
          duration: 220,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
        }}
      >
        {activeTask ? <DragOverlayListRow task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  )
}

// ── Main Component ──

export function KanbanBoard() {
  const [tasks, setTasks] = useState<Task[]>(MOCK_TASKS)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDefaultStatus, setModalDefaultStatus] = useState<Status>("requests")
  const [hiddenColumns, setHiddenColumns] = useState<Status[]>([])

  function handleAddTask(status: Status) {
    setModalDefaultStatus(status)
    setModalOpen(true)
  }

  function handleShowColumn(status: Status) {
    setHiddenColumns((prev) => prev.filter((s) => s !== status))
  }

  function handleMoveTask(taskId: string, toStatus: Status, toIndex: number) {
    setTasks((prev) => {
      const taskIndex = prev.findIndex((t) => t.id === taskId)
      if (taskIndex === -1) return prev

      const task = prev[taskIndex]!

      // Build the new task with updated status
      const updatedTask = { ...task, status: toStatus }

      // Remove from old position
      const without = prev.filter((t) => t.id !== taskId)

      // Find tasks in the target column to determine insertion point
      const columnTasks = without.filter((t) => t.status === toStatus)
      const clampedIndex = Math.min(toIndex, columnTasks.length)

      // Find the global index to insert at
      let globalInsertIndex: number
      if (clampedIndex >= columnTasks.length) {
        // Insert after the last task in target column
        const lastInColumn = columnTasks[columnTasks.length - 1]
        if (lastInColumn) {
          globalInsertIndex = without.indexOf(lastInColumn) + 1
        } else {
          // Empty column - find where tasks of this column would go based on column order
          const colOrder = COLUMNS.map((c) => c.id)
          const targetColIdx = colOrder.indexOf(toStatus)
          // Find the first task that belongs to a column after the target
          const afterIdx = without.findIndex((t) => {
            const tColIdx = colOrder.indexOf(t.status)
            return tColIdx > targetColIdx
          })
          globalInsertIndex = afterIdx === -1 ? without.length : afterIdx
        }
      } else {
        // Insert at the position of the task currently at toIndex in the column
        const taskAtIndex = columnTasks[clampedIndex]
        globalInsertIndex = taskAtIndex ? without.indexOf(taskAtIndex) : without.length
      }

      const result = [...without]
      result.splice(globalInsertIndex, 0, updatedTask)
      return result
    })
  }

  return (
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
        />
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
