import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"

export default async function AppPage() {
  const { userId } = await auth()

  if (!userId) {
    redirect("/sign-in")
  }

  return (
    <main className="min-h-screen" />
  )
}
