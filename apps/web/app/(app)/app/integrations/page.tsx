"use client"

import { useEffect } from "react"
import { useInstantNavigation } from "@/hooks/use-instant-navigation"

export default function IntegrationsPage() {
  const { replace } = useInstantNavigation()

  // Redirect to the first integration subpage
  useEffect(() => {
    replace("/app/integrations/discord")
  }, [replace])

  return null
}
