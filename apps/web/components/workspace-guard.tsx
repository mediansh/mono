"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useWorkspace } from "@/components/workspace-provider"

export function WorkspaceGuard({ children }: { children: React.ReactNode }) {
  const { workspaces, isLoading } = useWorkspace()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (isLoading) return
    if (workspaces.length === 0 && pathname !== "/app/setup") {
      router.replace("/app/setup")
    }
  }, [workspaces, isLoading, pathname, router])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      </div>
    )
  }

  if (workspaces.length === 0 && pathname !== "/app/setup") {
    return null
  }

  return <>{children}</>
}
