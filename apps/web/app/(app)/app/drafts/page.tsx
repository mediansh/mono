"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { useUser } from "@clerk/nextjs"
import { motion, AnimatePresence } from "motion/react"
import { toast } from "sonner"
import {
  NotePencil,
  Trash,
  Rocket,
  Circle,
  SpinnerGap,
  SealCheck,
  Archive,
  WarningCircle,
  CellSignalFull,
  CellSignalMedium,
  CellSignalLow,
  DotsThree,
  ListBullets,
} from "@phosphor-icons/react"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"
import { hasTaskWritePermission } from "@/lib/workspace-permissions"
import { NewTaskModal } from "@/components/new-task-modal"
import type { Doc } from "@/convex/_generated/dataModel"
import {
  getLocalFirstStoreSnapshot,
  setWorkspaceTasks,
  updateWorkspaceTasks,
  type LocalTaskDoc,
} from "@/lib/local-first-store"
import { getTaskNumber, normalizeTaskOrdersByStatus } from "@/lib/task-board"

type Draft = Doc<"drafts">

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const },
  },
}

function getStatusIcon(status: string) {
  switch (status) {
    case "backlog":
      return <ListBullets size={14} className="text-muted-foreground" />
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
    default:
      return <Circle size={14} className="text-muted-foreground" />
  }
}

