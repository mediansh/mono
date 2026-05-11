"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  const { workspaces: cachedWorkspaces, currentWorkspaceId } =
    useLocalFirstStore()

  // Live, reactive workspace list. Source of truth while signed in.
  // Optimistic creates show up here immediately via withOptimisticUpdate.
  const liveWorkspaces = useQuery(
    api.workspaces.getUserWorkspaces,
    isAuthenticated ? {} : "skip"
  ) as Workspace[] | null | undefined

  const liveAnswered = Array.isArray(liveWorkspaces)

  useEffect(() => {
    if (isAuthLoading) return

    if (!isAuthenticated) {
      clearLocalFirstStore()
      return
    }

    if (liveAnswered) {
      setCachedWorkspaces(liveWorkspaces as Workspace[])
    }
  }, [isAuthLoading, isAuthenticated, liveAnswered, liveWorkspaces])

  // Use live data when we have it; otherwise fall back to cache for first paint.
  const workspaces: Workspace[] = liveAnswered
    ? (liveWorkspaces as Workspace[])
    : cachedWorkspaces

  // We're loading only when we have no answer yet AND nothing cached to render.
  const isLoading =
    isAuthLoading ||
    (isAuthenticated && !liveAnswered && cachedWorkspaces.length === 0)

  const switchWorkspace = useCallback((id: Id<"workspaces">) => {
    setCurrentWorkspaceId(id)
  }, [])

  const currentWorkspace =
    workspaces.find((workspace) => workspace._id === currentWorkspaceId) ??
    workspaces[0] ??
    null

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
