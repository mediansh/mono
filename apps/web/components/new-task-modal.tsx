"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { useMutation } from "convex/react"
import { useUser } from "@clerk/nextjs"
import { toast } from "sonner"
import {
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
  PaperPlaneRight,
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
import {
  cacheAttachmentPreview,
  getDefaultAttachmentDisplayWidth,
  TaskAttachmentGallery,
  type TaskAttachment,
} from "@/components/task-attachments"

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
  attachments?: (TaskAttachment & { previewUrl?: string })[]
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
    (TaskAttachment & { previewUrl?: string })[]
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

  const titleRef = useRef<HTMLTextAreaElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlsRef = useRef<string[]>([])
  const preservedPreviewUrlsRef = useRef(new Set<string>())
  const createTask = useMutation(api.tasks.createTask)
  const createTasks = useMutation(api.tasks.createTasks)

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

          const imageMetadata = await readImageMetadata(file)
          const previewUrl = file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : undefined

          const uploadUrl = await generateUploadUrl()
          const result = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          })

          if (!result.ok) {
            if (previewUrl) {
              URL.revokeObjectURL(previewUrl)
            }
            setError(`Failed to upload "${file.name}".`)
            continue
          }

          const { storageId } = await result.json()
          newAttachments.push({
            storageId,
            name: file.name,
            type: file.type,
            size: file.size,
            width: imageMetadata?.width,
            height: imageMetadata?.height,
            displayWidth: imageMetadata?.displayWidth,
            url: previewUrl,
            previewUrl,
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
    [canManageTasks, generateUploadUrl, readImageMetadata]
  )

  useEffect(() => {
    if (open) {
      setStatus(defaultStatus)
    }
  }, [defaultStatus, open])

  // Auto-resize title textarea to fit content
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [title])

  // Auto-resize description textarea to fit content
  useEffect(() => {
    const el = descriptionRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [description])

  useEffect(() => {
    const currentPreviewUrls = attachments
      .map((attachment) => attachment.previewUrl)
      .filter((previewUrl): previewUrl is string => Boolean(previewUrl))

    for (const previousUrl of previewUrlsRef.current) {
      if (
        !currentPreviewUrls.includes(previousUrl) &&
        !preservedPreviewUrlsRef.current.has(previousUrl)
      ) {
        URL.revokeObjectURL(previousUrl)
      }
    }

    previewUrlsRef.current = currentPreviewUrls
  }, [attachments])

  useEffect(() => {
    return () => {
      for (const previewUrl of previewUrlsRef.current) {
        if (!preservedPreviewUrlsRef.current.has(previewUrl)) {
          URL.revokeObjectURL(previewUrl)
        }
      }
    }
  }, [])

  const sanitizeAttachmentsForMutation = useCallback(
    (taskAttachments?: (TaskAttachment & { previewUrl?: string })[]) =>
      taskAttachments?.map(({ url, previewUrl, ...attachment }) => attachment),
    []
  )

  const preserveAttachmentPreviews = useCallback(
    (taskAttachments?: (TaskAttachment & { previewUrl?: string })[]) => {
      taskAttachments?.forEach((attachment) => {
        if (!attachment.previewUrl) {
          return
        }

        cacheAttachmentPreview(
          String(attachment.storageId),
          attachment.previewUrl
        )
        preservedPreviewUrlsRef.current.add(attachment.previewUrl)
      })
    },
    []
  )

  const createTaskWithFallback = useCallback(
    async (payload: TaskDraftPayload) => {
      const attachmentsWithMetadata = sanitizeAttachmentsForMutation(
        payload.attachments
      )
      const baseArgs = {
        workspaceId: currentWorkspace!._id,
        title: payload.title.trim(),
        description: payload.description?.trim() || undefined,
        status: payload.status,
        priority: payload.priority,
        labels: payload.labels,
      }

      if (!attachmentsWithMetadata?.length) {
        return await createTask(baseArgs)
      }

      try {
        return await createTask({
          ...baseArgs,
          attachments: attachmentsWithMetadata as any,
        })
      } catch (error) {
        const shouldRetryWithoutAttachmentMetadata =
          error instanceof Error &&
          error.message.includes("attachments") &&
          error.message.includes("validator")

        if (!shouldRetryWithoutAttachmentMetadata) {
          throw error
        }

        const legacyAttachments = attachmentsWithMetadata.map(
          ({ width, height, displayWidth, ...attachment }) => attachment
        )

        return await createTask({
          ...baseArgs,
          attachments: legacyAttachments as any,
        })
      }
    },
    [createTask, currentWorkspace, sanitizeAttachmentsForMutation]
  )

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
        const createdTask = (await createTaskWithFallback(
          payload
        )) as Doc<"tasks">

        const hydratedTask = {
          ...createdTask,
          attachments: payload.attachments?.length
            ? payload.attachments.map(({ previewUrl, ...attachment }) => ({
                ...attachment,
                url: attachment.url ?? previewUrl ?? null,
              }))
            : createdTask.attachments,
        } as LocalTaskDoc

        updateWorkspaceTasks(currentWorkspace._id, (tasks) =>
          tasks.map((task) => (task._id === optimisticId ? hydratedTask : task))
        )

        return hydratedTask
      } catch {
        updateWorkspaceTasks(currentWorkspace._id, (tasks) =>
          tasks.filter((task) => task._id !== optimisticId)
        )
        throw new Error("Task creation failed. Try again.")
      }
    },
    [
      createTaskWithFallback,
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

    const payload = {
      title,
      description,
      status,
      priority,
      labels,
      attachments,
    }

    preserveAttachmentPreviews(payload.attachments)

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

    // Snapshot inputs before closing so reset doesn't wipe them mid-request
    const workspace = currentWorkspace
    const prompt = aiPrompt.trim()

    setError("")
    setIsGenerating(true)

    // Close immediately — the toast below shows ongoing generation progress
    onOpenChange(false)
    resetForm()

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
          prompt,
          workspaceId: workspace._id,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        if (response.status === 402 && payload?.code === "ai_budget_exhausted") {
          toast.error(
            payload?.error ??
              "AI budget exhausted. Overages are disabled for this workspace.",
            {
              id: toastId,
              action: {
                label: "Manage billing",
                onClick: () => {
                  window.location.assign("/app/billing")
                },
              },
            }
          )
          return
        }
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

      const generationCost =
        typeof payload.cost === "number" ? payload.cost : undefined

      const createdTasks = (await createTasks({
        workspaceId: workspace._id,
        tasks: generatedTasks.map((task) => ({
          title: task.title,
          description: task.description,
          status: task.status ?? defaultStatus,
          priority: task.priority ?? "none",
          labels: (task.labels ?? []).filter((label) =>
            labelOptions.some((option) => option.id === label)
          ),
        })),
        cost: generationCost,
      })) as Doc<"tasks">[]

      updateWorkspaceTasks(workspace._id, (tasks) => [
        ...tasks,
        ...createdTasks,
      ])

      trackTasksGeneratedAI({
        promptLength: prompt.length,
        taskCount: generatedTasks.length,
        durationMs: Date.now() - genStart,
      })

      toast.success(
        generatedTasks.length === 1
          ? `Created "${generatedTasks[0]?.title.trim()}".`
          : `Created ${generatedTasks.length} tasks from your prompt.`,
        { id: toastId }
      )
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "Task generation timed out. Try a shorter prompt."
          : err instanceof Error
            ? err.message
            : "Task generation failed."
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
    if (!options?.keepOpen) {
      setError("")
    }
  }

  function toggleLabel(label: Label) {
    setLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    )
  }

  function handleTitleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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
      const target = e.target as Element
      if (panelRef.current && !panelRef.current.contains(target)) {
        // Ignore clicks inside Base UI portals (dropdowns, popovers, etc.)
        if (target.closest("[data-base-ui-portal]")) return
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
            transition={{ duration: 0.08 }}
            className="fixed inset-0 z-50 bg-black/40"
          />

          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            {/* Panel */}
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, scale: 0.97, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              transition={{ duration: 0.1, ease: [0.32, 0, 0.67, 0] }}
              className="relative flex max-h-[85vh] w-[min(92vw,40rem)] max-w-2xl flex-col overflow-hidden rounded-[8px] bg-background shadow-2xl ring-1 ring-border"
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
              {/* ── Header: segmented tab + Send + Title ── */}
              <div className="px-5 pt-5 pb-0">
                {/* Tab switcher and send button row */}
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-0.5 rounded-[6px] p-0.5 ring-1 ring-border">
                    <button
                      type="button"
                      onClick={() => setActiveTab("manual")}
                      className={`flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-[11px] font-medium transition-colors ${
                        activeTab === "manual"
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <PencilSimple size={12} />
                      Manual
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("ai")
                        trackAIPromptTabSelected()
                      }}
                      className={`flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-[11px] font-medium transition-colors ${
                        activeTab === "ai"
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Sparkle size={12} />
                      AI Prompt
                    </button>
                  </div>

                  {/* Send button — creates the task (manual) or generates tasks (AI) */}
                  <button
                    type="button"
                    onClick={
                      activeTab === "manual"
                        ? handleCreate
                        : handleGenerateTasks
                    }
                    disabled={
                      activeTab === "manual"
                        ? !title.trim() || !currentWorkspace
                        : !aiPrompt.trim() || isGenerating
                    }
                    aria-label={
                      activeTab === "manual"
                        ? "Create task"
                        : "Generate tasks"
                    }
                    className="flex items-center justify-center rounded-[4px] bg-primary p-1.5 text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {activeTab === "ai" && isGenerating ? (
                      <SpinnerGap size={14} className="animate-spin" />
                    ) : (
                      <PaperPlaneRight size={14} weight="fill" />
                    )}
                  </button>
                </div>

                {activeTab === "manual" ? (
                  <textarea
                    ref={titleRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    placeholder="Task title"
                    autoFocus
                    rows={1}
                    className="block w-full resize-none overflow-hidden bg-transparent text-[16px] leading-snug font-semibold tracking-tight break-words outline-none placeholder:text-muted-foreground/40"
                  />
                ) : null}
              </div>

              {/* ── Body ── */}
              {activeTab === "manual" ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-4 pb-4">
                  <textarea
                    ref={descriptionRef}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add a description..."
                    className="w-full flex-1 resize-none bg-transparent text-[13px] leading-relaxed text-foreground/80 outline-none placeholder:text-muted-foreground/40"
                    style={{ minHeight: "180px" }}
                  />

                  {attachments.length > 0 ? (
                    <div className="mt-4 border-t border-border pt-4">
                      <TaskAttachmentGallery
                        attachments={attachments}
                        workspaceId={currentWorkspace?._id}
                        canManageAttachments
                        onAttachmentsChange={(nextAttachments) =>
                          setAttachments(
                            nextAttachments as (TaskAttachment & {
                              previewUrl?: string
                            })[]
                          )
                        }
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-4 pb-4">
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g. Create tasks for building a user authentication flow…"
                    autoFocus
                    className="w-full flex-1 resize-none bg-transparent text-[13px] leading-relaxed text-foreground/80 outline-none placeholder:text-muted-foreground/40"
                    style={{ minHeight: "180px" }}
                  />
                </div>
              )}

              {/* ── Bottom toolbar ── */}
              {activeTab === "manual" ? (
                <div>
                  {error ? (
                    <div className="px-5 pt-2">
                      <span className="text-[11px] text-red-500">{error}</span>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 pt-2.5 pb-3">
                    {/* Status */}
                    <DropdownMenu>
                      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-border transition-colors hover:bg-accent">
                        {getStatusIcon(status)}
                        <span>{statusLabel}</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="top" align="start">
                        {STATUS_OPTIONS.map((opt) => (
                          <DropdownMenuItem
                            key={opt.id}
                            onClick={() => setStatus(opt.id)}
                            className={status === opt.id ? "font-medium" : ""}
                          >
                            <div className="flex items-center gap-2">
                              {getStatusIcon(opt.id)}
                              <span>{opt.label}</span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Priority */}
                    <DropdownMenu>
                      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-border transition-colors hover:bg-accent">
                        {getPriorityIcon(priority)}
                        <span>{priorityLabel}</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="top" align="start">
                        {PRIORITY_OPTIONS.map((opt) => (
                          <DropdownMenuItem
                            key={opt.id}
                            onClick={() => setPriority(opt.id)}
                            className={priority === opt.id ? "font-medium" : ""}
                          >
                            <div className="flex items-center gap-2">
                              {getPriorityIcon(opt.id)}
                              <span>{opt.label}</span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Labels */}
                    <DropdownMenu>
                      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-border transition-colors hover:bg-accent">
                        {labels.length > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <div className="flex -space-x-0.5">
                              {labels.map((label) => (
                                <div
                                  key={label}
                                  className="size-2 rounded-full ring-1 ring-background"
                                  style={{
                                    backgroundColor:
                                      labelOptions.find((o) => o.id === label)
                                        ?.color ?? "#888",
                                  }}
                                />
                              ))}
                            </div>
                            <span>
                              {labels.length === 1
                                ? (labelOptions.find((o) => o.id === labels[0])
                                    ?.label ?? labels[0])
                                : `${labels.length} labels`}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Tag size={12} className="text-muted-foreground" />
                            <span className="text-muted-foreground">
                              Labels
                            </span>
                          </div>
                        )}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        side="top"
                        align="start"
                        className="w-auto min-w-[180px]"
                      >
                        {labelOptions.map((opt) => (
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

                    {/* Attach */}
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
                      title="Attach files"
                      className="flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {uploading ? (
                        <SpinnerGap size={14} className="animate-spin" />
                      ) : (
                        <Paperclip size={14} />
                      )}
                      {uploading ? "Uploading..." : "Attach"}
                    </button>

                    {/* Create more */}
                    <button
                      type="button"
                      onClick={() => setCreateMore(!createMore)}
                      title="Keep the modal open after creating"
                      className={`flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-border transition-colors hover:bg-accent ${
                        createMore ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      <span
                        className={`inline-block size-2.5 rounded-full ring-1 transition-colors ${
                          createMore
                            ? "bg-primary ring-primary"
                            : "ring-border"
                        }`}
                      />
                      Create more
                    </button>
                  </div>
                </div>
              ) : error ? (
                <div className="border-t border-border px-5 pt-2 pb-3">
                  <span className="text-[11px] text-red-500">{error}</span>
                </div>
              ) : null}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
