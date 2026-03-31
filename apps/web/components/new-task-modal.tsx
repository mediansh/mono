"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { useMutation } from "convex/react"
import { useUser } from "@clerk/nextjs"
import { toast } from "sonner"
import {
  X,
  SpinnerGap,
  Circle,
  SealCheck,
  Archive,
  DotsThree,
  Tag,
  CellSignalFull,
  CellSignalMedium,
  CellSignalLow,
  WarningCircle,
  Rocket,
  Paperclip,
  PencilSimple,
  Sparkle,
  ArrowRight,
} from "@phosphor-icons/react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
} from "@workspace/ui/components/dropdown-menu"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"
import {
  trackTaskCreated,
  trackTasksGeneratedAI,
  trackNewTaskModalOpened,
  trackAIPromptTabSelected,
} from "@/lib/analytics"
import type { Doc } from "@/convex/_generated/dataModel"
import { hasTaskWritePermission } from "@/lib/workspace-permissions"
import {
  getTaskNumber,
  DEFAULT_WORKSPACE_LABELS,
  type TaskLabel as Label,
  type TaskPriority as Priority,
  type TaskStatus as Status,
} from "@/lib/task-board"
import {
  getLocalFirstStoreSnapshot,
  setWorkspaceTasks,
  updateWorkspaceTasks,
  type LocalTaskDoc,
} from "@/lib/local-first-store"

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

// labelOptions is now built dynamically from workspace config

function getStatusIcon(status: Status) {
  switch (status) {
    case "requests":
      return <SpinnerGap size={14} className="text-muted-foreground" />
    case "todo":
      return <Circle size={14} className="text-muted-foreground" />
    case "in_progress":
      return <SpinnerGap size={14} className="text-yellow-500" />
    case "ready":
      return <SealCheck size={14} weight="fill" className="text-emerald-500" />
    case "shipped":
      return <Rocket size={14} weight="fill" className="text-blue-500" />
    case "archive":
      return <Archive size={14} className="text-muted-foreground" />
  }
}

function getPriorityIcon(priority: Priority) {
  switch (priority) {
    case "urgent":
      return <WarningCircle size={14} weight="fill" className="text-red-500" />
    case "high":
      return <CellSignalFull size={14} className="text-orange-500" />
    case "medium":
      return <CellSignalMedium size={14} className="text-yellow-500" />
    case "low":
      return <CellSignalLow size={14} className="text-blue-400" />
    case "none":
      return <DotsThree size={14} className="text-muted-foreground" />
  }
}

interface NewTaskModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultStatus?: Status
}

type TaskDraftPayload = {
  title: string
  description?: string
  status: Status
  priority: Priority
  labels: Label[]
  attachments?: {
    storageId: string
    name: string
    type: string
    size: number
  }[]
}

type GeneratedTaskPayload = {
  title: string
  description?: string
  status?: Status
  priority?: Priority
  labels?: Label[]
}

