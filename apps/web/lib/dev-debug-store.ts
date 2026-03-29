/**
 * Dev-only reactive store for the debug panel.
 * Mirrors the local-first-store pattern: useSyncExternalStore + plain object.
 */

import { useSyncExternalStore } from "react"

export type SimulatedRole = "owner" | "admin" | "member" | "guest" | null
export type SimulatedLoadingTarget =
  | "workspace"
  | "tasks"
  | "auth"
  | "global"
  | null
export type SimulatedErrorTarget = "app" | "global" | null
export type SimulatedNetworkState = "online" | "slow" | "offline"

export type DevDebugState = {
  /** When set, the workspace provider will report this role */
  simulatedRole: SimulatedRole
  /** Force a loading state on a specific target */
  simulatedLoading: SimulatedLoadingTarget
  /** Force an error boundary to fire */
  simulatedError: SimulatedErrorTarget
  /** Force empty states (no tasks, no workspaces) */
  simulateEmptyTasks: boolean
  simulateNoWorkspace: boolean
  /** Simulated network condition */
  networkState: SimulatedNetworkState
  /** Outline all elements for layout debugging */
  showLayoutOutlines: boolean
  /** Show component render counts */
  showRenderCounts: boolean
  /** Panel open/closed */
  panelOpen: boolean
  /** Which panel section is expanded */
  expandedSection: string | null
}

const DEFAULT_STATE: DevDebugState = {
  simulatedRole: null,
  simulatedLoading: null,
  simulatedError: null,
  simulateEmptyTasks: false,
  simulateNoWorkspace: false,
  networkState: "online",
  showLayoutOutlines: false,
  showRenderCounts: false,
  panelOpen: false,
  expandedSection: null,
}

let state: DevDebugState = { ...DEFAULT_STATE }
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function getDevDebugSnapshot() {
  return state
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setDevDebug<K extends keyof DevDebugState>(
  key: K,
  value: DevDebugState[K]
) {
  if (state[key] === value) return
  state = { ...state, [key]: value }
  emit()
}

export function toggleDevPanel() {
  state = { ...state, panelOpen: !state.panelOpen }
  emit()
}

export function resetDevDebug() {
  state = { ...DEFAULT_STATE, panelOpen: state.panelOpen }
  emit()
}

export function useDevDebug(): DevDebugState {
  return useSyncExternalStore(subscribe, getDevDebugSnapshot, getDevDebugSnapshot)
}
