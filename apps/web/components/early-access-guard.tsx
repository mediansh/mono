"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useInstantNavigation } from "@/hooks/use-instant-navigation"

export function EarlyAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { replace } = useInstantNavigation()
  const enabled = useQuery(api.earlyAccess.isEnabled)
  const redemption = useQuery(api.earlyAccess.currentUserRedemption)
  const isAdmin = useQuery(api.admins.isCurrentUserAdmin)

  const isEarlyAccessPage = pathname === "/app/early-access"
  const loading =
    enabled === undefined || redemption === undefined || isAdmin === undefined
  const earlyAccessDisabled = enabled === false
  const needsCode =
    enabled === true && redemption === null && isAdmin === false

  useEffect(() => {
    if (loading) return
    if (earlyAccessDisabled && isEarlyAccessPage) {
      replace("/app")
      return
    }
    if (needsCode && !isEarlyAccessPage) {
      replace("/app/early-access")
      return
    }
    if (!needsCode && isEarlyAccessPage) {
      replace("/app")
    }
  }, [earlyAccessDisabled, loading, needsCode, isEarlyAccessPage, replace])

  if (loading) return null

  if (needsCode && !isEarlyAccessPage) return null
  if (!needsCode && isEarlyAccessPage) return null

  return <>{children}</>
}
