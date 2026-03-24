"use client"

import { cn } from "@workspace/ui/lib/utils"
import { getRoleLabel } from "@/lib/workspace-permissions"

const roleClassNames: Record<string, string> = {
  owner: "border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300",
  admin: "border-[#14120B]/25 bg-[#14120B]/12 text-[#14120B]",
  member: "border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  guest: "border-border bg-muted/60 text-muted-foreground",
}

export function RoleBadge({ role, className }: { role: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
        roleClassNames[role] ?? roleClassNames.guest,
        className
      )}
    >
      {getRoleLabel(role)}
    </span>
  )
}
