import type { Id } from "@/convex/_generated/dataModel"
import {
  updateLocalFirstStore,
  type WorkspaceRecord,
} from "@/lib/local-first-store"

export function insertWorkspaceRecord(
  workspace: WorkspaceRecord,
  options?: { index?: number; setCurrent?: boolean }
) {
  updateLocalFirstStore((current) => {
    const nextWorkspaces = [...current.workspaces]
    const existingIndex = nextWorkspaces.findIndex(
      (candidate) => candidate._id === workspace._id
    )

    if (existingIndex >= 0) {
      nextWorkspaces[existingIndex] = workspace
    } else if (
      options?.index !== undefined &&
      options.index >= 0 &&
      options.index <= nextWorkspaces.length
    ) {
      nextWorkspaces.splice(options.index, 0, workspace)
    } else {
      nextWorkspaces.push(workspace)
    }

    return {
      ...current,
      workspaces: nextWorkspaces,
      currentWorkspaceId: options?.setCurrent
        ? workspace._id
        : current.currentWorkspaceId,
    }
  })
}

export function updateWorkspaceRecord(
  workspaceId: string,
  updater: (workspace: WorkspaceRecord) => WorkspaceRecord
) {
  updateLocalFirstStore((current) => {
    const index = current.workspaces.findIndex(
      (workspace) => workspace._id === workspaceId
    )

    if (index === -1) {
      return current
    }

    const nextWorkspaces = [...current.workspaces]
    nextWorkspaces[index] = updater(nextWorkspaces[index]!)

    return {
      ...current,
      workspaces: nextWorkspaces,
    }
  })
}

export function replaceWorkspaceRecord(
  workspaceId: string,
  nextWorkspace: WorkspaceRecord
) {
  updateLocalFirstStore((current) => {
    const index = current.workspaces.findIndex(
      (workspace) => workspace._id === workspaceId
    )

    if (index === -1) {
      return current
    }

    const nextWorkspaces = [...current.workspaces]
    nextWorkspaces[index] = nextWorkspace

    return {
      ...current,
      workspaces: nextWorkspaces,
      currentWorkspaceId:
        current.currentWorkspaceId === workspaceId
          ? nextWorkspace._id
          : current.currentWorkspaceId,
    }
  })
}

export function removeWorkspaceRecord(
  workspaceId: string,
  options?: { nextCurrentWorkspaceId?: Id<"workspaces"> | null }
) {
  updateLocalFirstStore((current) => {
    const nextWorkspaces = current.workspaces.filter(
      (workspace) => workspace._id !== workspaceId
    )

    const nextCurrentWorkspaceId =
      current.currentWorkspaceId === workspaceId
        ? options?.nextCurrentWorkspaceId ?? nextWorkspaces[0]?._id ?? null
        : current.currentWorkspaceId

    return {
      ...current,
      workspaces: nextWorkspaces,
      currentWorkspaceId: nextCurrentWorkspaceId,
    }
  })
}