export function NewTaskModal({
  open,
  onOpenChange,
  defaultStatus = "todo",
}: NewTaskModalProps) {
  const { user } = useUser()
  const { currentWorkspace } = useWorkspace()
  const canManageTasks = hasTaskWritePermission(currentWorkspace?.role)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<Status>(defaultStatus)
  const [priority, setPriority] = useState<Priority>("none")
  const [labels, setLabels] = useState<Label[]>([])
  const [createMore, setCreateMore] = useState(false)
  const [error, setError] = useState("")
  const [attachments, setAttachments] = useState<
    { storageId: string; name: string; type: string; size: number }[]
  >([])
  const [uploading, setUploading] = useState(false)
  const [activeTab, setActiveTab] = useState<"manual" | "ai">("manual")
  const [aiPrompt, setAiPrompt] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)

  const labelOptions = useMemo(() => {
    const wsLabels = currentWorkspace?.labels
    const labels =
      wsLabels && wsLabels.length > 0 ? wsLabels : DEFAULT_WORKSPACE_LABELS
    return labels.map((l) => ({
      id: l.name as Label,
      label: l.name.charAt(0).toUpperCase() + l.name.slice(1),
      color: l.color,
    }))
  }, [currentWorkspace?.labels])

  const titleRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const createTask = useMutation(api.tasks.createTask)
  const createTasks = useMutation(api.tasks.createTasks)

  const generateUploadUrl = useMutation(api.workspaces.generateUploadUrl)

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!canManageTasks) {
        toast.error("Guests can only view tasks.")
        return
      }

      const files = e.target.files
      if (!files || files.length === 0) return

      setUploading(true)
      setError("")

      try {
        const newAttachments: typeof attachments = []

        for (const file of Array.from(files)) {
          if (file.size > 10 * 1024 * 1024) {
            setError(`File "${file.name}" exceeds 10MB limit.`)
            continue
          }

          const uploadUrl = await generateUploadUrl()
          const result = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          })

          if (!result.ok) {
            setError(`Failed to upload "${file.name}".`)
            continue
          }

          const { storageId } = await result.json()
          newAttachments.push({
            storageId,
            name: file.name,
            type: file.type,
            size: file.size,
          })
        }

        setAttachments((prev) => [...prev, ...newAttachments])
      } catch {
        setError("Upload failed. Try again.")
      } finally {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
      }
    },
    [canManageTasks, generateUploadUrl]
  )

  useEffect(() => {
    if (open) {
      setStatus(defaultStatus)
    }
  }, [defaultStatus, open])

  const createSingleTask = useCallback(
    async (payload: TaskDraftPayload) => {
      if (!currentWorkspace) {
        throw new Error("Workspace not found")
      }

      const existingTasks =
        getLocalFirstStoreSnapshot().tasksByWorkspace[currentWorkspace._id] ??
        []
      const nextTaskNumber =
        Math.max(
          0,
          ...existingTasks.map(
            (task) => task.taskNumber ?? getTaskNumber(task.taskCode ?? "")
          )
        ) + 1
      const optimisticId = `optimistic:${nextTaskNumber}`
      const optimisticTask: LocalTaskDoc = {
        _id: optimisticId,
        _creationTime: Date.now(),
        workspaceId: currentWorkspace._id,
        taskCode: `${currentWorkspace.prefix || "MED"}-${nextTaskNumber}`,
        taskNumber: nextTaskNumber,
        title: payload.title.trim(),
        description: payload.description?.trim() || undefined,
        status: payload.status,
        priority: payload.priority,
        labels: payload.labels,
        order: existingTasks.filter((task) => task.status === payload.status)
          .length,
        project: currentWorkspace.name,
        assignee: {
          name: user?.fullName ?? user?.firstName ?? "You",
          avatar: user?.imageUrl ?? "",
        },
        attachments: payload.attachments?.length
          ? (payload.attachments as any)
          : undefined,
        _syncStatus: "pending",
      }

      setWorkspaceTasks(currentWorkspace._id, [
        ...existingTasks,
        optimisticTask,
      ])

      try {
        const createdTask = (await createTask({
          workspaceId: currentWorkspace._id,
          title: payload.title.trim(),
          description: payload.description?.trim() || undefined,
          status: payload.status,
          priority: payload.priority,
          labels: payload.labels,
          attachments: payload.attachments?.length
            ? (payload.attachments as any)
            : undefined,
        })) as Doc<"tasks">

        updateWorkspaceTasks(currentWorkspace._id, (tasks) =>
          tasks.map((task) => (task._id === optimisticId ? createdTask : task))
        )

        return createdTask
      } catch {
        updateWorkspaceTasks(currentWorkspace._id, (tasks) =>
          tasks.filter((task) => task._id !== optimisticId)
        )
        throw new Error("Task creation failed. Try again.")
      }
    },
    [
      createTask,
      currentWorkspace,
      user?.firstName,
      user?.fullName,
      user?.imageUrl,
    ]
  )

  function handleCreate() {
    if (!title.trim() || !currentWorkspace) return
    if (!canManageTasks) {
      setError("Guests can only view tasks.")
      return
    }

    setError("")

    const payload = { title, description, status, priority, labels, attachments }

    // Close immediately — optimistic insert happens inside createSingleTask
    if (createMore) {
      resetForm({ keepOpen: true, nextStatus: status })
      requestAnimationFrame(() => titleRef.current?.focus())
    } else {
      onOpenChange(false)
      resetForm()
    }

    trackTaskCreated({
      status: payload.status,
      priority: payload.priority,
      labelCount: payload.labels.length,
      hasDescription: !!payload.description.trim(),
      hasAttachments: payload.attachments.length > 0,
      source: "manual",
    })

    // Fire and forget — optimistic state is already set
    createSingleTask(payload).catch(() => {
      toast.error("Task creation failed. Try again.")
    })
  }

  async function handleGenerateTasks() {
    if (!aiPrompt.trim() || !currentWorkspace || isGenerating) return
    if (!canManageTasks) {
      setError("Guests can only view tasks.")
      return
    }

    setError("")
    setIsGenerating(true)
    const genStart = Date.now()
    const toastId = toast.loading("Generating tasks...")
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 15000)

    try {
      const response = await fetch("/api/tasks/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          workspaceName: currentWorkspace.name,
          availableLabels: labelOptions.map((label) => label.id),
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload?.error || "Task generation failed.")
      }

      const generatedTasks = (
        payload.tasks as GeneratedTaskPayload[] | undefined
      )?.filter((task) => task.title?.trim())

      if (!generatedTasks || generatedTasks.length === 0) {
        throw new Error("No tasks were generated.")
      }

      toast.loading(
        generatedTasks.length === 1
          ? "Creating 1 generated task..."
          : `Creating ${generatedTasks.length} generated tasks...`,
        { id: toastId }
      )

      const createdTasks = (await createTasks({
        workspaceId: currentWorkspace._id,
        tasks: generatedTasks.map((task) => ({
          title: task.title,
          description: task.description,
          status: task.status ?? defaultStatus,
          priority: task.priority ?? "none",
          labels: (task.labels ?? []).filter((label) =>
            labelOptions.some((option) => option.id === label)
          ),
        })),
      })) as Doc<"tasks">[]

      updateWorkspaceTasks(currentWorkspace._id, (tasks) => [
        ...tasks,
        ...createdTasks,
      ])

      trackTasksGeneratedAI({
        promptLength: aiPrompt.trim().length,
        taskCount: generatedTasks.length,
        durationMs: Date.now() - genStart,
      })

      toast.success(
        generatedTasks.length === 1
          ? `Created "${generatedTasks[0]?.title.trim()}".`
          : `Created ${generatedTasks.length} tasks from your prompt.`,
        { id: toastId }
      )

      onOpenChange(false)
      resetForm()
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "Task generation timed out. Try a shorter prompt."
          : err instanceof Error
            ? err.message
            : "Task generation failed."
      setError(message)
      toast.error(message, { id: toastId })
    } finally {
      window.clearTimeout(timeoutId)
      setIsGenerating(false)
    }
  }

  function resetForm(options?: { keepOpen?: boolean; nextStatus?: Status }) {
    setTitle("")
    setDescription("")
    setStatus(options?.nextStatus ?? defaultStatus)
    setPriority("none")
    setLabels([])
    setAttachments([])
    setAiPrompt("")
    setActiveTab("manual")
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
    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      descriptionRef.current?.focus()
    }
  }

  const panelRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onOpenChange(false)
        resetForm()
      }
    }
    const id = setTimeout(() => {
      document.addEventListener("mousedown", handleClick)
    }, 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener("mousedown", handleClick)
    }
  }, [open, onOpenChange])

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Escape to close
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onOpenChange(false)
        resetForm()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, onOpenChange])

  const statusLabel =
    STATUS_OPTIONS.find((s) => s.id === status)?.label ?? "Status"
  const priorityLabel =
    PRIORITY_OPTIONS.find((p) => p.id === priority)?.label ?? "Priority"

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="fixed inset-0 z-50 bg-black/40"
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.12, ease: [0.32, 0, 0.67, 0] }}
            className="fixed top-[min(20%,180px)] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-[4px] bg-background shadow-2xl ring-1 ring-border"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                if (activeTab === "manual") {
                  handleCreate()
                } else {
                  handleGenerateTasks()
                }
              }
            }}
          >
        {/* Header with tabs */}
        <div className="flex items-center justify-between border-b border-border px-3">
          <div className="flex items-center gap-0">
            <button
              onClick={() => setActiveTab("manual")}
              className={`relative flex items-center gap-1.5 px-2.5 py-2 text-[12px] font-medium transition-colors ${
                activeTab === "manual"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <PencilSimple size={13} />
              Manual
              {activeTab === "manual" && (
                <div className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground" />
              )}
            </button>
            <button
              onClick={() => {
                setActiveTab("ai")
                trackAIPromptTabSelected()
              }}
              className={`relative flex items-center gap-1.5 px-2.5 py-2 text-[12px] font-medium transition-colors ${
                activeTab === "ai"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkle size={13} />
              AI Prompt
              {activeTab === "ai" && (
                <div className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground" />
              )}
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onOpenChange(false)}
              className="flex size-6 items-center justify-center rounded-[4px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        <div className="flex min-h-[240px] flex-col">
          {activeTab === "manual" ? (
            <>
              {/* Body */}
              <div className="flex flex-1 flex-col px-3 pt-3 pb-1.5">
                <input
                  ref={titleRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  placeholder="Task title"
                  autoFocus
                  className="w-full bg-transparent text-[14px] font-medium outline-none placeholder:text-muted-foreground/50"
                />
                <textarea
                  ref={descriptionRef}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add description..."
                  rows={3}
                  className="mt-1.5 w-full resize-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/50"
                />
              </div>

              {/* Footer */}
              <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
                {/* Toolbar pills */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Status */}
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-[11px] font-medium ring-1 ring-border transition-colors hover:bg-accent">
                      {getStatusIcon(status)}
                      {statusLabel}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={6}>
                      {STATUS_OPTIONS.map((opt) => (
                        <DropdownMenuItem
                          key={opt.id}
                          onClick={() => setStatus(opt.id)}
                          className={
                            status === opt.id
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }
                        >
                          {getStatusIcon(opt.id)}
                          {opt.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Priority */}
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-[11px] font-medium ring-1 ring-border transition-colors hover:bg-accent">
                      {getPriorityIcon(priority)}
                      {priorityLabel}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={6}>
                      {PRIORITY_OPTIONS.map((opt) => (
                        <DropdownMenuItem
                          key={opt.id}
                          onClick={() => setPriority(opt.id)}
                          className={
                            priority === opt.id
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }
                        >
                          {getPriorityIcon(opt.id)}
                          {opt.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Labels (multi-select) */}
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-[11px] font-medium ring-1 ring-border transition-colors hover:bg-accent">
                      <Tag
                        size={14}
                        className="text-muted-foreground"
                      />
                      {labels.length > 0
                        ? labels
                            .map(
                              (l) => labelOptions.find((o) => o.id === l)?.label
                            )
                            .join(", ")
                        : "Labels"}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      sideOffset={6}
                      className="w-auto min-w-[180px]"
                    >
                      {labelOptions.map((opt) => (
                        <DropdownMenuCheckboxItem
                          key={opt.id}
                          checked={labels.includes(opt.id)}
                          onCheckedChange={() => toggleLabel(opt.id)}
                        >
                          <span
                            className="inline-block size-2.5 shrink-0 rounded-[4px]"
                            style={{ backgroundColor: opt.color }}
                          />
                          {opt.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Attachments */}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((file, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 rounded-[4px] border border-border bg-accent/50 px-2.5 py-1 text-xs"
                      >
                        <Paperclip
                          size={12}
                          className="text-muted-foreground"
                        />
                        <span className="max-w-[150px] truncate">
                          {file.name}
                        </span>
                        <button
                          onClick={() =>
                            setAttachments((prev) =>
                              prev.filter((_, idx) => idx !== i)
                            )
                          }
                          className="ml-0.5 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-[11px] font-medium ring-1 ring-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                    >
                      {uploading ? (
                        <SpinnerGap size={14} className="animate-spin" />
                      ) : (
                        <Paperclip size={14} />
                      )}
                      {uploading ? "Uploading..." : "Attach"}
                    </button>
                    {error && (
                      <span className="text-xs text-red-500">{error}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Create more toggle */}
                    <button
                      onClick={() => setCreateMore(!createMore)}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <div
                        className={`relative h-5 w-8 rounded-[4px] transition-colors ${
                          createMore ? "bg-primary" : "bg-accent"
                        }`}
                      >
                        <div
                          className="absolute top-1 size-3 rounded-[4px] bg-white transition-transform duration-150"
                          style={{ transform: createMore ? "translateX(18px)" : "translateX(2px)" }}
                        />
                      </div>
                      Create more
                    </button>

                    {/* Create button */}
                    <button
                      onClick={handleCreate}
                      disabled={!title.trim() || !currentWorkspace}
                      className="flex items-center gap-2 rounded-[4px] bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      Create task
                      <kbd className="hidden rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] font-normal text-primary-foreground/70 sm:inline-block">
                        {typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl"}↵
                      </kbd>
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* AI Prompt Tab */
            <div className="flex flex-1 flex-col">
              <div className="flex flex-1 flex-col px-3 pt-3 pb-3">
                <p className="mb-2 text-[12px] text-muted-foreground">
                  Describe the tasks you need and AI will generate them.
                </p>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g. Create tasks for building a user authentication flow..."
                  autoFocus
                  rows={4}
                  className="w-full flex-1 resize-none rounded-[4px] bg-accent/30 p-2.5 text-[13px] ring-1 ring-border transition-colors outline-none placeholder:text-muted-foreground/50 focus:ring-foreground/30"
                />
              </div>
              <div className="flex items-center justify-end border-t border-border px-3 py-2">
                <button
                  onClick={handleGenerateTasks}
                  disabled={!aiPrompt.trim() || isGenerating}
                  className="flex items-center gap-2 rounded-[4px] bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isGenerating ? "Generating..." : "Generate tasks"}
                  {isGenerating ? (
                    <SpinnerGap size={16} className="animate-spin" />
                  ) : (
                    <>
                      <kbd className="hidden rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] font-normal text-primary-foreground/70 sm:inline-block">
                        {typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl"}↵
                      </kbd>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
