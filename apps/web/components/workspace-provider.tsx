"use client"

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import { useConvexAuth, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import {
  clearLocalFirstStore,
  setCachedWorkspaces,
  setCurrentWorkspaceId,
  useLocalFirstStore,
  type WorkspaceRecord as Workspace,
} from "@/lib/local-first-store"

type WorkspaceContextValue = {
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  switchWorkspace: (id: Id<"workspaces">) => void
  isLoading: boolean
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth()
  const { workspaces, currentWorkspaceId } = useLocalFirstStore()
  const liveWorkspaces = useQuery(
    api.workspaces.getUserWorkspaces,
    isAuthenticated ? {} : "skip"
  ) as Workspace[] | undefined

  useEffect(() => {
    if (isAuthLoading) {
      return
    }

    if (!isAuthenticated) {
      clearLocalFirstStore()
      return
    }

    if (liveWorkspaces === undefined) {
      return
    }

    setCachedWorkspaces(liveWorkspaces)
  }, [isAuthLoading, isAuthenticated, liveWorkspaces])

  const switchWorkspace = useCallback(
    (id: Id<"workspaces">) => {
      setCurrentWorkspaceId(id)
    },
    []
  )

  const isLoading =
    isAuthLoading ||
    (isAuthenticated && liveWorkspaces === undefined && workspaces.length === 0)

  const currentWorkspace =
    workspaces.find((workspace) => workspace._id === currentWorkspaceId) ?? null

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspace,
        switchWorkspace,
        isLoading,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider")
  }
  return ctx
}
