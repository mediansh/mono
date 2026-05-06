"use client"

import { useCallback } from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useWorkspace } from "@/components/workspace-provider"
import { hasTaskWritePermission } from "@/lib/workspace-permissions"
import {
  getLocalFirstStoreSnapshot,
  updateWorkspaceTasks,
  type LocalTaskDoc as TaskDoc,
} from "@/lib/local-first-store"
import { isDevTask, moveTaskDocs, sortTaskDocs } from "@/lib/task-docs"
import { trackRequestAccepted, trackRequestDenied } from "@/lib/analytics"

type RequestTaskInput = {
  id: string
  title: string
}

export function useRequestActions(options?: {
  onLocalChange?: () => void
}) {
  const { currentWorkspace } = useWorkspace()
  const reorderTasks = useMutation(api.tasks.reorderTasks)
  const deleteTask = useMutation(api.tasks.deleteTask)

  const workspaceId = currentWorkspace?._id
  const canManageTasks = hasTaskWritePermission(currentWorkspace?.role)

  const acceptRequest = useCallback(
    (task: RequestTaskInput) => {
      if (!workspaceId || !canManageTasks) return
      options?.onLocalChange?.()
      let snapshotBefore: TaskDoc[] | undefined
      updateWorkspaceTasks(workspaceId, (current) => {
        snapshotBefore = current
        return moveTaskDocs(current, task.id, "todo", 0)
      })
      toast.success(`Accepted "${task.title}" → Todo`)
      trackRequestAccepted({ taskId: task.id })
      if (isDevTask(task.id)) return
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
        if (snapshotBefore) {
          updateWorkspaceTasks(workspaceId, () => snapshotBefore!)
        }
        toast.error("Failed to accept request. Try again.")
      })
    },
    [workspaceId, canManageTasks, options, reorderTasks]
  )

  const denyRequest = useCallback(
    (task: RequestTaskInput) => {
      if (!workspaceId || !canManageTasks || task.id.startsWith("optimistic:"))
        return
      options?.onLocalChange?.()
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
    },
    [workspaceId, canManageTasks, options, deleteTask]
  )

  const acceptMany = useCallback(
    (tasks: RequestTaskInput[]) => {
      if (!workspaceId || !canManageTasks || tasks.length === 0) return
      options?.onLocalChange?.()
      let snapshotBefore: TaskDoc[] | undefined
      updateWorkspaceTasks(workspaceId, (current) => {
        snapshotBefore = current
        let next = current
        for (const task of tasks) {
          next = moveTaskDocs(next, task.id, "todo", 0)
        }
        return next
      })
      toast.success(`Accepted ${tasks.length} request${tasks.length === 1 ? "" : "s"} → Todo`)
      for (const task of tasks) {
        trackRequestAccepted({ taskId: task.id })
      }
      if (tasks.every((task) => isDevTask(task.id))) return
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
        if (snapshotBefore) {
          updateWorkspaceTasks(workspaceId, () => snapshotBefore!)
        }
        toast.error("Failed to accept requests. Try again.")
      })
    },
    [workspaceId, canManageTasks, options, reorderTasks]
  )

  const denyMany = useCallback(
    (tasks: RequestTaskInput[]) => {
      if (!workspaceId || !canManageTasks || tasks.length === 0) return
      const validTasks = tasks.filter((t) => !t.id.startsWith("optimistic:"))
      if (validTasks.length === 0) return
      options?.onLocalChange?.()
      const idSet = new Set(validTasks.map((t) => t.id))
      let removedTasks: TaskDoc[] = []
      updateWorkspaceTasks(workspaceId, (current) => {
        removedTasks = current.filter((item) => idSet.has(item._id))
        return current.filter((item) => !idSet.has(item._id))
      })
      toast.success(`Denied ${validTasks.length} request${validTasks.length === 1 ? "" : "s"}.`)
      for (const task of validTasks) {
        trackRequestDenied({ taskId: task.id })
      }
      const realTasks = validTasks.filter((t) => !isDevTask(t.id))
      if (realTasks.length === 0) return
      void Promise.all(
        realTasks.map((task) =>
          deleteTask({ taskId: task.id as Id<"tasks"> })
        )
      ).catch(() => {
        if (removedTasks.length > 0) {
          updateWorkspaceTasks(workspaceId, (current) =>
            sortTaskDocs([...current, ...removedTasks])
          )
        }
        toast.error("Failed to deny requests. Try again.")
      })
    },
    [workspaceId, canManageTasks, options, deleteTask]
  )

  return {
    canManageTasks,
    acceptRequest,
    denyRequest,
    acceptMany,
    denyMany,
  }
}
