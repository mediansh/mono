import posthog from "posthog-js"

export function initPostHog() {
  if (typeof window === "undefined") return
  if (posthog.__loaded) return

  const key =
    process.env.NEXT_PUBLIC_POSTHOG_KEY ??
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  if (!key) return

  const isDev = process.env.NODE_ENV === "development"

  posthog.init(key, {
    api_host:
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: true,
    // Autocapture lazy-loads a dead-clicks script that 404s in dev and trips
    // Next.js's error overlay; disable it there but keep manual capture()
    // working so instrumentation can still be exercised locally.
    autocapture: !isDev,
    disable_session_recording: isDev,
    loaded: isDev ? (ph) => ph.debug() : undefined,
  })
}

export { posthog }
