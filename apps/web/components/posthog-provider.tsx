"use client"

import { useEffect, useRef } from "react"
import { useAuth, useUser } from "@clerk/nextjs"
import { usePathname, useSearchParams } from "next/navigation"
import { initPostHog, posthog } from "@/lib/posthog"

function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!pathname) return

    let url = window.origin + pathname
    const params = searchParams?.toString()
    if (params) url += `?${params}`

    posthog.capture("$pageview", { $current_url: url })
  }, [pathname, searchParams])

  return null
}

function PostHogIdentifier() {
  const { isLoaded, userId } = useAuth()
  const { user } = useUser()
  const identified = useRef(false)

  useEffect(() => {
    if (!isLoaded) return

    if (userId && !identified.current) {
      posthog.identify(userId, {
        email: user?.primaryEmailAddress?.emailAddress,
        name: user?.fullName ?? user?.firstName,
        created_at: user?.createdAt?.toISOString(),
      })
      identified.current = true
    }

    if (!userId && identified.current) {
      posthog.reset()
      identified.current = false
    }
  }, [isLoaded, userId, user])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  // Init after hydration to avoid injecting <script> tags before React takes over
  useEffect(() => {
    initPostHog()
  }, [])

  return (
    <>
      <PostHogIdentifier />
      <PostHogPageView />
      {children}
    </>
  )
}
