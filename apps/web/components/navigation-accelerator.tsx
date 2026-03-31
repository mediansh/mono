"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

import { useInstantNavigation } from "@/hooks/use-instant-navigation"

function getInternalHref(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null
  }

  const anchor = target.closest("a[href]")
  if (!(anchor instanceof HTMLAnchorElement)) {
    return null
  }

  if (
    anchor.target === "_blank" ||
    anchor.hasAttribute("download") ||
    anchor.getAttribute("rel")?.includes("external")
  ) {
    return null
  }

  try {
    const url = new URL(anchor.href, window.location.href)
    if (url.origin !== window.location.origin) {
      return null
    }

    if (url.hash && url.pathname === window.location.pathname) {
      return null
    }

    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

function requestIdleTask(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined
  }

  const win = window as Window &
    typeof globalThis & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions
      ) => number
      cancelIdleCallback?: (handle: number) => void
    }

  if (typeof win.requestIdleCallback === "function") {
    const id = win.requestIdleCallback(callback, { timeout: 500 })
    return () => win.cancelIdleCallback?.(id)
  }

  const id = globalThis.setTimeout(callback, 120)
  return () => globalThis.clearTimeout(id)
}

export function NavigationAccelerator() {
  const pathname = usePathname()
  const { prefetch } = useInstantNavigation()

  useEffect(() => {
    const handler = (event: Event) => {
      const href = getInternalHref(event.target)
      if (!href || href === pathname) {
        return
      }

      prefetch(href)
    }

    document.addEventListener("mouseover", handler, { capture: true, passive: true })
    document.addEventListener("focusin", handler, { capture: true, passive: true })
    document.addEventListener("touchstart", handler, { capture: true, passive: true })
    document.addEventListener("pointerdown", handler, { capture: true, passive: true })

    return () => {
      document.removeEventListener("mouseover", handler, { capture: true })
      document.removeEventListener("focusin", handler, { capture: true })
      document.removeEventListener("touchstart", handler, { capture: true })
      document.removeEventListener("pointerdown", handler, { capture: true })
    }
  }, [pathname, prefetch])

  useEffect(() => {
    const cancelIdleTask = requestIdleTask(() => {
      const seen = new Set<string>()
      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))

      for (const anchor of anchors) {
        const href = getInternalHref(anchor)
        if (!href || href === pathname || seen.has(href)) {
          continue
        }

        seen.add(href)
        prefetch(href)

        if (seen.size >= 24) {
          break
        }
      }
    })

    return cancelIdleTask
  }, [pathname, prefetch])

  return null
}
