import type { Metadata } from "next"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { KanbanBoard } from "@/components/kanban-board"

export const metadata: Metadata = {
  title: "Home",
}

export default async function AppPage() {
  const { userId } = await auth()

  if (!userId) {
    redirect("/sign-in")
  }

  return (
    <main className="h-screen overflow-hidden">
      <KanbanBoard />
    </main>
  )
}
