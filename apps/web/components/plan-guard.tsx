"use client"

import { useEffect, useState } from "react"
import { useAction } from "convex/react"
import { usePathname } from "next/navigation"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { CreditCardIcon } from "@hugeicons/core-free-icons"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"
import { useInstantNavigation } from "@/hooks/use-instant-navigation"
import { STARTER_TRIAL_DAYS } from "@/lib/billing/config"

const EXEMPT_PATHS = ["/app/billing", "/app/setup", "/app/settings"]

export function PlanGuard({ children }: { children: React.ReactNode }) {
  const { currentWorkspace } = useWorkspace()
  const pathname = usePathname()
  const { navigate } = useInstantNavigation()
  const checkPlanStatus = useAction(api.billing.getWorkspacePlanStatus)
  const [status, setStatus] = useState<"loading" | "active" | "none">("loading")
  const [checkedWorkspaceId, setCheckedWorkspaceId] = useState<string | null>(null)

  const isExempt = EXEMPT_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))

  useEffect(() => {
    if (!currentWorkspace || isExempt) return

    if (checkedWorkspaceId === currentWorkspace._id && status !== "loading") return

    let cancelled = false

    async function check() {
      try {
        const result = await checkPlanStatus({
          workspaceId: currentWorkspace!._id,
        })
        if (cancelled) return
        setStatus(result.hasActivePlan ? "active" : "none")
        setCheckedWorkspaceId(currentWorkspace!._id)
      } catch {
        if (!cancelled) {
          setStatus("active")
          setCheckedWorkspaceId(currentWorkspace!._id)
        }
      }
    }

    void check()

    return () => {
      cancelled = true
    }
  }, [currentWorkspace?._id, isExempt])

  if (isExempt) return <>{children}</>

  if (!currentWorkspace || status === "loading") {
    return <>{children}</>
  }

  if (status === "none") {
    return (
      <div className="flex h-full items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex max-w-sm flex-col items-center gap-4 text-center"
        >
          <div className="flex size-10 items-center justify-center rounded-[8px] bg-foreground/5">
            <HugeiconsIcon icon={CreditCardIcon} size={20} strokeWidth={1.8} className="text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold">Choose a plan to continue</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              You need an active plan to use Median. Start free with $0.50 in
              monthly credits, or pick a paid plan with a {STARTER_TRIAL_DAYS}-day
              free trial.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/app/billing")}
            className="flex h-8 items-center gap-1.5 rounded-[8px] bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            View plans
          </button>
        </motion.div>
      </div>
    )
  }

  return <>{children}</>
}
