import posthog from "posthog-js"

export function initPostHog() {
  if (typeof window === "undefined") return
  if (process.env.NODE_ENV === "development") return
  if (posthog.__loaded) return

  const key =
    process.env.NEXT_PUBLIC_POSTHOG_KEY ??
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  if (!key) return

  posthog.init(key, {
    api_host:
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
  })
}

export { posthog }
