"use client"

import { useEffect, useState } from "react"
import { useAction } from "convex/react"
import { motion, AnimatePresence } from "motion/react"
import Link from "next/link"
import { Warning } from "@phosphor-icons/react"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"

type QuotaState = {
  aiExhausted: boolean
  eventsExhausted: boolean
}

export function QuotaBanner() {
  const { currentWorkspace } = useWorkspace()
  const getQuotaStatus = useAction(api.billing.getWorkspaceQuotaStatus)
  const [quota, setQuota] = useState<QuotaState | null>(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      if (!currentWorkspace) {
        setQuota(null)
        return
      }
      try {
        const result = await getQuotaStatus({ workspaceId: currentWorkspace._id })
        if (cancelled) return
        if (result.overagesDisabled) {
          setQuota({
            aiExhausted: result.aiExhausted,
            eventsExhausted: result.eventsExhausted,
          })
        } else {
          setQuota(null)
        }
      } catch {
        if (!cancelled) setQuota(null)
      }
    }

    void check()
    const interval = window.setInterval(() => void check(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [currentWorkspace?._id, getQuotaStatus])

  const showBanner = quota !== null && (quota.aiExhausted || quota.eventsExhausted)

  return (
    <AnimatePresence>
      {showBanner && quota && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="sticky top-0 z-40 flex items-center justify-center gap-2.5 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[12px] font-medium text-foreground backdrop-blur"
        >
          <Warning size={14} weight="fill" className="shrink-0 text-amber-500" />
          <span className="text-center">
            {quota.aiExhausted && quota.eventsExhausted
              ? "AI budget and events are exhausted. AI generation and integration syncs are paused. "
              : quota.aiExhausted
                ? "AI budget exhausted. Task generation is paused. "
                : "Events exhausted. Discord, Linear, GitHub, and X syncs are paused. "}
            <Link
              href="/app/billing"
              className="underline underline-offset-2 hover:text-amber-700"
            >
              Manage billing
            </Link>
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
