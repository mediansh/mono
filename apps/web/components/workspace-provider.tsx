"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import { useConvexAuth, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"

type Workspace = {
  _id: Id<"workspaces">
  name: string
  iconId: Id<"_storage">
  iconUrl: string | null
  ownerId: string
  role: string
}

type WorkspaceContextValue = {
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  switchWorkspace: (id: Id<"workspaces">) => void
  isLoading: boolean
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

const STORAGE_KEY = "median_current_workspace"
const HAS_WORKSPACE_COOKIE = "median_has_workspace"

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth()
  const workspaces = useQuery(
    api.workspaces.getUserWorkspaces,
    isAuthenticated ? {} : "skip"
  ) as
    | Workspace[]
    | undefined
  const [currentId, setCurrentId] = useState<Id<"workspaces"> | null>(null)
  const isLoading = isAuthLoading || (isAuthenticated && workspaces === undefined)

  useEffect(() => {
    if (!workspaces || workspaces.length === 0) return

    const stored = localStorage.getItem(STORAGE_KEY)
    const match = stored
      ? workspaces.find((w) => w._id === stored)
      : null

    if (match) {
      setCurrentId(match._id)
    } else {
      const first = workspaces[0]
      if (first) {
        setCurrentId(first._id)
        localStorage.setItem(STORAGE_KEY, first._id)
      }
    }
  }, [workspaces])

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated) return
    if (workspaces === undefined) return

    document.cookie = `${HAS_WORKSPACE_COOKIE}=${workspaces.length > 0 ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax`

    if (workspaces.length === 0) {
      localStorage.removeItem(STORAGE_KEY)
      setCurrentId(null)
    }
  }, [workspaces])

  const switchWorkspace = useCallback(
    (id: Id<"workspaces">) => {
      setCurrentId(id)
      localStorage.setItem(STORAGE_KEY, id)
    },
    []
  )

  const currentWorkspace =
    workspaces?.find((w) => w._id === currentId) ?? null

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces: workspaces ?? [],
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
