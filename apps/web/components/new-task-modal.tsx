"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation } from "convex/react"
import { useUser } from "@clerk/nextjs"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  Loading03Icon,
  CircleIcon,
  CheckmarkBadge01Icon,
  Archive01Icon,
  MoreHorizontalIcon,
  Tag01Icon,
  SignalFull02Icon,
  SignalMedium02Icon,
  SignalLow02Icon,
  AlertCircleIcon,
  Tick02Icon,
  Rocket01Icon,
} from "@hugeicons/core-free-icons"
import { motion } from "motion/react"
import {
  Dialog,
  DialogContent,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
} from "@workspace/ui/components/dropdown-menu"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"
import type { Id } from "@/convex/_generated/dataModel"
import { getTaskNumber, type TaskLabel as Label, type TaskPriority as Priority, type TaskStatus as Status } from "@/lib/task-board"

const STATUS_OPTIONS: { id: Status; label: string }[] = [
  { id: "todo", label: "Todo" },
  { id: "in_progress", label: "In Progress" },
  { id: "ready", label: "Ready" },
  { id: "shipped", label: "Shipped" },
  { id: "archive", label: "Archive" },
]

const PRIORITY_OPTIONS: { id: Priority; label: string }[] = [
  { id: "urgent", label: "Urgent" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
  { id: "none", label: "None" },
]

const LABEL_OPTIONS: { id: Label; label: string; color: string }[] = [
  { id: "feature", label: "Feature", color: "#a855f7" },
  { id: "bug", label: "Bug", color: "#ef4444" },
  { id: "improvement", label: "Improvement", color: "#06b6d4" },
  { id: "design", label: "Design", color: "#3b82f6" },
  { id: "devops", label: "DevOps", color: "#f59e0b" },
]

function getStatusIcon(status: Status) {
  switch (status) {
    case "requests":
      return <HugeiconsIcon icon={Loading03Icon} size={14} className="text-muted-foreground" />
    case "todo":
      return <HugeiconsIcon icon={CircleIcon} size={14} className="text-muted-foreground" />
    case "in_progress":
      return <HugeiconsIcon icon={Loading03Icon} size={14} className="text-yellow-500" />
    case "ready":
      return <HugeiconsIcon icon={CheckmarkBadge01Icon} size={14} className="text-emerald-500" />
    case "shipped":
      return <HugeiconsIcon icon={Rocket01Icon} size={14} className="text-blue-500" />
    case "archive":
      return <HugeiconsIcon icon={Archive01Icon} size={14} className="text-muted-foreground" />
  }
}

function getPriorityIcon(priority: Priority) {
  switch (priority) {
    case "urgent":
      return <HugeiconsIcon icon={AlertCircleIcon} size={14} className="text-red-500" />
    case "high":
      return <HugeiconsIcon icon={SignalFull02Icon} size={14} className="text-orange-500" />
    case "medium":
      return <HugeiconsIcon icon={SignalMedium02Icon} size={14} className="text-yellow-500" />
    case "low":
      return <HugeiconsIcon icon={SignalLow02Icon} size={14} className="text-blue-400" />
    case "none":
      return <HugeiconsIcon icon={MoreHorizontalIcon} size={14} className="text-muted-foreground" />
  }
}

interface NewTaskModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultStatus?: Status
}

