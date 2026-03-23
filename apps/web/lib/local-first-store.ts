"use client"

import { useSyncExternalStore } from "react"
import type { Doc, Id } from "@/convex/_generated/dataModel"

export type WorkspaceRecord = {
  _id: Id<"workspaces">
  name: string
  prefix?: string
  iconId?: Id<"_storage">
  iconUrl: string | null
  ownerId: string
  role: string
  taskCounter?: number
  labels?: { name: string; color: string }[]
}

export type LocalTaskDoc = Omit<Doc<"tasks">, "_id"> & {
  _id: string
  _syncStatus?: "pending" | "error"
}

type LocalFirstStore = {
  version: 1
  currentWorkspaceId: string | null
  workspaces: WorkspaceRecord[]
  tasksByWorkspace: Record<string, LocalTaskDoc[]>
  collapsedColumnsByWorkspace: Record<string, string[]>
}

const STORAGE_KEY = "median_local_first_store_v1"

const EMPTY_STORE: LocalFirstStore = {
  version: 1,
  currentWorkspaceId: null,
  workspaces: [],
  tasksByWorkspace: {},
  collapsedColumnsByWorkspace: {},
}

let storeCache = EMPTY_STORE
let isInitialized = false
const listeners = new Set<() => void>()

function canUseDOM() {
  return typeof window !== "undefined"
}

function sanitizeStore(value: unknown): LocalFirstStore {
  if (!value || typeof value !== "object") {
    return EMPTY_STORE
  }

  const candidate = value as Partial<LocalFirstStore>
  return {
    version: 1,
    currentWorkspaceId:
      typeof candidate.currentWorkspaceId === "string" ? candidate.currentWorkspaceId : null,
    workspaces: Array.isArray(candidate.workspaces) ? candidate.workspaces : [],
    tasksByWorkspace:
      candidate.tasksByWorkspace && typeof candidate.tasksByWorkspace === "object"
        ? candidate.tasksByWorkspace
        : {},
    collapsedColumnsByWorkspace:
      candidate.collapsedColumnsByWorkspace &&
      typeof candidate.collapsedColumnsByWorkspace === "object"
        ? candidate.collapsedColumnsByWorkspace
        : {},
  }
}

function readStoreFromStorage() {
  if (!canUseDOM()) {
    return EMPTY_STORE
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return EMPTY_STORE
    }
    return sanitizeStore(JSON.parse(raw))
  } catch {
    return EMPTY_STORE
  }
}

function ensureInitialized() {
  if (isInitialized) {
    return
  }

  storeCache = readStoreFromStorage()
  isInitialized = true
}

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

function writeStore(nextStore: LocalFirstStore) {
  storeCache = nextStore

  if (canUseDOM()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextStore))
  }

  emitChange()
}

export function getLocalFirstStoreSnapshot() {
  ensureInitialized()
  return storeCache
}

export function subscribeToLocalFirstStore(listener: () => void) {
  listeners.add(listener)

  if (canUseDOM()) {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) {
        return
      }

      storeCache = readStoreFromStorage()
      emitChange()
    }

    window.addEventListener("storage", handleStorage)

    return () => {
      listeners.delete(listener)
      window.removeEventListener("storage", handleStorage)
    }
  }

  return () => {
    listeners.delete(listener)
  }
}

export function useLocalFirstStore() {
  return useSyncExternalStore(
    subscribeToLocalFirstStore,
    getLocalFirstStoreSnapshot,
    () => EMPTY_STORE
  )
}

export function updateLocalFirstStore(
  updater: (current: LocalFirstStore) => LocalFirstStore
) {
  const current = getLocalFirstStoreSnapshot()
  const next = updater(current)
  if (next === current) {
    return
  }
  writeStore(next)
}

export function setCachedWorkspaces(workspaces: WorkspaceRecord[]) {
  updateLocalFirstStore((current) => {
    const nextCurrentWorkspaceId =
      current.currentWorkspaceId &&
      workspaces.some((workspace) => workspace._id === current.currentWorkspaceId)
        ? current.currentWorkspaceId
        : workspaces[0]?._id ?? null

    const nextTasksByWorkspace = { ...current.tasksByWorkspace }
    for (const workspaceId of Object.keys(nextTasksByWorkspace)) {
      if (!workspaces.some((workspace) => workspace._id === workspaceId)) {
        delete nextTasksByWorkspace[workspaceId]
      }
    }

    return {
      ...current,
      workspaces,
      currentWorkspaceId: nextCurrentWorkspaceId,
      tasksByWorkspace: nextTasksByWorkspace,
    }
  })
}

export function clearLocalFirstStore() {
  writeStore(EMPTY_STORE)
}

export function setCurrentWorkspaceId(workspaceId: string | null) {
  updateLocalFirstStore((current) => ({
    ...current,
    currentWorkspaceId: workspaceId,
  }))
}

export function setWorkspaceTasks(workspaceId: string, tasks: LocalTaskDoc[]) {
  updateLocalFirstStore((current) => {
    if (current.tasksByWorkspace[workspaceId] === tasks) {
      return current
    }

    return {
      ...current,
      tasksByWorkspace: {
        ...current.tasksByWorkspace,
        [workspaceId]: tasks,
      },
    }
  })
}

export function setCollapsedWorkspaceColumns(
  workspaceId: string,
  columns: string[]
) {
  updateLocalFirstStore((current) => ({
    ...current,
    collapsedColumnsByWorkspace: {
      ...current.collapsedColumnsByWorkspace,
      [workspaceId]: columns,
    },
  }))
}

export function updateWorkspaceTasks(
  workspaceId: string,
  updater: (tasks: LocalTaskDoc[]) => LocalTaskDoc[]
) {
  updateLocalFirstStore((current) => {
    const currentTasks = current.tasksByWorkspace[workspaceId] ?? []
    const nextTasks = updater(currentTasks)

    if (nextTasks === currentTasks) {
      return current
    }

    return {
      ...current,
      tasksByWorkspace: {
        ...current.tasksByWorkspace,
        [workspaceId]: nextTasks,
      },
    }
  })
}
