"use client"

import { User } from "@phosphor-icons/react"
import { cn } from "@workspace/ui/lib/utils"
import {
  resolveAssigneeWithCurrentUserProfile,
  useCurrentUserProfile,
} from "@/hooks/use-current-user-profile"
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
  const currentUserProfile = useCurrentUserProfile()
  const resolvedAssignee = resolveAssigneeWithCurrentUserProfile(
    assignee ?? null,
    currentUserProfile
  )

  if (!resolvedAssignee) {
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

  if (resolvedAssignee.avatar) {
    return (
      <img
        src={resolvedAssignee.avatar}
        alt={resolvedAssignee.name}
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
      {getAssigneeInitials(resolvedAssignee)}
    </span>
  )
}
