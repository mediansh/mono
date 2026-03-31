"use client"

import { useEffect } from "react"
import { useConvex } from "convex/react"

import { useWorkspace } from "@/components/workspace-provider"
import { api } from "@/convex/_generated/api"

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
    const id = win.requestIdleCallback(callback, { timeout: 800 })
    return () => win.cancelIdleCallback?.(id)
  }

  const id = globalThis.setTimeout(callback, 150)
  return () => globalThis.clearTimeout(id)
}

export function WorkspaceQueryPreloader() {
  const convex = useConvex()
  const { currentWorkspace } = useWorkspace()

  useEffect(() => {
    if (!currentWorkspace) {
      return
    }

    const workspaceId = currentWorkspace._id
    const cancelIdleTask = requestIdleTask(() => {
      convex.prewarmQuery({
        query: api.workspaces.getWorkspaceMembers,
        args: { workspaceId },
        extendSubscriptionFor: 20_000,
      })
      convex.prewarmQuery({
        query: api.discord.getWorkspaceDiscordIntegration,
        args: { workspaceId },
        extendSubscriptionFor: 20_000,
      })
      convex.prewarmQuery({
        query: api.linear.getWorkspaceLinearIntegration,
        args: { workspaceId },
        extendSubscriptionFor: 20_000,
      })
      convex.prewarmQuery({
        query: api.x.getWorkspaceXIntegration,
        args: { workspaceId },
        extendSubscriptionFor: 20_000,
      })
      convex.prewarmQuery({
        query: api.github.getWorkspaceGitHubIntegration,
        args: { workspaceId },
        extendSubscriptionFor: 20_000,
      })
    })

    return cancelIdleTask
  }, [convex, currentWorkspace])

  return null
}
