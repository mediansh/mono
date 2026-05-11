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

function isRealWorkspace(workspace: Workspace) {
  return !workspace._id.toString().startsWith("optimistic-workspace-")
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth()
  const { workspaces: cachedWorkspaces, currentWorkspaceId } =
    useLocalFirstStore()

  // Single source of truth: the live Convex query.
  // Returns null only when there's no identity on the server, [] when the
  // user has no workspaces, or an array of workspaces.
  const liveWorkspaces = useQuery(
    api.workspaces.getUserWorkspaces,
    isAuthenticated ? {} : "skip"
  ) as Workspace[] | null | undefined

  const hasLiveAnswer = Array.isArray(liveWorkspaces)

  // Persist the server answer so we have a first-paint hint on next load.
  // We deliberately do NOT cache optimistic entries, and we do NOT wipe the
  // cache on transient isAuthenticated=false — that fires during routine JWT
  // refreshes, and clearing the cache mid-session was bouncing users back to
  // /app/setup.
  useEffect(() => {
    if (isAuthLoading) return
    if (!isAuthenticated) return
    if (!hasLiveAnswer) return

    const persistable = (liveWorkspaces as Workspace[]).filter(isRealWorkspace)
    setCachedWorkspaces(persistable)
  }, [isAuthLoading, isAuthenticated, hasLiveAnswer, liveWorkspaces])

  // While we don't yet have a definitive server answer, fall back to cache
  // only for the first paint. Once Convex answers, the server's word is final.
  const workspaces: Workspace[] = hasLiveAnswer
    ? (liveWorkspaces as Workspace[])
    : cachedWorkspaces

  // We're loading whenever we don't have a definitive signal that lets us
  // safely make a routing decision. If the cache already has workspaces we
  // can render the app immediately; otherwise we wait for the live query.
  const isLoading =
    isAuthLoading ||
    (isAuthenticated && !hasLiveAnswer && cachedWorkspaces.length === 0)

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
