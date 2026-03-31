"use client"

import { useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { KanbanBoard } from "@/components/kanban-board"
import { useInstantNavigation } from "@/hooks/use-instant-navigation"

export function AppPageClient() {
  const { replace } = useInstantNavigation()
  const { isLoaded, userId } = useAuth()

  useEffect(() => {
    if (!isLoaded || userId) {
      return
    }

    replace("/sign-in")
  }, [isLoaded, replace, userId])

  return (
    <main className="h-screen overflow-hidden">
      {isLoaded && userId ? <KanbanBoard /> : null}
    </main>
  )
}
