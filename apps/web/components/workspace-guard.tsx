"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useWorkspace } from "@/components/workspace-provider"

export function WorkspaceGuard({ children }: { children: React.ReactNode }) {
  const { workspaces, isLoading } = useWorkspace()
  const router = useRouter()
  const pathname = usePathname()
  const isSetupPage = pathname === "/app/setup"
  const hasWorkspaces = workspaces.length > 0

  useEffect(() => {
    if (isLoading) return

    if (!hasWorkspaces && !isSetupPage) {
      router.replace("/app/setup")
      return
    }

    if (hasWorkspaces && isSetupPage) {
      router.replace("/app")
    }
  }, [hasWorkspaces, isLoading, isSetupPage, router])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      </div>
    )
  }

  if ((!hasWorkspaces && !isSetupPage) || (hasWorkspaces && isSetupPage)) {
    return null
  }

  return <>{children}</>
}
