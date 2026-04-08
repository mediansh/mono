"use client"

import { Check, CaretDown, User } from "@phosphor-icons/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"
import { AssigneeAvatar } from "@/components/assignee-avatar"
import {
  findMatchingAssignee,
  formatAssigneeRole,
  type TaskAssignee,
} from "@/lib/task-board"

type AssigneeSelectorProps = {
  assignees: TaskAssignee[]
  value?: TaskAssignee | null
  onChange: (assignee: TaskAssignee | null) => void
  disabled?: boolean
  className?: string
  align?: "start" | "center" | "end"
  variant?: "default" | "compact"
  placeholder?: string
}

export function AssigneeSelector({
  assignees,
  value,
  onChange,
  disabled,
  className,
  align = "start",
  variant = "default",
  placeholder = "Assignee",
}: AssigneeSelectorProps) {
  const isCompact = variant === "compact"
  const resolvedValue = findMatchingAssignee(value, assignees) ?? value

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={cn(
          "flex items-center gap-1.5 rounded-[4px] ring-1 ring-border transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
          isCompact
            ? "h-7 min-w-7 px-1.5 text-[11px] text-muted-foreground"
            : "px-2 py-1 text-[11px] font-medium",
          className
        )}
      >
        <AssigneeAvatar assignee={resolvedValue} />
        {!isCompact ? (
          <span
            className={cn("max-w-[140px] truncate", !resolvedValue && "text-muted-foreground")}
          >
            {resolvedValue?.name ?? placeholder}
          </span>
        ) : resolvedValue ? (
          <span className="max-w-[80px] truncate text-[11px] text-foreground">
            {resolvedValue.name}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">None</span>
        )}
        {!isCompact ? <CaretDown size={12} className="text-muted-foreground" /> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side="bottom" className="min-w-[220px]">
        <DropdownMenuItem onClick={() => onChange(null)}>
          <div className="flex w-full items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-border bg-background text-muted-foreground">
              <User size={10} />
            </span>
            <span className="flex-1">No assignee</span>
            {!resolvedValue ? <Check size={14} weight="bold" className="text-primary" /> : null}
          </div>
        </DropdownMenuItem>
        {assignees.map((assignee) => {
          const isSelected = resolvedValue?.id === assignee.id
          return (
            <DropdownMenuItem key={assignee.id} onClick={() => onChange(assignee)}>
              <div className="flex w-full items-center gap-2">
                <AssigneeAvatar assignee={assignee} />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{assignee.name}</div>
                  {assignee.email ? (
                    <div className="truncate text-[11px] text-muted-foreground">
                      {formatAssigneeRole(assignee.role)} · {assignee.email}
                    </div>
                  ) : (
                    <div className="truncate text-[11px] text-muted-foreground">
                      {formatAssigneeRole(assignee.role)}
                    </div>
                  )}
                </div>
                {isSelected ? (
                  <Check size={14} weight="bold" className="text-primary" />
                ) : null}
              </div>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
