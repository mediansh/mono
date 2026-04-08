import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { Doc } from "./_generated/dataModel"
import {
  getIdentityProfile,
  requireIdentity,
  requireWorkspaceAccess,
  requireWorkspaceAdminAccess,
} from "./permissions"
import { insertWorkspaceLog } from "./logs"
import {
  WORKSPACE_ROLE_RANK,
  type WorkspaceInviteRole,
  type WorkspaceRole,
} from "../lib/workspace-permissions"
import { normalizeWorkspaceAssignees } from "../lib/task-board"
import { internal } from "./_generated/api"

const workspaceInviteRoleValidator = v.union(
  v.literal("guest"),
  v.literal("member"),
  v.literal("admin")
)

function generatePrefix(name: string): string {
  const cleaned = name.trim().toUpperCase()
  const words = cleaned.split(/\s+/).filter(Boolean)

  if (words.length >= 3) {
    return words
      .slice(0, 3)
      .map((word) => word[0])
      .join("")
  }
  if (words.length === 2) {
    const twoChar = words.map((word) => word[0]).join("")
    if (twoChar.length >= 3) return twoChar.slice(0, 3)
    return (words[0]!.slice(0, 2) + words[1]![0]!).slice(0, 3)
  }

  const consonants = cleaned.replace(/[^A-Z]/g, "").replace(/[AEIOU]/g, "")
  if (consonants.length >= 3) return consonants.slice(0, 3)
  return cleaned.replace(/[^A-Z0-9]/g, "").slice(0, 3) || "TSK"
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function generateInviteToken() {
  return crypto.randomUUID().replace(/-/g, "")
}

function maskEmailAddress(email?: string) {
  if (!email) return null
  const [local, domain] = email.split("@")
  if (!local || !domain) return email
  return `${local.slice(0, 2)}${"*".repeat(Math.max(local.length - 2, 1))}@${domain}`
}

function getMemberDisplayName(member: {
  name?: string | null
  email?: string | null
  userId: string
}) {
  return member.name ?? member.email ?? member.userId
}

function sortMembers(members: Doc<"workspaceMembers">[]) {
  return [...members].sort((a, b) => {
    const roleDiff =
      WORKSPACE_ROLE_RANK[b.role as WorkspaceRole] -
      WORKSPACE_ROLE_RANK[a.role as WorkspaceRole]
    if (roleDiff !== 0) return roleDiff
    return (a.name ?? a.email ?? a.userId).localeCompare(
      b.name ?? b.email ?? b.userId
    )
  })
}

export const getUserWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect()

    const workspaces = await Promise.all(
      memberships.map(async (membership) => {
        const workspace = await ctx.db.get(membership.workspaceId)
        if (!workspace) return null
        const iconUrl = workspace.iconId
          ? await ctx.storage.getUrl(workspace.iconId)
          : null
        return { ...workspace, iconUrl, role: membership.role }
      })
    )

    return workspaces.filter(Boolean)
  },
})

export const getWorkspaceMembers = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireWorkspaceAccess(ctx, args.workspaceId)

    const [workspace, members, invites] = await Promise.all([
      ctx.db.get(args.workspaceId),
      ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect(),
      ctx.db
        .query("workspaceInvites")
        .withIndex("by_workspace_status", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("status", "pending")
        )
        .collect(),
    ])

    if (!workspace) {
      throw new Error("Workspace not found")
    }

    return {
      currentUserRole: membership.role,
      canManageMembers:
        membership.role === "admin" || membership.role === "owner",
      workspaceName: workspace.name,
      members: sortMembers(members).map((member) => ({
        _id: member._id,
        userId: member.userId,
        role: member.role,
        name: member.name ?? null,
        email: member.email ?? null,
        imageUrl: member.imageUrl ?? null,
      })),
      invites: invites
        .filter((invite) => invite.expiresAt > Date.now())
        .sort((a, b) => b._creationTime - a._creationTime)
        .map((invite) => ({
          _id: invite._id,
          inviteType: invite.inviteType,
          role: invite.role,
          invitedEmail: invite.invitedEmail ?? null,
          expiresAt: invite.expiresAt,
          createdAt: invite._creationTime,
        })),
    }
  },
})

export const syncMyProfile = mutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user_workspace", (q) =>
        q.eq("userId", identity.subject).eq("workspaceId", args.workspaceId)
      )
      .unique()

    if (!membership) return

    const profile = getIdentityProfile(identity)
    const needsUpdate =
      membership.name !== profile.name ||
      membership.email !== profile.email ||
      membership.imageUrl !== profile.imageUrl

    if (needsUpdate) {
      await ctx.db.patch(membership._id, profile)
    }
  },
})