function getPriorityIcon(priority: string) {
  switch (priority) {
    case "urgent":
      return <WarningCircle size={14} weight="fill" className="text-red-500" />
    case "high":
      return <CellSignalFull size={14} className="text-orange-500" />
    case "medium":
      return <CellSignalMedium size={14} className="text-yellow-500" />
    case "low":
      return <CellSignalLow size={14} className="text-blue-400" />
    default:
      return <DotsThree size={14} className="text-muted-foreground" />
  }
}

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  ready: "Ready",
  shipped: "Shipped",
  archive: "Archive",
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export default function DraftsPage() {
  const { user } = useUser()
  const { currentWorkspace } = useWorkspace()
  const canManageTasks = hasTaskWritePermission(currentWorkspace?.role)
  const drafts = useQuery(
    api.drafts.listDrafts,
    currentWorkspace ? { workspaceId: currentWorkspace._id } : "skip"
  )
  const deleteDraft = useMutation(api.drafts.deleteDraft)
  const publishDraft = useMutation(api.drafts.publishDraft)

  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const editingDraft = useMemo(
    () => drafts?.find((draft) => draft._id === editingDraftId) ?? null,
    [drafts, editingDraftId]
  )

  async function handlePublish(draft: Draft) {
    if (!currentWorkspace) {
      toast.error("Workspace not found")
      return
    }

    setPublishingId(draft._id)
    const existingTasks =
      getLocalFirstStoreSnapshot().tasksByWorkspace[currentWorkspace._id] ?? []
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
      title: draft.title.trim(),
      description: draft.description?.trim() || undefined,
      status: draft.status,
      priority: draft.priority,
      labels: draft.labels,
      order: existingTasks.filter((task) => task.status === draft.status)
        .length,
      project: currentWorkspace.name,
      assignee: {
        name: user?.fullName ?? user?.firstName ?? "You",
        avatar: user?.imageUrl ?? "",
      },
      attachments: draft.attachments?.length
        ? (draft.attachments as any)
        : undefined,
      _syncStatus: "pending",
    }

    setWorkspaceTasks(
      currentWorkspace._id,
      normalizeTaskOrdersByStatus([...existingTasks, optimisticTask])
    )

    try {
      const createdTask = (await publishDraft({
        draftId: draft._id,
      })) as Doc<"tasks">
      updateWorkspaceTasks(currentWorkspace._id, (tasks) =>
        tasks.map((task) => (task._id === optimisticId ? createdTask : task))
      )
      toast.success(`Published "${draft.title}" as a task`)
    } catch {
      updateWorkspaceTasks(currentWorkspace._id, (tasks) =>
        tasks.filter((task) => task._id !== optimisticId)
      )
      toast.error("Failed to publish draft")
    } finally {
      setPublishingId(null)
    }
  }

  async function handleDelete(draft: Draft) {
    try {
      await deleteDraft({ draftId: draft._id })
      toast.success("Draft deleted")
    } catch {
      toast.error("Failed to delete draft")
    }
  }

  return (
    <>
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.06 } } }}
        className="mx-auto h-full max-w-3xl overflow-y-auto px-4 py-8 sm:px-6"
      >
        <motion.div variants={fadeUp} className="mb-6">
          <div className="flex items-center gap-3">
            <NotePencil size={20} weight="fill" className="text-foreground" />
            <h1 className="text-lg font-semibold tracking-tight">Drafts</h1>
            {drafts && drafts.length > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-[4px] bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
                {drafts.length}
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Capture ideas and refine them before publishing as tasks.
          </p>
        </motion.div>

        {drafts === undefined ? (
          <motion.div
            variants={fadeUp}
            className="flex items-center justify-center py-20"
          >
            <SpinnerGap
              size={20}
              className="animate-spin text-muted-foreground"
            />
          </motion.div>
        ) : drafts.length === 0 ? (
          <motion.div
            variants={fadeUp}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <NotePencil size={40} className="mb-3 text-muted-foreground/30" />
            <p className="text-[13px] text-muted-foreground">No drafts yet</p>
            <p className="mt-1 text-[12px] text-muted-foreground/60">
              Save a task as a draft to revisit it later.
            </p>
          </motion.div>
        ) : (
          <motion.div variants={fadeUp} className="flex flex-col gap-2">
            <AnimatePresence mode="popLayout">
              {drafts.map((draft) => (
                <motion.div
                  key={draft._id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setEditingDraftId(draft._id)}
                  className="group flex cursor-pointer items-start gap-3 rounded-[4px] px-3 py-2.5 ring-1 ring-border transition-colors hover:bg-accent/40"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium">
                        {draft.title || "Untitled draft"}
                      </span>
                    </div>
                    {draft.description && (
                      <p className="line-clamp-1 text-[12px] text-muted-foreground/70">
                        {draft.description}
                      </p>
                    )}
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                        {getStatusIcon(draft.status)}
                        {STATUS_LABELS[draft.status]}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                        {getPriorityIcon(draft.priority)}
                      </span>
                      {draft.labels.length > 0 && (
                        <span className="text-[11px] text-muted-foreground/60">
                          {draft.labels.length} label
                          {draft.labels.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {draft.attachments && draft.attachments.length > 0 && (
                        <span className="text-[11px] text-muted-foreground/60">
                          {draft.attachments.length} file
                          {draft.attachments.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground/40">
                        {formatRelativeTime(draft.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handlePublish(draft)
                      }}
                      disabled={publishingId === draft._id || !canManageTasks}
                      className="flex items-center gap-1 rounded-[4px] px-2 py-1 text-[11px] font-medium text-primary ring-1 ring-primary/30 transition-colors hover:bg-primary/10 disabled:opacity-50"
                    >
                      {publishingId === draft._id ? (
                        <SpinnerGap size={12} className="animate-spin" />
                      ) : (
                        <Rocket size={12} />
                      )}
                      Publish
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(draft)
                      }}
                      disabled={!canManageTasks}
                      className="rounded-[4px] p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </motion.div>

      {editingDraft && (
        <NewTaskModal
          open={!!editingDraft}
          onOpenChange={(open) => {
            if (!open) setEditingDraftId(null)
          }}
          draft={{
            _id: editingDraft._id,
            title: editingDraft.title,
            description: editingDraft.description,
            status: editingDraft.status,
            priority: editingDraft.priority,
            labels: editingDraft.labels,
            attachments: editingDraft.attachments as any,
            updatedAt: editingDraft.updatedAt,
          }}
          onDraftSaved={() => setEditingDraftId(null)}
        />
      )}
    </>
  )
}
