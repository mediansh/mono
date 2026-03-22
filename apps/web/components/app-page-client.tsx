"use client"

import { useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { KanbanBoard } from "@/components/kanban-board"

export function AppPageClient() {
  const router = useRouter()
  const { isLoaded, userId } = useAuth()

  useEffect(() => {
    if (!isLoaded || userId) {
      return
    }

    router.replace("/sign-in")
  }, [isLoaded, router, userId])

  return (
    <main className="h-screen overflow-hidden">
      {isLoaded && userId ? <KanbanBoard /> : null}
    </main>
  )
}
