"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAction, useQuery } from "convex/react"
import { motion, AnimatePresence } from "motion/react"
import { CheckCircle, LinkSimple, Plus, SpinnerGap, Trash } from "@phosphor-icons/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { AssigneeAvatar } from "@/components/assignee-avatar"
import { SettingsAccessState } from "@/components/settings-access-state"
import { useWorkspace } from "@/components/workspace-provider"
import { useWorkspaceOptimisticMutations } from "@/hooks/use-workspace-optimistic-mutations"
import {
  formatAssigneeRole,
  type AssigneeRole,
  buildTaskAssignee,
  normalizeWorkspaceAssignees,
} from "@/lib/task-board"
import { hasWorkspaceAdminPermission } from "@/lib/workspace-permissions"

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const },
  },
}

type EditableAssignee = {
  key: string
  id: string
  name: string
  email: string
  avatar: string
  role: AssigneeRole
  linearUserId?: string
}

const ASSIGNEE_ROLE_OPTIONS: AssigneeRole[] = [
  "owner",
  "admin",
  "member",
  "guest",
]

export default function AssigneesSettingsPage() {
  const { currentWorkspace } = useWorkspace()
  const router = useRouter()
  const { updateWorkspaceAssigneesOptimistic } = useWorkspaceOptimisticMutations()
  const baseId = useId()
  const [assignees, setAssignees] = useState<EditableAssignee[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [keyCounter, setKeyCounter] = useState(0)
  const [syncingLinear, setSyncingLinear] = useState(false)
  const autoSyncKeyRef = useRef<string | null>(null)

  const integrationState = useQuery(
    api.linear.getWorkspaceLinearIntegration,
    currentWorkspace ? { workspaceId: currentWorkspace._id } : "skip"
  )
  const refreshWorkspaceLinearAssignees = useAction(
    api.linear.refreshWorkspaceLinearAssignees
  )
  const linearIntegration = integrationState?.integration ?? null
  const isLinearLinked = Boolean(linearIntegration)

  useEffect(() => {
    if (!currentWorkspace) {
      return
    }

    setAssignees(
      (currentWorkspace.assignees ?? []).map((assignee, index) => ({
        key: `${baseId}-init-${index}`,
        id: assignee.id,
        name: assignee.name,
        email: assignee.email ?? "",
        avatar: assignee.avatar,
        role: assignee.role ?? "member",
        linearUserId: assignee.linearUserId,
      }))
    )
  }, [baseId, currentWorkspace])

  useEffect(() => {
    if (!currentWorkspace || !isLinearLinked) {
      autoSyncKeyRef.current = null
      return
    }

    const autoSyncKey = `${currentWorkspace._id}:${linearIntegration?.teamId ?? "linear"}`
    if (autoSyncKeyRef.current === autoSyncKey) {
      return
    }

    autoSyncKeyRef.current = autoSyncKey
    setSyncingLinear(true)

    void refreshWorkspaceLinearAssignees({ workspaceId: currentWorkspace._id })
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to sync assignees from Linear."
        )
      })
      .finally(() => {
        setSyncingLinear(false)
      })
  }, [
    currentWorkspace,
    isLinearLinked,
    linearIntegration?.teamId,
    refreshWorkspaceLinearAssignees,
  ])

  if (!currentWorkspace) return null
  if (!hasWorkspaceAdminPermission(currentWorkspace.role)) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-6">
        <SettingsAccessState />
      </div>
    )
  }

  function addAssignee() {
    const nextKey = keyCounter + 1
    setKeyCounter(nextKey)
    setAssignees((current) => [
      ...current,
      {
        key: `${baseId}-new-${nextKey}`,
        id: crypto.randomUUID(),
        name: "",
        email: "",
        avatar: "",
        role: "member",
      },
    ])
  }

  function updateAssignee(
    index: number,
    updates: Partial<EditableAssignee>
  ) {
    setAssignees((current) =>
      current.map((assignee, currentIndex) =>
        currentIndex === index ? { ...assignee, ...updates } : assignee
      )
    )
  }

  function removeAssignee(index: number) {
    setAssignees((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  async function handleSave() {
    const workspace = currentWorkspace
    if (!workspace) return

    setSaving(true)

    try {
      const cleaned = normalizeWorkspaceAssignees(
        assignees.map((assignee) => ({
          id: assignee.id,
          name: assignee.name,
          email: assignee.email || undefined,
          avatar: assignee.avatar,
          role: assignee.role,
          linearUserId: assignee.linearUserId,
        }))
      )

      await updateWorkspaceAssigneesOptimistic({
        workspaceId: workspace._id,
        assignees: cleaned,
        previousWorkspace: workspace,
      })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const hasInvalidEntry = assignees.some(
    (assignee) =>
      !assignee.name.trim() ||
      (isLinearLinked && !assignee.linearUserId && !assignee.email.trim())
  )

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      className="mx-auto w-full max-w-2xl px-6 py-6"
    >
      <motion.div
        variants={fadeUp}
        className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <h2 className="text-[14px] font-semibold">Assignees</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Manage the people you can assign to tasks in this workspace.
          </p>
        </div>
        {isLinearLinked ? (
          <div className="inline-flex h-9 items-center gap-2 rounded-[4px] border border-emerald-500/30 bg-emerald-500/10 px-3 text-[11px] font-medium text-emerald-400">
            {syncingLinear ? (
              <SpinnerGap size={13} className="animate-spin" />
            ) : (
              <CheckCircle size={13} weight="fill" />
            )}
            Linked
          </div>
        ) : (
          <button
            type="button"
            onClick={() => router.push("/app/integrations/linear")}
            className="inline-flex h-9 items-center gap-2 rounded-[4px] border border-border bg-card px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            <LinkSimple size={13} />
            Sync with Linear
          </button>
        )}
      </motion.div>

      <motion.div variants={fadeUp} className="rounded-[4px] bg-card ring-1 ring-border">
        <div className="p-5">
          <div className="mb-3 rounded-[4px] border border-border/70 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            {isLinearLinked
              ? `Linked to Linear${linearIntegration?.teamName ? ` (${linearIntegration.teamName})` : ""}. Existing Linear assignees stay synced automatically, and new assignees need an email so Median can create them in Linear.`
              : "Linear is not connected. Assignees saved here stay local to Median until you link the Linear integration."}
          </div>

          <div className="flex flex-col gap-2.5">
            <AnimatePresence initial={false}>
              {assignees.map((assignee, index) => (
                <motion.div
                  key={assignee.key}
                  exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                  transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                  className="group rounded-[4px] border border-border/80 bg-background/40 p-3"
                >
                  <div className="flex items-start gap-3">
                    <AssigneeAvatar
                      assignee={buildTaskAssignee(assignee)}
                      className="mt-0.5 size-9"
                      emptyClassName="mt-0.5 size-9"
                    />
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                      <input
                        type="text"
                        value={assignee.name}
                        onChange={(event) =>
                          updateAssignee(index, { name: event.target.value })
                        }
                        placeholder="Assignee name"
                        autoFocus={assignee.name === ""}
                        className="h-9 rounded-[4px] bg-background px-3 text-[13px] ring-1 ring-border outline-none transition-colors placeholder:text-muted-foreground focus:ring-foreground/30"
                      />
                      <input
                        type="email"
                        value={assignee.email}
                        onChange={(event) =>
                          updateAssignee(index, { email: event.target.value })
                        }
                        placeholder={
                          isLinearLinked && !assignee.linearUserId
                            ? "Email required for Linear sync"
                            : "Email"
                        }
                        readOnly={Boolean(isLinearLinked && assignee.linearUserId)}
                        className="h-9 rounded-[4px] bg-background px-3 text-[13px] ring-1 ring-border outline-none transition-colors placeholder:text-muted-foreground focus:ring-foreground/30 read-only:cursor-not-allowed read-only:opacity-60"
                      />
                      <select
                        value={assignee.role}
                        onChange={(event) =>
                          updateAssignee(index, {
                            role: event.target.value as AssigneeRole,
                          })
                        }
                        className="h-9 rounded-[4px] bg-background px-3 text-[13px] ring-1 ring-border outline-none transition-colors focus:ring-foreground/30"
                      >
                        {ASSIGNEE_ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {formatAssigneeRole(role)}
                          </option>
                        ))}
                      </select>
                      <input
                        type="url"
                        value={assignee.avatar}
                        onChange={(event) =>
                          updateAssignee(index, { avatar: event.target.value })
                        }
                        placeholder="Profile picture URL"
                        className="h-9 rounded-[4px] bg-background px-3 text-[13px] ring-1 ring-border outline-none transition-colors placeholder:text-muted-foreground focus:ring-foreground/30"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAssignee(index)}
                      className="flex size-8 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={addAssignee}
            className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-[4px] border border-dashed border-border text-[11px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <Plus size={13} />
            Add assignee
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3.5 py-2">
          <p className="text-[11px] text-muted-foreground">
            {assignees.length} assignee{assignees.length !== 1 ? "s" : ""} configured
          </p>
          <div className="flex items-center gap-2">
            {saved ? <span className="text-xs text-emerald-500">Saved</span> : null}
            <button
              type="button"
              disabled={saving || hasInvalidEntry}
              onClick={handleSave}
              className="flex h-8 items-center justify-center rounded-[4px] bg-primary px-3.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