export const getInviteByToken = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique()

    if (
      !invite ||
      invite.status !== "pending" ||
      invite.expiresAt <= Date.now()
    ) {
      return null
    }

    const workspace = await ctx.db.get(invite.workspaceId)
    if (!workspace) {
      return null
    }

    return {
      workspaceId: invite.workspaceId,
      workspaceName: workspace.name,
      role: invite.role,
      inviteType: invite.inviteType,
      invitedEmail: maskEmailAddress(invite.invitedEmail),
      expiresAt: invite.expiresAt,
    }
  },
})

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

export const updateWorkspaceLabels = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    labels: v.array(
      v.object({
        name: v.string(),
        color: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAdminAccess(ctx, args.workspaceId)

    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) throw new Error("Workspace not found")

    await ctx.db.patch(args.workspaceId, { labels: args.labels })
    await insertWorkspaceLog(ctx, {
      workspaceId: args.workspaceId,
      category: "members",
      type: "labels_saved",
      message:
        args.labels.length === 1
          ? "Labels updated: 1 label saved"
          : `Labels updated: ${args.labels.length} labels saved`,
      source: "manual",
    })
  },
})

export const updateWorkspaceAssignees = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    assignees: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        avatar: v.string(),
        email: v.optional(v.string()),
        linearUserId: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAdminAccess(ctx, args.workspaceId)

    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) throw new Error("Workspace not found")

    const normalizedAssignees = normalizeWorkspaceAssignees(args.assignees)
    const updatedAt = Date.now()

    await ctx.db.patch(args.workspaceId, {
      assignees: normalizedAssignees,
      assigneesUpdatedAt: updatedAt,
    })
    await insertWorkspaceLog(ctx, {
      workspaceId: args.workspaceId,
      category: "members",
      type: "assignees_saved",
      message:
        normalizedAssignees.length === 1
          ? "Assignees updated: 1 assignee saved"
          : `Assignees updated: ${normalizedAssignees.length} assignees saved`,
      source: "manual",
    })

    await ctx.scheduler.runAfter(0, internal.linear.syncWorkspaceAssigneesToLinear, {
      workspaceId: args.workspaceId,
    })
  },
})

export const updateWorkspace = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.optional(v.string()),
    iconId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAdminAccess(ctx, args.workspaceId)

    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) throw new Error("Workspace not found")

    const updates: Record<string, unknown> = {}
    if (args.name !== undefined) updates.name = args.name
    if (args.iconId !== undefined) {
      if (workspace.iconId) {
        await ctx.storage.delete(workspace.iconId)
      }
      updates.iconId = args.iconId
    }

    await ctx.db.patch(args.workspaceId, updates)
  },
})

