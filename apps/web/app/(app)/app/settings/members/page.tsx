"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  CheckmarkBadge01Icon,
  Delete02Icon,
  LinkSquare02Icon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons"
import { motion } from "motion/react"
import { toast } from "sonner"
import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"
import { RoleBadge } from "@/components/role-badge"
import {
  getRoleLabel,
  hasWorkspaceAdminPermission,
  type WorkspaceInviteRole,
} from "@/lib/workspace-permissions"

const inviteRoleOptions: WorkspaceInviteRole[] = ["guest", "member", "admin"]

function formatExpiry(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(timestamp)
}

function getInviteUrl(token: string) {
  if (typeof window === "undefined") return ""
  return `${window.location.origin}/invite/${token}`
}

export default function MembersSettingsPage() {
  const { currentWorkspace } = useWorkspace()
  const workspaceData = useQuery(
    api.workspaces.getWorkspaceMembers,
    currentWorkspace ? { workspaceId: currentWorkspace._id } : "skip"
  )
  const createInviteLink = useMutation(api.workspaces.createInviteLink)
  const createEmailInvite = useMutation(api.workspaces.createEmailInvite)
  const revokeInvite = useMutation(api.workspaces.revokeInvite)
  const updateMemberRole = useMutation(api.workspaces.updateMemberRole)
  const removeMember = useMutation(api.workspaces.removeMember)

  const [linkRole, setLinkRole] = useState<WorkspaceInviteRole>("member")
  const [emailRole, setEmailRole] = useState<WorkspaceInviteRole>("guest")
  const [emailValue, setEmailValue] = useState("")
  const [creatingLink, setCreatingLink] = useState(false)
  const [sendingInvite, setSendingInvite] = useState(false)
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null)
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null)

  const canManageMembers = workspaceData?.canManageMembers ?? false
  const currentUserRole = workspaceData?.currentUserRole ?? currentWorkspace?.role

  const permissionRows = useMemo(
    () => [
      { role: "guest", summary: "Can view tasks only" },
      { role: "member", summary: "Can create, update, move, and delete tasks" },
      { role: "admin", summary: "Can manage members and workspace settings" },
    ],
    []
  )

  if (!currentWorkspace) return null
  const workspaceId = currentWorkspace._id

  async function handleCreateInviteLink() {
    setCreatingLink(true)
    try {
      const invite = await createInviteLink({
        workspaceId,
        role: linkRole,
      })
      const inviteUrl = getInviteUrl(invite.token)
      await navigator.clipboard.writeText(inviteUrl)
      toast.success(`${getRoleLabel(linkRole)} invite link copied.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create invite link.")
    } finally {
      setCreatingLink(false)
    }
  }

  async function handleSendEmailInvite() {
    const email = emailValue.trim().toLowerCase()
    if (!email) return

    setSendingInvite(true)
    try {
      const invite = await createEmailInvite({
        workspaceId,
        email,
        role: emailRole,
      })

      const response = await fetch("/api/workspace-invites/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: invite.invitedEmail,
          role: invite.role,
          workspaceName: invite.workspaceName,
          inviteUrl: getInviteUrl(invite.token),
        }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? "Invite email failed to send")
      }

      setEmailValue("")
      toast.success(
        invite.reused ? "Existing email invite re-sent." : "Invite email sent successfully."
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send invite email.")
    } finally {
      setSendingInvite(false)
    }
  }

  async function handleRoleChange(memberId: Id<"workspaceMembers">, role: WorkspaceInviteRole) {
    setBusyMemberId(memberId)
    try {
      await updateMemberRole({ memberId, role })
      toast.success(`Role changed to ${getRoleLabel(role).toLowerCase()}.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update role.")
    } finally {
      setBusyMemberId(null)
    }
  }

  async function handleRemoveMember(memberId: Id<"workspaceMembers">) {
    setBusyMemberId(memberId)
    try {
      await removeMember({ memberId })
      toast.success("Member removed.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove member.")
    } finally {
      setBusyMemberId(null)
    }
  }

  async function handleRevokeInvite(inviteId: Id<"workspaceInvites">) {
    setBusyInviteId(inviteId)
    try {
      await revokeInvite({ inviteId })
      toast.success("Invite revoked.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revoke invite.")
    } finally {
      setBusyInviteId(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-10 py-10">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <h2 className="text-base font-semibold">Members</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Invite teammates, assign roles, and control who can change the workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RoleBadge role={currentUserRole ?? "guest"} />
          <span className="text-xs text-muted-foreground">
            {hasWorkspaceAdminPermission(currentUserRole)
              ? "You can manage members and settings."
              : "You can view members, but only admins can make changes."}
          </span>
        </div>
      </motion.div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-5">
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: 0.04, ease: "easeOut" }}
            className="rounded-2xl border border-border bg-card/90 shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold">Team access</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Roles apply immediately across tasks, settings, and invites.
                </p>
              </div>
              <div className="flex size-11 items-center justify-center rounded-2xl border border-border bg-muted/60">
                <HugeiconsIcon
                  icon={UserMultiple02Icon}
                  size={20}
                  strokeWidth={1.6}
                  className="text-muted-foreground"
                />
              </div>
            </div>

            <div className="space-y-3 px-5 py-5">
              {permissionRows.map((row, index) => (
                <motion.div
                  key={row.role}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.06 + index * 0.04, ease: "easeOut" }}
                  className="flex items-center justify-between rounded-2xl border border-border/80 bg-background/70 px-4 py-3"
                >
                  <div className="space-y-1">
                    <RoleBadge role={row.role} />
                    <p className="text-sm text-muted-foreground">{row.summary}</p>
                  </div>
                  <HugeiconsIcon
                    icon={CheckmarkBadge01Icon}
                    size={18}
                    strokeWidth={1.6}
                    className="text-[#0496FF]"
                  />
                </motion.div>
              ))}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: 0.08, ease: "easeOut" }}
            className="rounded-2xl border border-border bg-card/90 shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold">Invite people</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use a shareable link or email invite. Links expire in 14 days and email
                  invites expire in 7 days.
                </p>
              </div>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <div className="rounded-2xl border border-border/80 bg-background/70 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold">Invite by link</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Copy a reusable link for anyone joining as that role.
                    </p>
                  </div>
                  <HugeiconsIcon
                    icon={LinkSquare02Icon}
                    size={18}
                    strokeWidth={1.6}
                    className="text-muted-foreground"
                  />
                </div>

                <label className="mb-2 block text-xs font-medium text-muted-foreground">
                  Role
                </label>
                <select
                  value={linkRole}
                  onChange={(event) => setLinkRole(event.target.value as WorkspaceInviteRole)}
                  disabled={!canManageMembers || creatingLink}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {inviteRoleOptions.map((role) => (
                    <option key={role} value={role}>
                      {getRoleLabel(role)}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={!canManageMembers || creatingLink}
                  onClick={handleCreateInviteLink}
                  className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#0496FF] px-4 text-sm font-medium text-white transition-colors hover:bg-[#0496FF]/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />
                  {creatingLink ? "Creating..." : "Create and copy link"}
                </button>
              </div>

              <div className="rounded-2xl border border-border/80 bg-background/70 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold">Invite by email</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Sends a role-specific invite email through inbound.new.
                    </p>
                  </div>
                  <HugeiconsIcon
                    icon={UserMultiple02Icon}
                    size={18}
                    strokeWidth={1.6}
                    className="text-muted-foreground"
                  />
                </div>

                <label className="mb-2 block text-xs font-medium text-muted-foreground">
                  Email address
                </label>
                <input
                  type="email"
                  value={emailValue}
                  onChange={(event) => setEmailValue(event.target.value)}
                  disabled={!canManageMembers || sendingInvite}
                  placeholder="teammate@company.com"
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                />

                <label className="mb-2 mt-4 block text-xs font-medium text-muted-foreground">
                  Role
                </label>
                <select
                  value={emailRole}
                  onChange={(event) => setEmailRole(event.target.value as WorkspaceInviteRole)}
                  disabled={!canManageMembers || sendingInvite}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {inviteRoleOptions.map((role) => (
                    <option key={role} value={role}>
                      {getRoleLabel(role)}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={!canManageMembers || sendingInvite || !emailValue.trim()}
                  onClick={handleSendEmailInvite}
                  className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />
                  {sendingInvite ? "Sending..." : "Send invite"}
                </button>
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: 0.12, ease: "easeOut" }}
            className="rounded-2xl border border-border bg-card/90 shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold">Current members</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {workspaceData?.members.length ?? 0} people currently have access.
                </p>
              </div>
            </div>

            <div className="divide-y divide-border/80">
              {(workspaceData?.members ?? []).map((member, index) => (
                <motion.div
                  key={member._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: 0.04 + index * 0.02, ease: "easeOut" }}
                  className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted/60">
                      {member.imageUrl ? (
                        <img
                          src={member.imageUrl}
                          alt={member.name ?? member.email ?? "Member avatar"}
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="text-sm font-semibold text-muted-foreground">
                          {(member.name ?? member.email ?? "?").charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">
                          {member.name ?? member.email ?? "Unnamed member"}
                        </p>
                        <RoleBadge role={member.role} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {member.email ?? "No email available"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start md:self-center">
                    <select
                      value={member.role === "owner" ? "owner" : member.role}
                      disabled={!canManageMembers || member.role === "owner" || busyMemberId === member._id}
                      onChange={(event) =>
                        handleRoleChange(
                          member._id,
                          event.target.value as WorkspaceInviteRole
                        )
                      }
                      className="h-9 rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {member.role === "owner" ? (
                        <option value="owner">Owner</option>
                      ) : (
                        inviteRoleOptions.map((role) => (
                          <option key={role} value={role}>
                            {getRoleLabel(role)}
                          </option>
                        ))
                      )}
                    </select>
                    {member.role !== "owner" ? (
                      <button
                        type="button"
                        disabled={!canManageMembers || busyMemberId === member._id}
                        onClick={() => handleRemoveMember(member._id)}
                        className="flex h-9 items-center gap-1.5 rounded-xl border border-destructive/25 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.7} />
                        Remove
                      </button>
                    ) : null}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>
        </div>

        <motion.aside
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.16, ease: "easeOut" }}
          className="space-y-5"
        >
          <section className="rounded-2xl border border-border bg-card/90 shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-sm font-semibold">Pending invites</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Outstanding links and email invites waiting to be accepted.
              </p>
            </div>

            <div className="space-y-3 p-4">
              {(workspaceData?.invites ?? []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No pending invites.
                </div>
              ) : (
                workspaceData!.invites.map((invite) => (
                  <div
                    key={invite._id}
                    className="rounded-2xl border border-border/80 bg-background/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <RoleBadge role={invite.role} />
                          <span className="text-xs text-muted-foreground">
                            {invite.inviteType === "email" ? "Email invite" : "Link invite"}
                          </span>
                        </div>
                        <p className="text-sm font-medium">
                          {invite.invitedEmail ?? "Anyone with the link can join"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Expires {formatExpiry(invite.expiresAt)}
                        </p>
                      </div>
                      {canManageMembers ? (
                        <button
                          type="button"
                          disabled={busyInviteId === invite._id}
                          onClick={() => handleRevokeInvite(invite._id)}
                          className="flex h-8 items-center gap-1.5 rounded-lg border border-destructive/25 px-2.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={1.7} />
                          Revoke
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card/90 shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-sm font-semibold">Role guide</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Use guests for stakeholders, members for contributors, and admins for
                workspace operators.
              </p>
            </div>

            <div className="space-y-3 p-4">
              {permissionRows.map((row) => (
                <div
                  key={row.role}
                  className="rounded-2xl border border-border/80 bg-background/70 px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <RoleBadge role={row.role} />
                    <span className="text-xs text-muted-foreground">{row.summary}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </motion.aside>
      </div>
    </div>
  )
}
