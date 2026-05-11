"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { motion } from "motion/react"
import { Spinner } from "@workspace/ui/components/spinner"

/**
 * Wraps every dashboard page in a fade-in motion container. Keyed by
 * pathname so the animation re-fires on every navigation, and gated on a
 * client-only mount so page content never SSRs (the server only paints the
 * neutral skeleton, which avoids hydration jank and lets pages mount
 * instantly into their fade).
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <PageSkeleton />
  }

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="h-full"
    >
      {children}
    </motion.div>
  )
}

/**
 * Generic loading shape shown before client mount and exported so individual
 * pages can drop it in while their data is loading.
 */
export function PageSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[44px] shrink-0 items-center gap-2 border-b border-border bg-toolbar px-3" />
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Spinner className="size-6" />
      </div>
    </div>
  )
}
