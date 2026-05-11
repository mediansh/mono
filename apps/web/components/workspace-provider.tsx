"use client"

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useState,
  type ReactNode,
} from "react"
import { useConvex, useConvexAuth } from "convex/react"
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
  const convex = useConvex()
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth()
  const { workspaces, currentWorkspaceId } = useLocalFirstStore()
  const [hasFetchedWorkspaces, setHasFetchedWorkspaces] = useState(false)
  const [refreshAttempt, setRefreshAttempt] = useState(0)

  useEffect(() => {
    if (isAuthLoading) {
      return
    }

    if (!isAuthenticated) {
      clearLocalFirstStore()
      setHasFetchedWorkspaces(true)
      return
    }

    let cancelled = false
    let retryTimeout: ReturnType<typeof globalThis.setTimeout> | null = null
    setHasFetchedWorkspaces(workspaces.length > 0)

    function retryRefresh() {
      retryTimeout = globalThis.setTimeout(
        () => setRefreshAttempt((attempt) => attempt + 1),
        1000
      )
    }

    async function refreshWorkspaces() {
      try {
        const nextWorkspaces = (await convex.query(
          api.workspaces.getUserWorkspaces,
          {}
        )) as Workspace[] | null

        if (cancelled) {
          return
        }

        if (nextWorkspaces === null) {
          if (workspaces.length > 0) {
            setHasFetchedWorkspaces(true)
          } else {
            retryRefresh()
          }
          return
        }

        setCachedWorkspaces(nextWorkspaces)
        setHasFetchedWorkspaces(true)
      } catch {
        if (cancelled) {
          return
        }

        if (workspaces.length > 0) {
          setHasFetchedWorkspaces(true)
        } else {
          retryRefresh()
        }
      }
    }

    void refreshWorkspaces()

    return () => {
      cancelled = true
      if (retryTimeout !== null) {
        globalThis.clearTimeout(retryTimeout)
      }
    }
  }, [convex, isAuthLoading, isAuthenticated, refreshAttempt, workspaces.length])

  const switchWorkspace = useCallback(
    (id: Id<"workspaces">) => {
      setCurrentWorkspaceId(id)
    },
    []
  )

  const isLoading =
    isAuthLoading ||
    (isAuthenticated && !hasFetchedWorkspaces && workspaces.length === 0)

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
