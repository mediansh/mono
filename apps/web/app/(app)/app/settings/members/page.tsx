"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { UserMultiple02Icon } from "@hugeicons/core-free-icons"
import { motion } from "motion/react"

export default function MembersSettingsPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mx-auto w-full max-w-2xl px-8 py-8"
    >
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold">Members</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage who has access to this workspace.
        </p>
      </div>

      {/* Coming soon state */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-muted">
            <HugeiconsIcon
              icon={UserMultiple02Icon}
              size={22}
              strokeWidth={1.5}
              className="text-muted-foreground"
            />
          </div>
          <h3 className="text-sm font-medium">Coming soon</h3>
          <p className="mt-1.5 max-w-[280px] text-xs text-muted-foreground">
            Team member management and role-based access controls are coming in a
            future update.
          </p>
        </div>
      </div>
    </motion.div>
  )
}
