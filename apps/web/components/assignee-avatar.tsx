"use client"

import { User } from "@phosphor-icons/react"
import { cn } from "@workspace/ui/lib/utils"
import {
  getAssigneeInitials,
  type TaskAssignee,
} from "@/lib/task-board"

export function AssigneeAvatar({
  assignee,
  className,
  emptyClassName,
}: {
  assignee?: TaskAssignee | null
  className?: string
  emptyClassName?: string
}) {
  if (!assignee) {
    return (
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-border bg-background text-muted-foreground",
          emptyClassName
        )}
      >
        <User size={10} />
      </span>
    )
  }

  if (assignee.avatar) {
    return (
      <img
        src={assignee.avatar}
        alt={assignee.name}
        className={cn("size-5 shrink-0 rounded-full object-cover", className)}
      />
    )
  }

  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-foreground",
        className
      )}
    >
      {getAssigneeInitials(assignee)}
    </span>
  )
}
