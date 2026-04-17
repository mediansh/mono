"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import type { OptimisticLocalStore } from "convex/browser"
import { useAction, useMutation, useQuery } from "convex/react"
import { Trash, Link as LinkIcon, Envelope } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { toast } from "sonner"
import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/convex/_generated/api"
import { useWorkspace } from "@/components/workspace-provider"
import { updateOptimisticQuery } from "@/lib/convex-optimistic"
import { RoleBadge } from "@/components/role-badge"
import {
  getRoleLabel,
  hasWorkspaceAdminPermission,
  type WorkspaceInviteRole,
} from "@/lib/workspace-permissions"
import { SettingsAccessState } from "@/components/settings-access-state"
import {
  trackInviteLinkCreated,
  trackInviteEmailSent,
  trackMemberRoleChanged,
  trackMemberRemoved,
  trackInviteRevoked,
} from "@/lib/analytics"

const inviteRoleOptions: WorkspaceInviteRole[] = ["guest", "member", "admin"]

type WorkspaceMembersData = {
  currentUserRole: WorkspaceInviteRole | "owner"
  canManageMembers: boolean
  workspaceName: string
  members: Array<{
    _id: Id<"workspaceMembers">
    userId: string
    role: WorkspaceInviteRole | "owner"
    name: string | null
    email: string | null
    imageUrl: string | null
  }>
  invites: Array<{
    _id: Id<"workspaceInvites">
    inviteType: "link" | "email"
    role: WorkspaceInviteRole
    invitedEmail: string | null
    expiresAt: number
    createdAt: number
  }>
}

function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const } },
}

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
    <div className="mx-auto w-full max-w-lg px-6 py-6">
      <div className="mb-4 h-8 w-28 rounded-[4px] bg-muted/40" />
      <div className="flex flex-col gap-2">
        <div className="h-10 rounded-[4px] bg-muted/30" />
        <div className="h-24 rounded-[4px] bg-muted/20" />
        <div className="h-16 rounded-[4px] bg-muted/20" />
      </div>
    </div>
  )
}

function updateWorkspaceMembersQueries(
  localStore: OptimisticLocalStore,
  updater: (current: WorkspaceMembersData) => WorkspaceMembersData
) {
  for (const query of localStore.getAllQueries(api.workspaces.getWorkspaceMembers)) {
    if (query.value === undefined) {
      continue
    }

    localStore.setQuery(
      api.workspaces.getWorkspaceMembers,
      query.args,
      updater(query.value)
    )
  }
}