export function NewTaskModal({ open, onOpenChange, defaultStatus = "todo" }: NewTaskModalProps) {
  const { user } = useUser()
  const { currentWorkspace } = useWorkspace()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<Status>(defaultStatus)
  const [priority, setPriority] = useState<Priority>("none")
  const [labels, setLabels] = useState<Label[]>([])
  const [createMore, setCreateMore] = useState(false)
  const [error, setError] = useState("")

  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const createTask = useMutation(api.tasks.createTask).withOptimisticUpdate((localStore, args) => {
    const existing = (localStore.getQuery(api.tasks.listByWorkspace, {
      workspaceId: args.workspaceId,
    }) ?? []) as Array<any>

    const nextTaskNumber =
      Math.max(0, ...existing.map((task) => task.taskNumber ?? getTaskNumber(task.taskCode ?? ""))) + 1
    const order = existing.filter((task) => task.status === args.status).length
    const now = Date.now()

    localStore.setQuery(api.tasks.listByWorkspace, { workspaceId: args.workspaceId }, [
      ...existing,
      {
        _id: `optimistic:${nextTaskNumber}`,
        _creationTime: now,
        workspaceId: args.workspaceId,
        taskCode: `MED-${nextTaskNumber}`,
        taskNumber: nextTaskNumber,
        title: args.title.trim(),
        description: args.description?.trim() || undefined,
        status: args.status,
        priority: args.priority,
        labels: args.labels,
        order,
        project: currentWorkspace?.name ?? "Median",
        assignee: {
          name: user?.fullName ?? user?.firstName ?? "You",
          avatar: user?.imageUrl ?? "",
        },
      },
    ])
  })

  useEffect(() => {
    if (open) {
      setStatus(defaultStatus)
    }
  }, [defaultStatus, open])

  async function handleCreate() {
    if (!title.trim() || !currentWorkspace) return

    setError("")

    const payload = {
      workspaceId: currentWorkspace._id,
      title,
      description,
      status,
      priority,
      labels,
    }

    if (createMore) {
      resetForm({ keepOpen: true, nextStatus: status })
    } else {
      onOpenChange(false)
      resetForm()
    }

    try {
      await createTask(payload)
    } catch {
      setError("Task creation failed. Try again.")
    }
  }

  function resetForm(options?: { keepOpen?: boolean; nextStatus?: Status }) {
    setTitle("")
    setDescription("")
    setStatus(options?.nextStatus ?? defaultStatus)
    setPriority("none")
    setLabels([])
    if (!options?.keepOpen) {
      setError("")
    }
  }

  function toggleLabel(label: Label) {
    setLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    )
  }

  function handleTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      descriptionRef.current?.focus()
    }
  }

  const statusLabel = STATUS_OPTIONS.find((s) => s.id === status)?.label ?? "Status"
  const priorityLabel = PRIORITY_OPTIONS.find((p) => p.id === priority)?.label ?? "Priority"

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        onOpenChange(val)
        if (!val) resetForm()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-w-2xl flex-col gap-0 p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium">New task</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onOpenChange(false)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col px-5 pt-4 pb-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            placeholder="Task title"
            autoFocus
            className="w-full bg-transparent text-lg font-medium outline-none placeholder:text-muted-foreground/50"
          />
          <textarea
            ref={descriptionRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description..."
            rows={4}
            className="mt-2 w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
          {/* Toolbar pills */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status */}
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent">
                {getStatusIcon(status)}
                {statusLabel}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={6}>
                {STATUS_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.id}
                    onClick={() => setStatus(opt.id)}
                    className={status === opt.id ? "text-foreground" : "text-muted-foreground"}
                  >
                    {getStatusIcon(opt.id)}
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Priority */}
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent">
                {getPriorityIcon(priority)}
                {priorityLabel}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={6}>
                {PRIORITY_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.id}
                    onClick={() => setPriority(opt.id)}
                    className={priority === opt.id ? "text-foreground" : "text-muted-foreground"}
                  >
                    {getPriorityIcon(opt.id)}
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Labels (multi-select) */}
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent">
                <HugeiconsIcon icon={Tag01Icon} size={14} className="text-muted-foreground" />
                {labels.length > 0
                  ? labels.map((l) => LABEL_OPTIONS.find((o) => o.id === l)?.label).join(", ")
                  : "Labels"}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={6} className="w-auto min-w-[180px]">
                {LABEL_OPTIONS.map((opt) => (
                  <DropdownMenuCheckboxItem
                    key={opt.id}
                    checked={labels.includes(opt.id)}
                    onCheckedChange={() => toggleLabel(opt.id)}
                  >
                    <span
                      className="inline-block size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: opt.color }}
                    />
                    {opt.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Actions row */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">{error || "Ships straight into your workspace board."}</div>
            <div className="flex items-center gap-3">
              {/* Create more toggle */}
              <button
                onClick={() => setCreateMore(!createMore)}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <div
                  className={`relative h-5 w-8 rounded-full transition-colors ${
                    createMore ? "bg-[#0496FF]" : "bg-accent"
                  }`}
                >
                  <motion.div
                    animate={{ x: createMore ? 18 : 2 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-1 size-3 rounded-full bg-white shadow-sm"
                  />
                </div>
                Create more
              </button>

              {/* Create button */}
              <button
                onClick={handleCreate}
                disabled={!title.trim() || !currentWorkspace}
                className="flex items-center rounded-lg bg-[#0496FF] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0496FF]/90 disabled:opacity-50"
              >
                Create task
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
