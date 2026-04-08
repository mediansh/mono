"use client"

import { useUser } from "@clerk/nextjs"
import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useConvex, useConvexAuth, useMutation } from "convex/react"
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

const HAS_WORKSPACE_COOKIE = "median_has_workspace"

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const convex = useConvex()
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth()
  const { user } = useUser()
  const syncMyProfile = useMutation(api.workspaces.syncMyProfile)
  const { workspaces, currentWorkspaceId } = useLocalFirstStore()
  const [hasFetchedWorkspaces, setHasFetchedWorkspaces] = useState(false)
  const lastProfileSyncKeyRef = useRef<string | null>(null)

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

    async function refreshWorkspaces() {
      try {
        const nextWorkspaces = (await convex.query(api.workspaces.getUserWorkspaces, {})) as Workspace[]
        if (cancelled) {
          return
        }

        setCachedWorkspaces(nextWorkspaces)
      } finally {
        if (!cancelled) {
          setHasFetchedWorkspaces(true)
        }
      }
    }

    void refreshWorkspaces()

    return () => {
      cancelled = true
    }
  }, [convex, isAuthLoading, isAuthenticated])

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated) return

    document.cookie = `${HAS_WORKSPACE_COOKIE}=${workspaces.length > 0 ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax`
  }, [isAuthLoading, isAuthenticated, workspaces.length])

  useEffect(() => {
    if (!isAuthenticated || !user || workspaces.length === 0) {
      lastProfileSyncKeyRef.current = null
      return
    }

    const nextSyncKey = [
      user.id,
      user.fullName ?? user.username ?? "",
      user.primaryEmailAddress?.emailAddress ?? "",
      user.imageUrl ?? "",
      workspaces.map((workspace) => workspace._id).sort().join(","),
    ].join("::")

    if (lastProfileSyncKeyRef.current === nextSyncKey) {
      return
    }

    lastProfileSyncKeyRef.current = nextSyncKey

    let cancelled = false

    async function syncProfileAcrossWorkspaces() {
      await Promise.allSettled(
        workspaces.map((workspace) =>
          syncMyProfile({ workspaceId: workspace._id })
        )
      )

      const nextWorkspaces = (await convex.query(
        api.workspaces.getUserWorkspaces,
        {}
      )) as Workspace[]

      if (!cancelled) {
        setCachedWorkspaces(nextWorkspaces)
      }
    }

    void syncProfileAcrossWorkspaces()

    return () => {
      cancelled = true
    }
  }, [convex, isAuthenticated, syncMyProfile, user, workspaces])

  const switchWorkspace = useCallback(
    (id: Id<"workspaces">) => {
      setCurrentWorkspaceId(id)
    },
    []
  )

  const isLoading =
    isAuthLoading || (isAuthenticated && !hasFetchedWorkspaces && workspaces.length === 0)

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
