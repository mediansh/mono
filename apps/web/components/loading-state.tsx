"use client"

import { motion } from "motion/react"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

type Props = {
  className?: string
  /** Tailwind size for the spinner (default size-5). */
  spinnerClassName?: string
  /** Delay before the spinner fades in, to avoid flicker on fast loads. */
  delayMs?: number
}

/**
 * Centered Apple-style spinner. Used as a drop-in replacement for skeleton
 * loaders. The spinner itself fades in after a short delay so quick loads
 * don't flash a loader.
 */
export function LoadingState({ className, spinnerClassName, delayMs = 120 }: Props) {
  return (
    <div className={cn("flex h-full w-full items-center justify-center", className)}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18, ease: "easeOut", delay: delayMs / 1000 }}
        className="flex items-center justify-center text-muted-foreground"
      >
        <Spinner className={cn("size-6", spinnerClassName)} />
      </motion.div>
    </div>
  )
}

/** Wrapper that fades content in once it's ready. */
export function FadeIn({
  children,
  className,
  duration = 0.22,
  y = 0,
}: {
  children: React.ReactNode
  className?: string
  duration?: number
  y?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
