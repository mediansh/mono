/**
 * Hooks that read from the dev debug store and apply overrides
 * to workspace, loading, and permission states.
 *
 * Import these in dev mode only — they are safe to tree-shake in production.
 */

import { useDevDebug, getDevDebugSnapshot } from "@/lib/dev-debug-store"
import type { SimulatedRole } from "@/lib/dev-debug-store"

/**
 * Returns the role the debug panel is simulating, or null for real data.
 */
export function useSimulatedRole(): SimulatedRole {
  const { simulatedRole } = useDevDebug()
  return simulatedRole
}

/**
 * Wraps a loading boolean to respect the debug panel's simulated loading state.
 */
export function useDevLoading(
  target: "workspace" | "tasks" | "auth" | "global",
  realLoading: boolean
): boolean {
  const { simulatedLoading } = useDevDebug()
  if (simulatedLoading === "global") return true
  if (simulatedLoading === target) return true
  return realLoading
}

/**
 * Returns true when the dev panel is simulating empty tasks.
 */
export function useSimulateEmptyTasks(): boolean {
  const { simulateEmptyTasks } = useDevDebug()
  return simulateEmptyTasks
}

/**
 * Returns true when the dev panel is simulating no workspace.
 */
export function useSimulateNoWorkspace(): boolean {
  const { simulateNoWorkspace } = useDevDebug()
  return simulateNoWorkspace
}

/**
 * Returns the simulated error target, or null.
 */
export function useSimulatedError(): "app" | "global" | null {
  const { simulatedError } = useDevDebug()
  return simulatedError
}

/**
 * Non-hook version for reading the snapshot outside of React.
 */
export function getDevOverrides() {
  return getDevDebugSnapshot()
}

/**
 * Network interceptor — call once at app root in dev mode.
 * Patches fetch to add delays or simulate offline when debug panel says so.
 */
export function installNetworkInterceptor() {
  if (typeof window === "undefined") return () => {}

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const { networkState } = getDevDebugSnapshot()

    if (networkState === "offline") {
      throw new TypeError("DevDebug: simulated network failure")
    }

    if (networkState === "slow") {
      await new Promise((r) => setTimeout(r, 2000))
    }

    return originalFetch(...args)
  }

  return () => {
    window.fetch = originalFetch
  }
}