export const deleteWorkspace = mutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireWorkspaceAccess(ctx, args.workspaceId)
    if (membership.role !== "owner") {
      throw new Error("Only the workspace owner can delete the workspace")
    }

    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) throw new Error("Workspace not found")

    const [
      members,
      invites,
      tasks,
      drafts,
      draftSuppressedTaskSources,
      discordIntegrations,
      linearIntegrations,
      linearTaskLinks,
      pairedCodes,
      xIntegrations,
      xPosts,
      xOAuthStates,
      xWebhookDeliveries,
      deletedTaskSources,
      workspaceLogs,
      workspaceLogMetrics,
    ] = await Promise.all([
      ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect(),
      ctx.db
        .query("workspaceInvites")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect(),
      ctx.db
        .query("tasks")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect(),
      ctx.db
        .query("drafts")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect(),
      ctx.db
        .query("draftSuppressedTaskSources")
        .withIndex("by_workspace_source", (q) =>
          q.eq("workspaceId", args.workspaceId)
        )
        .collect(),
      ctx.db
        .query("discordWorkspaceIntegrations")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect(),
      ctx.db
        .query("linearWorkspaceIntegrations")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect(),
      ctx.db
        .query("linearTaskLinks")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect(),
      ctx.db
        .query("discordPairingCodes")
        .withIndex("by_paired_workspace", (q) =>
          q.eq("pairedWorkspaceId", args.workspaceId)
        )
        .collect(),
      ctx.db
        .query("xWorkspaceIntegrations")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect(),
      ctx.db
        .query("xPosts")
        .withIndex("by_workspace_created_at", (q) =>
          q.eq("workspaceId", args.workspaceId)
        )
        .collect(),
      ctx.db
        .query("xOAuthStates")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect(),
      ctx.db
        .query("xWebhookDeliveries")
        .withIndex("by_workspace_received_at", (q) =>
          q.eq("workspaceId", args.workspaceId)
        )
        .collect(),
      ctx.db
        .query("deletedTaskSources")
        .withIndex("by_workspace_source", (q) =>
          q.eq("workspaceId", args.workspaceId)
        )
        .collect(),
      ctx.db
        .query("workspaceLogs")
        .withIndex("by_workspace_timestamp", (q) =>
          q.eq("workspaceId", args.workspaceId)
        )
        .collect(),
      ctx.db
        .query("workspaceLogMetrics")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect(),
    ])

    for (const task of tasks) {
      await ctx.db.delete(task._id)
    }

    for (const draft of drafts) {
      await ctx.db.delete(draft._id)
    }

    for (const suppression of draftSuppressedTaskSources) {
      await ctx.db.delete(suppression._id)
    }

    for (const invite of invites) {
      await ctx.db.delete(invite._id)
    }

    for (const integration of discordIntegrations) {
      await ctx.db.delete(integration._id)
    }

    for (const integration of linearIntegrations) {
      await ctx.db.delete(integration._id)
    }

    for (const link of linearTaskLinks) {
      await ctx.db.delete(link._id)
    }

    for (const pairingCode of pairedCodes) {
      await ctx.db.delete(pairingCode._id)
    }

    for (const post of xPosts) {
      await ctx.db.delete(post._id)
    }

    for (const oauthState of xOAuthStates) {
      await ctx.db.delete(oauthState._id)
    }

    for (const delivery of xWebhookDeliveries) {
      await ctx.db.delete(delivery._id)
    }

    for (const deletedTaskSource of deletedTaskSources) {
      await ctx.db.delete(deletedTaskSource._id)
    }

    for (const log of workspaceLogs) {
      await ctx.db.delete(log._id)
    }

    for (const metrics of workspaceLogMetrics) {
      await ctx.db.delete(metrics._id)
    }

    for (const integration of xIntegrations) {
      await ctx.db.delete(integration._id)
    }

    for (const member of members) {
      await ctx.db.delete(member._id)
    }

    if (workspace.iconId) {
      await ctx.storage.delete(workspace.iconId)
    }

    await ctx.db.delete(args.workspaceId)
  },
})

export const createWorkspace = mutation({
  args: {
    name: v.string(),
    iconId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const prefix = generatePrefix(args.name)
    const profile = getIdentityProfile(identity)

    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.name,
      prefix,
      iconId: args.iconId,
      ownerId: identity.subject,
      taskCounter: 0,
      assignees: [],
    })

    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: identity.subject,
      role: "owner",
      ...profile,
    })

    return workspaceId
  },
})

export const createInviteLink = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    role: workspaceInviteRoleValidator,
  },
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceAdminAccess(
      ctx,
      args.workspaceId
    )

    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    const inviteId = await ctx.db.insert("workspaceInvites", {
      workspaceId: args.workspaceId,
      createdByUserId: identity.subject,
      token: generateInviteToken(),
      inviteType: "link",
      role: args.role,
      status: "pending",
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14,
    })

    const invite = await ctx.db.get(inviteId)
    if (!invite) {
      throw new Error("Failed to create invite")
    }

    return {
      inviteId,
      token: invite.token,
      role: invite.role,
      expiresAt: invite.expiresAt,
      workspaceName: workspace.name,
    }
  },
})

