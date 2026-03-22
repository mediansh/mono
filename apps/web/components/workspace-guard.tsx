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

  // While loading, render children immediately — the sidebar is static
  // and the board already handles its own loading skeleton
  if (isLoading) {
    return <>{children}</>
  }

  if ((!hasWorkspaces && !isSetupPage) || (hasWorkspaces && isSetupPage)) {
    return null
  }

  return <>{children}</>
}
