"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import { useQuery } from "convex/react"
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

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const workspaces = useQuery(api.workspaces.getUserWorkspaces) as
    | Workspace[]
    | undefined
  const [currentId, setCurrentId] = useState<Id<"workspaces"> | null>(null)

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
        isLoading: workspaces === undefined,
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
