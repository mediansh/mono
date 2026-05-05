"use client"

import { useMemo, useState } from "react"
import { useQuery } from "convex/react"
import { Users, MagnifyingGlass, Check } from "@phosphor-icons/react"
import {
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuCheckboxItem,
} from "@workspace/ui/components/context-menu"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"

export type TaskAssignee = {
  userId: string
  name: string
  imageUrl?: string | null
}

function getInitials(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return "?"
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (
    (parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")
  ).toUpperCase()
}

export function AssigneeAvatar({
  assignee,
  size = 18,
  ringColorClass = "ring-background",
}: {
  assignee: TaskAssignee
  size?: number
  ringColorClass?: string
}) {
  const initials = getInitials(assignee.name)
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground ring-1 ${ringColorClass}`}
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.42) }}
      title={assignee.name}
    >
      {assignee.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={assignee.imageUrl}
          alt={assignee.name}
          className="size-full object-cover"
        />
      ) : (
        <span className="font-medium tracking-tight">{initials}</span>
      )}
    </span>
  )
}

export function AssigneeStack({
  assignees,
  size = 18,
  max = 3,
  ringColorClass,
}: {
  assignees: TaskAssignee[]
  size?: number
  max?: number
  ringColorClass?: string
}) {
  if (!assignees.length) return null
  const visible = assignees.slice(0, max)
  const overflow = assignees.length - visible.length
  return (
    <div className="flex items-center -space-x-1">
      {visible.map((a) => (
        <AssigneeAvatar
          key={a.userId}
          assignee={a}
          size={size}
          ringColorClass={ringColorClass}
        />
      ))}
      {overflow > 0 ? (
        <span
          className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ${ringColorClass ?? "ring-background"}`}
          style={{
            width: size,
            height: size,
            fontSize: Math.max(8, size * 0.42),
          }}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  )
}

export function AssigneePickerContent({
  workspaceId,
  assignees,
  onChange,
}: {
  workspaceId: Id<"workspaces"> | undefined
  assignees: TaskAssignee[]
  onChange: (next: TaskAssignee[]) => void
}) {
  const members = useQuery(
    api.workspaces.getAssignableMembers,
    workspaceId ? { workspaceId } : "skip"
  )
  const selectedIds = useMemo(
    () => new Set(assignees.map((a) => a.userId)),
    [assignees]
  )

  function toggle(member: TaskAssignee) {
    if (selectedIds.has(member.userId)) {
      onChange(assignees.filter((a) => a.userId !== member.userId))
    } else {
      onChange([
        ...assignees,
        {
          userId: member.userId,
          name: member.name,
          imageUrl: member.imageUrl ?? undefined,
        },
      ])
    }
  }

  return (
    <AssigneePickerList
      members={(members ?? []).map((m) => ({
        userId: m.userId,
        name: m.name,
        imageUrl: m.imageUrl ?? undefined,
      }))}
      selectedIds={selectedIds}
      onToggle={toggle}
    />
  )
}

function AssigneePickerList({
  members,
  selectedIds,
  onToggle,
}: {
  members: TaskAssignee[]
  selectedIds: Set<string>
  onToggle: (member: TaskAssignee) => void
}) {
  const [query, setQuery] = useState("")
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => m.name.toLowerCase().includes(q))
  }, [members, query])

  return (
    <div className="flex w-[220px] flex-col">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
        <MagnifyingGlass size={12} className="text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members..."
          className="w-full bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/50"
        />
      </div>
      <div className="max-h-[240px] overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
            No members
          </div>
        ) : (
          filtered.map((m) => {
            const checked = selectedIds.has(m.userId)
            return (
              <button
                key={m.userId}
                type="button"
                onClick={() => onToggle(m)}
                className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-[12px] hover:bg-accent"
              >
                <AssigneeAvatar assignee={m} size={20} />
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                {checked ? (
                  <Check size={12} weight="bold" className="text-primary" />
                ) : null}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

export function AssigneeContextSubmenu({
  workspaceId,
  assignees,
  onChange,
  disabled,
}: {
  workspaceId: Id<"workspaces"> | undefined
  assignees: TaskAssignee[]
  onChange: (next: TaskAssignee[]) => void
  disabled?: boolean
}) {
  const members = useQuery(
    api.workspaces.getAssignableMembers,
    workspaceId ? { workspaceId } : "skip"
  )
  const selectedIds = useMemo(
    () => new Set(assignees.map((a) => a.userId)),
    [assignees]
  )

  function toggle(userId: string, name: string, imageUrl: string | null) {
    if (selectedIds.has(userId)) {
      onChange(assignees.filter((a) => a.userId !== userId))
    } else {
      onChange([
        ...assignees,
        { userId, name, imageUrl: imageUrl ?? undefined },
      ])
    }
  }

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger disabled={disabled}>
        <Users size={14} />
        <span>Assignees</span>
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {(members ?? []).length === 0 ? (
          <div className="px-2 py-1.5 text-[12px] text-muted-foreground">
            No members
          </div>
        ) : (
          (members ?? []).map((m) => (
            <ContextMenuCheckboxItem
              key={m.userId}
              checked={selectedIds.has(m.userId)}
              onCheckedChange={() => toggle(m.userId, m.name, m.imageUrl)}
              closeOnClick={false}
              disabled={disabled}
            >
              <AssigneeAvatar
                assignee={{
                  userId: m.userId,
                  name: m.name,
                  imageUrl: m.imageUrl ?? undefined,
                }}
                size={16}
              />
              <span>{m.name}</span>
            </ContextMenuCheckboxItem>
          ))
        )}
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}
