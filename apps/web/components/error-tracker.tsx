"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

import {
  getErrorMessage,
  getErrorStack,
  reportError,
} from "@/lib/error-tracking"

const TOAST_ID = "app-runtime-error"

export function ErrorTracker() {
  const lastErrorRef = useRef<string | null>(null)

  useEffect(() => {
    const notify = (message: string) => {
      if (lastErrorRef.current === message) {
        return
      }

      lastErrorRef.current = message
      toast.error("Something went wrong", {
        id: TOAST_ID,
        description: message,
        duration: 7000,
      })
    }

    const handleError = (event: ErrorEvent) => {
      const message = event.message || getErrorMessage(event.error)

      notify(message)
      void reportError({
        source: "window.error",
        message,
        stack: getErrorStack(event.error),
        pathname: window.location.pathname,
        userAgent: window.navigator.userAgent,
      })
    }

    const handleRejection = (event: PromiseRejectionEvent) => {
      const message = getErrorMessage(event.reason)

      notify(message)
      void reportError({
        source: "unhandledrejection",
        message,
        stack: getErrorStack(event.reason),
        pathname: window.location.pathname,
        userAgent: window.navigator.userAgent,
      })
    }

    window.addEventListener("error", handleError)
    window.addEventListener("unhandledrejection", handleRejection)

    return () => {
      window.removeEventListener("error", handleError)
      window.removeEventListener("unhandledrejection", handleRejection)
    }
  }, [])

  return null
}
