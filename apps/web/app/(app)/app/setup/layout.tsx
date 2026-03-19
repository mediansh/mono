import type { Metadata } from "next"
import { auth } from "@clerk/nextjs/server"
import { fetchQuery } from "convex/nextjs"
import { redirect } from "next/navigation"
import { api } from "@/convex/_generated/api"

export const metadata: Metadata = {
  title: "Create workspace",
}

export default async function SetupLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const { userId, getToken } = await auth()

  if (!userId) {
    redirect("/sign-in")
  }

  const token = await getToken({ template: "convex" })

  if (token) {
    const workspaces = await fetchQuery(api.workspaces.getUserWorkspaces, {}, { token })

    if (workspaces.length > 0) {
      redirect("/app")
    }
  }

  return <>{children}</>
}
