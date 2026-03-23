"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { Settings01Icon } from "@hugeicons/core-free-icons"
import { motion } from "motion/react"

export function SettingsAccessState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="rounded-2xl border border-border bg-card/80 p-8 shadow-sm"
    >
      <div className="flex max-w-md flex-col items-start gap-4">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-muted/70">
          <HugeiconsIcon
            icon={Settings01Icon}
            size={22}
            strokeWidth={1.6}
            className="text-muted-foreground"
          />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold">Admin access required</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Workspace settings are limited to admins. Guests can view tasks, members can
            manage tasks, and admins can update the workspace configuration.
          </p>
        </div>
      </div>
    </motion.div>
  )
}
