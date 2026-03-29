"use client"

import { useEffect } from "react"
import { installNetworkInterceptor } from "@/hooks/use-dev-overrides"

/**
 * Drop this once at the root layout in dev mode.
 * Patches fetch() to respect the debug panel's network simulation.
 */
export function DevNetworkInterceptor() {
  useEffect(() => {
    const cleanup = installNetworkInterceptor()
    return cleanup
  }, [])

  return null
}
