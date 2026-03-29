"use client"

import { useDevDebug } from "@/lib/dev-debug-store"

/**
 * Place inside an error boundary. When the debug panel sets simulatedError
 * to the matching target, this component throws — triggering the boundary.
 */
export function DevErrorTrigger({ target }: { target: "app" | "global" }) {
  const { simulatedError } = useDevDebug()

  if (simulatedError === target) {
    throw new Error(
      `[DevDebug] Simulated ${target} error — triggered from debug panel`
    )
  }

  return null
}
