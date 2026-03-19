"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  Loading03Icon,
  CircleIcon,
  CheckmarkBadge01Icon,
  Archive01Icon,
  MoreHorizontalIcon,
  Attachment01Icon,
  Tag01Icon,
  SignalFull02Icon,
  SignalMedium02Icon,
  SignalLow02Icon,
  AlertCircleIcon,
  Tick02Icon,
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

type Priority = "urgent" | "high" | "medium" | "low" | "none"
type Status = "requests" | "todo" | "in_progress" | "done" | "archive"
type Label = "feature" | "bug" | "improvement" | "design" | "devops"

const STATUS_OPTIONS: { id: Status; label: string }[] = [
  { id: "requests", label: "Requests" },
  { id: "todo", label: "Todo" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done" },
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
  { id: "improvement", label: "Improvement", color: "#22c55e" },
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
    case "done":
      return <HugeiconsIcon icon={CheckmarkBadge01Icon} size={14} className="text-emerald-500" />
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

export function NewTaskModal({ open, onOpenChange, defaultStatus = "requests" }: NewTaskModalProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<Status>(defaultStatus)
  const [priority, setPriority] = useState<Priority>("none")
  const [labels, setLabels] = useState<Label[]>([])
  const [createMore, setCreateMore] = useState(false)

  function handleCreate() {
    if (!title.trim()) return
    // TODO: wire to Convex mutation
    if (createMore) {
      setTitle("")
      setDescription("")
      setPriority("none")
      setLabels([])
    } else {
      onOpenChange(false)
    }
    resetForm()
  }

  function resetForm() {
    if (!createMore) {
      setTitle("")
      setDescription("")
      setStatus(defaultStatus)
      setPriority("none")
      setLabels([])
    }
  }

  function toggleLabel(label: Label) {
    setLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    )
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
            placeholder="Task title"
            autoFocus
            className="w-full bg-transparent text-lg font-medium outline-none placeholder:text-muted-foreground/50"
          />
          <textarea
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

            {/* Labels */}
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent">
                <HugeiconsIcon icon={Tag01Icon} size={14} className="text-muted-foreground" />
                {labels.length > 0
                  ? labels.map((l) => LABEL_OPTIONS.find((o) => o.id === l)?.label).join(", ")
                  : "Labels"}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={6}>
                {LABEL_OPTIONS.map((opt) => (
                  <DropdownMenuCheckboxItem
                    key={opt.id}
                    checked={labels.includes(opt.id)}
                    onClick={(e) => {
                      e.preventDefault()
                      toggleLabel(opt.id)
                    }}
                  >
                    <div
                      className="size-2.5 rounded-full"
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
            <button className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <HugeiconsIcon icon={Attachment01Icon} size={16} />
            </button>
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
                disabled={!title.trim()}
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
