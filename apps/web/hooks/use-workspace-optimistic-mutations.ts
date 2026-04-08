"use client"

import { useAuth } from "@clerk/nextjs"
import { useMutation } from "convex/react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import {
  getLocalFirstStoreSnapshot,
  type WorkspaceRecord,
} from "@/lib/local-first-store"
import {
  insertWorkspaceRecord,
  removeWorkspaceRecord,
  replaceWorkspaceRecord,
  updateWorkspaceRecord,
} from "@/lib/workspace-cache"

function generatePrefix(name: string) {
  const cleaned = name.trim().toUpperCase()
  const words = cleaned.split(/\s+/).filter(Boolean)

  if (words.length >= 3) {
    return words
      .slice(0, 3)
      .map((word) => word[0])
      .join("")
  }
  if (words.length === 2) {
    const twoChar = words.map((word) => word[0]).join("")
    if (twoChar.length >= 3) {
      return twoChar.slice(0, 3)
    }

    return (words[0]!.slice(0, 2) + words[1]![0]!).slice(0, 3)
  }

  const consonants = cleaned.replace(/[^A-Z]/g, "").replace(/[AEIOU]/g, "")
  if (consonants.length >= 3) {
    return consonants.slice(0, 3)
  }

  return cleaned.replace(/[^A-Z0-9]/g, "").slice(0, 3) || "TSK"
}

export function useWorkspaceOptimisticMutations() {
  const { userId } = useAuth()
  const createWorkspace = useMutation(api.workspaces.createWorkspace)
  const updateWorkspace = useMutation(api.workspaces.updateWorkspace)
  const deleteWorkspace = useMutation(api.workspaces.deleteWorkspace)
  const updateWorkspaceLabels = useMutation(api.workspaces.updateWorkspaceLabels)
  const updateWorkspaceAssignees = useMutation(
    api.workspaces.updateWorkspaceAssignees
  )

  async function createWorkspaceOptimistic({
    name,
    iconId,
    iconUrl,
  }: {
    name: string
    iconId?: Id<"_storage">
    iconUrl?: string | null
  }) {
    const normalizedName = name.trim()
    const previousWorkspaceId = getLocalFirstStoreSnapshot().currentWorkspaceId as
      | Id<"workspaces">
      | null
    const optimisticWorkspaceId =
      `optimistic-workspace-${crypto.randomUUID()}` as Id<"workspaces">

    const optimisticWorkspace: WorkspaceRecord = {
      _id: optimisticWorkspaceId,
      name: normalizedName,
      prefix: generatePrefix(normalizedName),
      iconId,
      iconUrl: iconUrl ?? null,
      ownerId: userId ?? "optimistic-user",
      role: "owner",
      taskCounter: 0,
      labels: [],
      assignees: [],
    }

    insertWorkspaceRecord(optimisticWorkspace, { setCurrent: true })

    try {
      const workspaceId = await createWorkspace({
        name: normalizedName,
        iconId,
      })

      replaceWorkspaceRecord(optimisticWorkspaceId, {
        ...optimisticWorkspace,
        _id: workspaceId,
      })

      return workspaceId
    } catch (error) {
      removeWorkspaceRecord(optimisticWorkspaceId, {
        nextCurrentWorkspaceId: previousWorkspaceId,
      })
      throw error
    }
  }

  async function updateWorkspaceOptimistic({
    workspaceId,
    name,
    iconId,
    iconUrl,
    previousWorkspace,
  }: {
    workspaceId: Id<"workspaces">
    name?: string
    iconId?: Id<"_storage">
    iconUrl?: string | null
    previousWorkspace: WorkspaceRecord
  }) {
    updateWorkspaceRecord(workspaceId, (workspace) => ({
      ...workspace,
      name: name?.trim() ?? workspace.name,
      prefix: name?.trim() ? generatePrefix(name.trim()) : workspace.prefix,
      iconId: iconId ?? workspace.iconId,
      iconUrl: iconUrl ?? workspace.iconUrl,
    }))

    try {
      await updateWorkspace({
        workspaceId,
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(iconId !== undefined ? { iconId } : {}),
      })
    } catch (error) {
      replaceWorkspaceRecord(workspaceId, previousWorkspace)
      throw error
    }
  }

  async function deleteWorkspaceOptimistic({
    workspace,
    fallbackWorkspaceId,
    index,
  }: {
    workspace: WorkspaceRecord
    fallbackWorkspaceId: Id<"workspaces"> | null
    index: number
  }) {
    removeWorkspaceRecord(workspace._id, {
      nextCurrentWorkspaceId: fallbackWorkspaceId,
    })

    try {
      await deleteWorkspace({ workspaceId: workspace._id })
    } catch (error) {
      insertWorkspaceRecord(workspace, {
        index,
        setCurrent: true,
      })
      throw error
    }
  }

  async function updateWorkspaceLabelsOptimistic({
    workspaceId,
    labels,
    previousWorkspace,
  }: {
    workspaceId: Id<"workspaces">
    labels: { name: string; color: string }[]
    previousWorkspace: WorkspaceRecord
  }) {
    updateWorkspaceRecord(workspaceId, (workspace) => ({
      ...workspace,
      labels,
    }))

    try {
      await updateWorkspaceLabels({
        workspaceId,
        labels,
      })
    } catch (error) {
      replaceWorkspaceRecord(workspaceId, previousWorkspace)
      throw error
    }
  }

  async function updateWorkspaceAssigneesOptimistic({
    workspaceId,
    assignees,
    previousWorkspace,
  }: {
    workspaceId: Id<"workspaces">
    assignees: {
      id: string
      name: string
      avatar: string
      role: "owner" | "admin" | "member" | "guest"
      email?: string
      linearUserId?: string
    }[]
    previousWorkspace: WorkspaceRecord
  }) {
    updateWorkspaceRecord(workspaceId, (workspace) => ({
      ...workspace,
      assignees,
    }))

    try {
      await updateWorkspaceAssignees({
        workspaceId,
        assignees,
      })
    } catch (error) {
      replaceWorkspaceRecord(workspaceId, previousWorkspace)
      throw error
    }
  }

  return {
    createWorkspaceOptimistic,
    updateWorkspaceOptimistic,
    deleteWorkspaceOptimistic,
    updateWorkspaceLabelsOptimistic,
    updateWorkspaceAssigneesOptimistic,
  }
}