export const createEmailInvite = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    email: v.string(),
    role: workspaceInviteRoleValidator,
  },
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceAdminAccess(
      ctx,
      args.workspaceId
    )
    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    const email = normalizeEmail(args.email)
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()

    if (
      members.some((member) => normalizeEmail(member.email ?? "") === email)
    ) {
      throw new Error("That user is already in the workspace")
    }

    const existingInvite = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "pending")
      )
      .collect()

    const duplicateInvite = existingInvite.find(
      (invite) =>
        invite.inviteType === "email" &&
        normalizeEmail(invite.invitedEmail ?? "") === email
    )

    if (duplicateInvite && duplicateInvite.expiresAt > Date.now()) {
      return {
        inviteId: duplicateInvite._id,
        token: duplicateInvite.token,
        role: duplicateInvite.role,
        invitedEmail: duplicateInvite.invitedEmail ?? email,
        expiresAt: duplicateInvite.expiresAt,
        workspaceName: workspace.name,
        reused: true,
      }
    }

    const inviteId = await ctx.db.insert("workspaceInvites", {
      workspaceId: args.workspaceId,
      createdByUserId: identity.subject,
      token: generateInviteToken(),
      inviteType: "email",
      role: args.role,
      invitedEmail: email,
      status: "pending",
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
    })

    const invite = await ctx.db.get(inviteId)
    if (!invite) {
      throw new Error("Failed to create invite")
    }

    return {
      inviteId,
      token: invite.token,
      role: invite.role,
      invitedEmail: invite.invitedEmail ?? email,
      expiresAt: invite.expiresAt,
      workspaceName: workspace.name,
      reused: false,
    }
  },
})

export const revokeInvite = mutation({
  args: {
    inviteId: v.id("workspaceInvites"),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId)
    if (!invite) {
      throw new Error("Invite not found")
    }

    await requireWorkspaceAdminAccess(ctx, invite.workspaceId)
    await ctx.db.patch(args.inviteId, { status: "revoked" })
  },
})

export const updateMemberRole = mutation({
  args: {
    memberId: v.id("workspaceMembers"),
    role: workspaceInviteRoleValidator,
  },
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId)
    if (!member) {
      throw new Error("Member not found")
    }

    const { membership } = await requireWorkspaceAdminAccess(
      ctx,
      member.workspaceId
    )
    if (member.role === "owner") {
      throw new Error("The workspace owner role cannot be changed")
    }
    if (member.userId === membership.userId) {
      throw new Error("You cannot change your own role")
    }

    await ctx.db.patch(args.memberId, { role: args.role })
  },
})

export const removeMember = mutation({
  args: {
    memberId: v.id("workspaceMembers"),
  },
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId)
    if (!member) {
      throw new Error("Member not found")
    }

    const { membership } = await requireWorkspaceAdminAccess(
      ctx,
      member.workspaceId
    )
    if (member.role === "owner") {
      throw new Error("The workspace owner cannot be removed")
    }
    if (member.userId === membership.userId) {
      throw new Error("You cannot remove yourself")
    }

    await ctx.db.delete(args.memberId)
    await insertWorkspaceLog(ctx, {
      workspaceId: member.workspaceId,
      category: "members",
      type: "member_removed",
      message: `${getMemberDisplayName(member)} removed from workspace`,
      source: "manual",
    })
  },
})

export const acceptInvite = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const invite = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique()

    if (
      !invite ||
      invite.status !== "pending" ||
      invite.expiresAt <= Date.now()
    ) {
      throw new Error("Invite is no longer valid")
    }

    if (invite.invitedEmail) {
      const identityEmail = normalizeEmail(identity.email ?? "")
      if (
        !identityEmail ||
        identityEmail !== normalizeEmail(invite.invitedEmail)
      ) {
        throw new Error("This invite was sent to a different email address")
      }
    }

    const workspace = await ctx.db.get(invite.workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    const existingMembership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user_workspace", (q) =>
        q.eq("userId", identity.subject).eq("workspaceId", invite.workspaceId)
      )
      .unique()

    const profile = getIdentityProfile(identity)

    if (existingMembership) {
      if (
        existingMembership.role !== "owner" &&
        WORKSPACE_ROLE_RANK[invite.role] >
          WORKSPACE_ROLE_RANK[existingMembership.role as WorkspaceRole]
      ) {
        await ctx.db.patch(existingMembership._id, {
          role: invite.role,
          ...profile,
        })
      }
    } else {
      await ctx.db.insert("workspaceMembers", {
        workspaceId: invite.workspaceId,
        userId: identity.subject,
        role: invite.role as WorkspaceInviteRole,
        ...profile,
      })
    }

    await ctx.db.patch(invite._id, {
      status: "accepted",
      acceptedAt: Date.now(),
      acceptedByUserId: identity.subject,
    })

    await insertWorkspaceLog(ctx, {
      workspaceId: invite.workspaceId,
      category: "members",
      type: "member_joined",
      message: `${profile.name ?? profile.email ?? identity.subject} joined as ${invite.role}`,
      source: "manual",
    })

    return {
      workspaceId: invite.workspaceId,
      workspaceName: workspace.name,
    }
  },
})
