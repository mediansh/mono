"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { useWorkspace } from "@/components/workspace-provider"
import { useInstantNavigation } from "@/hooks/use-instant-navigation"

export function WorkspaceGuard({ children }: { children: React.ReactNode }) {
  const { workspaces, isLoading } = useWorkspace()
  const { replace } = useInstantNavigation()
  const pathname = usePathname()
  const isSetupPage = pathname === "/app/setup"
  const isEarlyAccessPage = pathname === "/app/early-access"
  const hasWorkspaces = workspaces.length > 0

  useEffect(() => {
    if (isLoading) return
    if (isEarlyAccessPage) return

    if (!hasWorkspaces && !isSetupPage) {
      replace("/app/setup")
      return
    }

    if (hasWorkspaces && isSetupPage) {
      replace("/app")
    }
  }, [hasWorkspaces, isLoading, isSetupPage, isEarlyAccessPage, replace])

  // While loading, render children immediately — the sidebar is static
  // and the board already handles its own loading skeleton
  if (isLoading) {
    return <>{children}</>
  }

  if (isEarlyAccessPage) {
    return <>{children}</>
  }

  if ((!hasWorkspaces && !isSetupPage) || (hasWorkspaces && isSetupPage)) {
    return null
  }

  return <>{children}</>
}
