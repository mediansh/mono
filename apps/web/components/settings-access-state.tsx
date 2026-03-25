"use client"

import { Gear } from "@phosphor-icons/react"

export function SettingsAccessState() {
  return (
    <div
      className="rounded-none border-2 border-border bg-card p-8 shadow-none"
    >
      <div className="flex max-w-md flex-col items-start gap-4">
        <div className="flex size-12 items-center justify-center rounded-none border border-border bg-muted">
          <Gear
            size={22}
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
    </div>
  )
}
