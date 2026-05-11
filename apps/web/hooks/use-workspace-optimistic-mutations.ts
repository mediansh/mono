"use client"

import { useAuth } from "@clerk/nextjs"
import { useConvexAuth, useMutation } from "convex/react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { setCurrentWorkspaceId, type WorkspaceRecord } from "@/lib/local-first-store"
import {
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
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth()

  // Optimistically insert the new workspace into the live getUserWorkspaces
  // query so the WorkspaceProvider sees it immediately, before the server
  // confirms. Convex replaces this with the real value once the mutation
  // resolves and the subscription updates.
  const createWorkspace = useMutation(
    api.workspaces.createWorkspace
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.workspaces.getUserWorkspaces, {})
    if (!Array.isArray(current)) {
      return
    }

    const optimisticId = `optimistic-workspace-${
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)
    }` as unknown as Id<"workspaces">

    const optimistic = {
      _id: optimisticId,
      _creationTime: Date.now(),
      name: args.name,
      prefix: generatePrefix(args.name),
      iconId: args.iconId,
      iconUrl: null,
      ownerId: userId ?? "",
      role: "owner" as const,
      taskCounter: 0,
      labels: [],
    }

    localStore.setQuery(api.workspaces.getUserWorkspaces, {}, [
      ...current,
      optimistic as unknown as (typeof current)[number],
    ])
  })

  const updateWorkspace = useMutation(api.workspaces.updateWorkspace)
  const deleteWorkspace = useMutation(api.workspaces.deleteWorkspace)
  const updateWorkspaceLabels = useMutation(api.workspaces.updateWorkspaceLabels)

  async function createWorkspaceOptimistic({
    name,
    iconId,
  }: {
    name: string
    iconId?: Id<"_storage">
    iconUrl?: string | null
  }) {
    const normalizedName = name.trim()

    if (isAuthLoading || !isAuthenticated) {
      throw new Error("Not authenticated")
    }

    const workspaceId = await createWorkspace({
      name: normalizedName,
      iconId,
    })

    setCurrentWorkspaceId(workspaceId)

    return workspaceId
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
  }: {
    workspace: WorkspaceRecord
    fallbackWorkspaceId: Id<"workspaces"> | null
    index: number
  }) {
    removeWorkspaceRecord(workspace._id, {
      nextCurrentWorkspaceId: fallbackWorkspaceId,
    })

    await deleteWorkspace({ workspaceId: workspace._id })
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

  return {
    createWorkspaceOptimistic,
    updateWorkspaceOptimistic,
    deleteWorkspaceOptimistic,
    updateWorkspaceLabelsOptimistic,
  }
}
