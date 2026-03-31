"use client"

import { startTransition, useCallback } from "react"
import { useRouter } from "next/navigation"

function isInternalHref(href: string) {
  return href.startsWith("/")
}

export function useInstantNavigation() {
  const router = useRouter()

  const prefetch = useCallback(
    (href: string) => {
      if (!isInternalHref(href)) {
        return
      }

      router.prefetch(href)
    },
    [router]
  )

  const navigate = useCallback(
    (href: string, options?: { replace?: boolean }) => {
      if (!isInternalHref(href)) {
        if (typeof window === "undefined") {
          return
        }

        if (options?.replace) {
          window.location.replace(href)
          return
        }

        window.location.assign(href)
        return
      }

      router.prefetch(href)
      startTransition(() => {
        if (options?.replace) {
          router.replace(href)
          return
        }

        router.push(href)
      })
    },
    [router]
  )

  const replace = useCallback(
    (href: string) => {
      navigate(href, { replace: true })
    },
    [navigate]
  )

  return {
    navigate,
    prefetch,
    replace,
  }
}
