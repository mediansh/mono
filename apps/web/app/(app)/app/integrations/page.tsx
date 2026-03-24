"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function IntegrationsPage() {
  const router = useRouter()

  // Redirect to the first integration subpage
  useEffect(() => {
    router.replace("/app/integrations/discord")
  }, [router])

  return null
}
