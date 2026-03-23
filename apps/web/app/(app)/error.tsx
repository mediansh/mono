"use client"

import { useEffect } from "react"

import { reportError } from "@/lib/error-tracking"

type AppErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    void reportError({
      source: "react.error-boundary",
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      pathname:
        typeof window !== "undefined" ? window.location.pathname : undefined,
      userAgent:
        typeof window !== "undefined" ? window.navigator.userAgent : undefined,
      metadata: {
        boundary: "app",
      },
    })
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-[#0496FF]">Page error</p>
        <h1 className="mt-2 text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The error has been recorded. Reload this section to try again.
        </p>
        {error.digest ? (
          <p className="mt-4 rounded-lg bg-accent px-3 py-2 font-mono text-xs text-muted-foreground">
            Digest: {error.digest}
          </p>
        ) : null}
        <button
          onClick={reset}
          className="mt-5 inline-flex rounded-lg bg-[#0496FF] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0496FF]/90"
        >
          Retry
        </button>
      </div>
    </div>
  )
}
