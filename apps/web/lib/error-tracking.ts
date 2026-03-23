export type ErrorTrackingPayload = {
  source: "window.error" | "unhandledrejection" | "react.error-boundary"
  message: string
  stack?: string
  digest?: string
  pathname?: string
  userAgent?: string
  metadata?: Record<string, string | number | boolean | null | undefined>
}

export async function reportError(payload: ErrorTrackingPayload) {
  try {
    await fetch("/api/errors/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
  } catch {
    // Reporting failures should never crash the app.
  }
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === "string") {
    return error
  }

  return "Unknown error"
}

export function getErrorStack(error: unknown) {
  return error instanceof Error ? error.stack : undefined
}
