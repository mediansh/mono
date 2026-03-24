"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  LinkSquare02Icon,
  Mail01Icon,
} from "@hugeicons/core-free-icons"
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
import { SettingsAccessState } from "@/components/settings-access-state"

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

function MembersSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl px-10 py-10">
      <div className="mb-8">
        <div className="h-5 w-24 rounded bg-muted/60" />
        <div className="mt-2 h-4 w-72 rounded bg-muted/40" />
      </div>

      {/* Invite card skeleton */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex gap-1 border-b border-border px-5 pt-4 pb-3">
          <div className="h-4 w-20 rounded bg-muted/50" />
          <div className="ml-4 h-4 w-24 rounded bg-muted/50" />
        </div>
        <div className="space-y-3 p-5">
          <div className="h-4 w-12 rounded bg-muted/40" />
          <div className="h-10 w-full rounded-lg bg-muted/30" />
          <div className="h-8 w-40 rounded-md bg-muted/40" />
        </div>
      </div>

      {/* Members skeleton */}
      <div className="mt-8">
        <div className="mb-3 h-4 w-28 rounded bg-muted/50" />
        <div className="rounded-lg border border-border bg-card">
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <div className="size-8 rounded-full bg-muted/50" />
                <div className="flex-1">
                  <div className="h-4 w-32 rounded bg-muted/50" />
                  <div className="mt-1.5 h-3 w-44 rounded bg-muted/30" />
                </div>
                <div className="h-6 w-16 rounded-full bg-muted/30" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MembersSettingsPage() {
  const { currentWorkspace } = useWorkspace()
  const workspaceData = useQuery(
    api.workspaces.getWorkspaceMembers,
    currentWorkspace ? { workspaceId: currentWorkspace._id } : "skip"
  )
  const syncMyProfile = useMutation(api.workspaces.syncMyProfile)
  const createInviteLink = useMutation(api.workspaces.createInviteLink)
  const createEmailInvite = useMutation(api.workspaces.createEmailInvite)
  const revokeInvite = useMutation(api.workspaces.revokeInvite)
  const updateMemberRole = useMutation(api.workspaces.updateMemberRole)
  const removeMember = useMutation(api.workspaces.removeMember)

  const [inviteMode, setInviteMode] = useState<"link" | "email">("link")
  const [linkRole, setLinkRole] = useState<WorkspaceInviteRole>("member")
  const [emailRole, setEmailRole] = useState<WorkspaceInviteRole>("guest")
  const [emailValue, setEmailValue] = useState("")
  const [creatingLink, setCreatingLink] = useState(false)
  const [sendingInvite, setSendingInvite] = useState(false)
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null)
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null)

  const hasSynced = useRef(false)

  // Sync the current user's profile data from Clerk on mount
  useEffect(() => {
    if (!currentWorkspace || hasSynced.current) return
    hasSynced.current = true
    syncMyProfile({ workspaceId: currentWorkspace._id }).catch(() => {})
  }, [currentWorkspace, syncMyProfile])

  if (!currentWorkspace) return null
  if (!hasWorkspaceAdminPermission(currentWorkspace.role)) {
    return (
      <div className="mx-auto w-full max-w-2xl px-10 py-10">
        <SettingsAccessState />
      </div>
    )
  }

  // Show skeleton while data is loading
  if (workspaceData === undefined) {
    return <MembersSkeleton />
  }

  const workspaceId = currentWorkspace._id
  const canManageMembers = workspaceData.canManageMembers
  const members = workspaceData.members
  const invites = workspaceData.invites

  async function handleCreateInviteLink() {
    setCreatingLink(true)
    try {
      const invite = await createInviteLink({ workspaceId, role: linkRole })
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
      const invite = await createEmailInvite({ workspaceId, email, role: emailRole })

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
    <div className="mx-auto w-full max-w-2xl px-10 py-10">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-base font-semibold">Members</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite teammates and manage who has access to this workspace.
        </p>
      </div>

      {/* Invite card */}
      <div className="rounded-lg border border-border bg-card">
        {/* Invite mode tabs */}
        <div className="flex items-center gap-1 border-b border-border px-5 pt-4 pb-0">
          <button
            type="button"
            onClick={() => setInviteMode("link")}
            className={`flex items-center gap-1.5 border-b-2 px-3 pb-3 text-sm font-medium transition-colors ${
              inviteMode === "link"
                ? "border-[#14120B] text-[#14120B]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <HugeiconsIcon icon={LinkSquare02Icon} size={14} strokeWidth={1.7} />
            Invite link
          </button>
          <button
            type="button"
            onClick={() => setInviteMode("email")}
            className={`flex items-center gap-1.5 border-b-2 px-3 pb-3 text-sm font-medium transition-colors ${
              inviteMode === "email"
                ? "border-[#14120B] text-[#14120B]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <HugeiconsIcon icon={Mail01Icon} size={14} strokeWidth={1.7} />
            Email invite
          </button>
        </div>

        <div className="p-5">
          {inviteMode === "link" ? (
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-2 block text-sm font-medium">Role</label>
                <select
                  value={linkRole}
                  onChange={(e) => setLinkRole(e.target.value as WorkspaceInviteRole)}
                  disabled={!canManageMembers || creatingLink}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {inviteRoleOptions.map((role) => (
                    <option key={role} value={role}>
                      {getRoleLabel(role)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={!canManageMembers || creatingLink}
                onClick={handleCreateInviteLink}
                className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-[#14120B] px-3.5 text-xs font-medium text-white transition-colors hover:bg-[#14120B]/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {creatingLink ? "Creating..." : "Create and copy link"}
              </button>
              <p className="text-xs text-muted-foreground">
                Anyone with the link can join as the selected role. Links expire in 14 days.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-2 block text-sm font-medium">Email address</label>
                <input
                  type="email"
                  value={emailValue}
                  onChange={(e) => setEmailValue(e.target.value)}
                  disabled={!canManageMembers || sendingInvite}
                  placeholder="teammate@company.com"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Role</label>
                <select
                  value={emailRole}
                  onChange={(e) => setEmailRole(e.target.value as WorkspaceInviteRole)}
                  disabled={!canManageMembers || sendingInvite}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {inviteRoleOptions.map((role) => (
                    <option key={role} value={role}>
                      {getRoleLabel(role)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={!canManageMembers || sendingInvite || !emailValue.trim()}
                onClick={handleSendEmailInvite}
                className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-[#14120B] px-3.5 text-xs font-medium text-white transition-colors hover:bg-[#14120B]/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sendingInvite ? "Sending..." : "Send invite"}
              </button>
              <p className="text-xs text-muted-foreground">
                Email invites expire in 7 days.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 text-sm font-medium">
            Pending invites
            <span className="ml-1.5 text-muted-foreground">({invites.length})</span>
          </h3>
          <div className="rounded-lg border border-border bg-card">
            <div className="divide-y divide-border">
              {invites.map((invite) => (
                <div
                  key={invite._id}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-md border border-border bg-muted/50">
                      <HugeiconsIcon
                        icon={invite.inviteType === "email" ? Mail01Icon : LinkSquare02Icon}
                        size={14}
                        strokeWidth={1.5}
                        className="text-muted-foreground"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {invite.invitedEmail ?? "Link invite"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Expires {formatExpiry(invite.expiresAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <RoleBadge role={invite.role} />
                    {canManageMembers && (
                      <button
                        type="button"
                        disabled={busyInviteId === invite._id}
                        onClick={() => handleRevokeInvite(invite._id)}
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="mt-8">
        <h3 className="mb-3 text-sm font-medium">
          Members
          <span className="ml-1.5 text-muted-foreground">({members.length})</span>
        </h3>
        <div className="rounded-lg border border-border bg-card">
          <div className="divide-y divide-border">
            {members.map((member) => (
              <div
                key={member._id}
                className="group flex items-center justify-between px-5 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/50">
                    {member.imageUrl ? (
                      <img
                        src={member.imageUrl}
                        alt={member.name ?? member.email ?? ""}
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">
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
                    {member.email && (
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    )}
                  </div>
                </div>

                {member.role !== "owner" && (
                  <div className="flex items-center gap-2">
                    <select
                      value={member.role}
                      disabled={!canManageMembers || busyMemberId === member._id}
                      onChange={(e) =>
                        handleRoleChange(member._id, e.target.value as WorkspaceInviteRole)
                      }
                      className="h-8 rounded-md border border-border bg-background px-2.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {inviteRoleOptions.map((role) => (
                        <option key={role} value={role}>
                          {getRoleLabel(role)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!canManageMembers || busyMemberId === member._id}
                      onClick={() => handleRemoveMember(member._id)}
                      className="flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