export default function MembersSettingsPage() {
  const { currentWorkspace } = useWorkspace()
  const workspaceData = useQuery(
    api.workspaces.getWorkspaceMembers,
    currentWorkspace ? { workspaceId: currentWorkspace._id } : "skip"
  )
  const syncMyProfile = useMutation(api.workspaces.syncMyProfile)
  const createInviteLink = useMutation(
    api.workspaces.createInviteLink
  ).withOptimisticUpdate((localStore, args) => {
    updateOptimisticQuery(
      localStore,
      api.workspaces.getWorkspaceMembers,
      { workspaceId: args.workspaceId },
      (current) => ({
        ...current,
        invites: [
          {
            _id: `optimistic-link-invite-${crypto.randomUUID()}` as Id<"workspaceInvites">,
            inviteType: "link" as const,
            role: args.role,
            invitedEmail: null,
            expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14,
            createdAt: Date.now(),
          },
          ...current.invites,
        ],
      })
    )
  })
  const createEmailInvite = useMutation(
    api.workspaces.createEmailInvite
  ).withOptimisticUpdate((localStore, args) => {
    updateOptimisticQuery(
      localStore,
      api.workspaces.getWorkspaceMembers,
      { workspaceId: args.workspaceId },
      (current) => ({
        ...current,
        invites: [
          {
            _id: `optimistic-email-invite-${crypto.randomUUID()}` as Id<"workspaceInvites">,
            inviteType: "email" as const,
            role: args.role,
            invitedEmail: args.email.trim().toLowerCase(),
            expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
            createdAt: Date.now(),
          },
          ...current.invites,
        ],
      })
    )
  })
  const sendInviteEmail = useAction(
    api.workspaceInviteEmails.sendInviteEmail
  )
  const revokeInvite = useMutation(api.workspaces.revokeInvite).withOptimisticUpdate(
    (localStore, args) => {
      updateWorkspaceMembersQueries(
        localStore,
        (current) => ({
          ...current,
          invites: current.invites.filter((invite) => invite._id !== args.inviteId),
        })
      )
    }
  )
  const updateMemberRole = useMutation(
    api.workspaces.updateMemberRole
  ).withOptimisticUpdate((localStore, args) => {
    updateWorkspaceMembersQueries(
      localStore,
      (current) => ({
        ...current,
        members: current.members.map((member) =>
          member._id === args.memberId ? { ...member, role: args.role } : member
        ),
      })
    )
  })
  const removeMember = useMutation(api.workspaces.removeMember).withOptimisticUpdate(
    (localStore, args) => {
      updateWorkspaceMembersQueries(
        localStore,
        (current) => ({
          ...current,
          members: current.members.filter((member) => member._id !== args.memberId),
        })
      )
    }
  )

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
      <div className="mx-auto w-full max-w-lg px-6 py-6">
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
      trackInviteLinkCreated({ role: linkRole })
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

      const result = await sendInviteEmail({
        workspaceId,
        inviteToken: invite.token,
      })

      if (!result.ok) {
        throw new Error(result.error ?? "Invite email failed to send")
      }

      setEmailValue("")
      trackInviteEmailSent({ role: emailRole })
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
      trackMemberRoleChanged({ newRole: role })
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
      trackMemberRemoved()
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
      trackInviteRevoked()
      toast.success("Invite revoked.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revoke invite.")
    } finally {
      setBusyInviteId(null)
    }
  }

  return (
    <Stagger className="mx-auto w-full max-w-lg px-6 py-6">
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-4">
        <h2 className="text-[14px] font-semibold">Members</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Invite teammates and manage who has access to this workspace.
        </p>
      </motion.div>

      {/* Invite card */}
      <motion.div variants={fadeUp} className="rounded-[4px] ring-1 ring-border bg-card">
        {/* Invite mode tabs */}
        <div className="flex items-center gap-1 border-b border-border px-3.5 pt-4 pb-0">
          <button
            type="button"
            onClick={() => setInviteMode("link")}
            className={`flex items-center gap-1.5 border-b-2 px-2.5 pb-2.5 text-[13px] font-medium transition-colors ${
              inviteMode === "link"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <LinkIcon size={14} />
            Invite link
          </button>
          <button
            type="button"
            onClick={() => setInviteMode("email")}
            className={`flex items-center gap-1.5 border-b-2 px-2.5 pb-2.5 text-[13px] font-medium transition-colors ${
              inviteMode === "email"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Envelope size={14} />
            Email invite
          </button>
        </div>

        <div className="p-5">
          {inviteMode === "link" ? (
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-2 block text-[13px] font-medium">Role</label>
                <select
                  value={linkRole}
                  onChange={(e) => setLinkRole(e.target.value as WorkspaceInviteRole)}
                  disabled={!canManageMembers || creatingLink}
                  className="h-8 w-full rounded-[4px] ring-1 ring-border bg-background pl-3 pr-7 text-[13px] outline-none transition-colors focus:ring-foreground/30 disabled:cursor-not-allowed disabled:opacity-60"
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
                className="flex h-8 items-center justify-center gap-1.5 rounded-[4px] bg-primary px-3.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {creatingLink ? "Creating..." : "Create and copy link"}
              </button>
              <p className="text-[11px] text-muted-foreground">
                Anyone with the link can join as the selected role. Links expire in 14 days.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-2 block text-[13px] font-medium">Email address</label>
                <input
                  type="email"
                  value={emailValue}
                  onChange={(e) => setEmailValue(e.target.value)}
                  disabled={!canManageMembers || sendingInvite}
                  placeholder="teammate@company.com"
                  className="h-8 w-full rounded-[4px] ring-1 ring-border bg-background px-3 text-[13px] outline-none transition-colors placeholder:text-muted-foreground focus:ring-foreground/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
              <div>
                <label className="mb-2 block text-[13px] font-medium">Role</label>
                <select
                  value={emailRole}
                  onChange={(e) => setEmailRole(e.target.value as WorkspaceInviteRole)}
                  disabled={!canManageMembers || sendingInvite}
                  className="h-8 w-full rounded-[4px] ring-1 ring-border bg-background pl-3 pr-7 text-[13px] outline-none transition-colors focus:ring-foreground/30 disabled:cursor-not-allowed disabled:opacity-60"
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
                className="flex h-8 items-center justify-center gap-1.5 rounded-[4px] bg-primary px-3.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sendingInvite ? "Sending..." : "Send invite"}
              </button>
              <p className="text-[11px] text-muted-foreground">
                Email invites expire in 7 days.
              </p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <motion.div variants={fadeUp} className="mt-4">
          <h3 className="mb-3 text-[13px] font-medium">
            Pending invites
            <span className="ml-1.5 text-muted-foreground">({invites.length})</span>
          </h3>
          <div className="rounded-[4px] ring-1 ring-border bg-card">
            <div className="divide-y divide-border">
              {invites.map((invite) => (
                <div
                  key={invite._id}
                  className="flex flex-col gap-2 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-[4px] ring-1 ring-border bg-muted/50">
                      {invite.inviteType === "email" ? (
                        <Envelope size={14} className="text-muted-foreground" />
                      ) : (
                        <LinkIcon size={14} className="text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="text-[13px] font-medium">
                        {invite.invitedEmail ?? "Link invite"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
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
                        className="flex size-8 items-center justify-center rounded-[4px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Members list */}
      <motion.div variants={fadeUp} className="mt-4">
        <h3 className="mb-3 text-[13px] font-medium">
          Members
          <span className="ml-1.5 text-muted-foreground">({members.length})</span>
        </h3>
        <div className="rounded-[4px] ring-1 ring-border bg-card">
          <div className="divide-y divide-border">
            {members.map((member) => (
              <div
                key={member._id}
                className="group flex flex-col gap-2 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center overflow-hidden rounded-[4px] ring-1 ring-border bg-muted/50">
                    {member.imageUrl ? (
                      <img
                        src={member.imageUrl}
                        alt={member.name ?? member.email ?? ""}
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {(member.name ?? member.email ?? "?").charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-medium">
                        {member.name ?? member.email ?? "Unnamed member"}
                      </p>
                      <RoleBadge role={member.role} />
                    </div>
                    {member.email && (
                      <p className="text-[11px] text-muted-foreground">{member.email}</p>
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
                      className="h-8 rounded-[4px] ring-1 ring-border bg-background pl-2.5 pr-7 text-[13px] outline-none transition-colors focus:ring-foreground/30 disabled:cursor-not-allowed disabled:opacity-60"
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
                      className="flex size-8 items-center justify-center rounded-[4px] text-muted-foreground opacity-100 transition-all hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </Stagger>
  )
}
