"use client"

import { useEffect, useState } from "react"
import { useConvexConnectionState } from "convex/react"
import { cn } from "@workspace/ui/lib/utils"

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const

export function SyncIndicator({ className }: { className?: string }) {
  const connection = useConvexConnectionState()
  const isSyncing =
    connection.hasInflightRequests ||
    (connection.hasEverConnected && !connection.isWebSocketConnected)

  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (!isSyncing) return
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length)
    }, 80)
    return () => window.clearInterval(id)
  }, [isSyncing])

  return (
    <span
      role={isSyncing ? "status" : undefined}
      aria-live="polite"
      aria-label={isSyncing ? "Syncing" : undefined}
      title={isSyncing ? "Syncing\u2026" : undefined}
      className={cn(
        "pointer-events-none inline-block font-mono text-[10px] leading-none tabular-nums text-sidebar-foreground/40 transition-opacity duration-200 select-none",
        isSyncing ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      {FRAMES[frame]}
    </span>
  )
}
