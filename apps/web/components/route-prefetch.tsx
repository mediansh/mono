"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

type RoutePrefetchProps = {
  routes: string[]
}

export function RoutePrefetch({ routes }: RoutePrefetchProps) {
  const router = useRouter()

  useEffect(() => {
    const pathname = window.location.pathname
    const uniqueRoutes = Array.from(new Set(routes))

    for (const route of uniqueRoutes) {
      if (route === pathname) {
        continue
      }

      router.prefetch(route)
    }
  }, [router, routes])

  return null
}
