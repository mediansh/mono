import { v } from "convex/values"
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  findWorkspaceMembership,
  getAuthUserId,
  getAuthUserIds,
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

function normalizeLabelName(label: string) {
  return label.trim().toLowerCase()
}

function dedupeLabelsByName(labels: { name: string; color: string }[]) {
  const deduped = new Map<string, { name: string; color: string }>()

  for (const label of labels) {
    const trimmedName = label.name.trim()
    if (!trimmedName) continue

    deduped.set(normalizeLabelName(trimmedName), {
      name: trimmedName,
      color: label.color,
    })
  }

  return Array.from(deduped.values())
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
      WORKSPACE_ROLE_RANK[b.role as WorkspaceRole] - WORKSPACE_ROLE_RANK[a.role as WorkspaceRole]
    if (roleDiff !== 0) return roleDiff
    return (a.name ?? a.email ?? a.userId).localeCompare(b.name ?? b.email ?? b.userId)
  })
}

export const getUserWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const membershipsByWorkspace = new Map<string, Doc<"workspaceMembers">>()
    for (const userId of getAuthUserIds(identity)) {
      const memberships = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(250)

      for (const membership of memberships) {
        if (!membershipsByWorkspace.has(membership.workspaceId)) {
          membershipsByWorkspace.set(membership.workspaceId, membership)
        }
      }
    }

    const workspaces = await Promise.all(
      Array.from(membershipsByWorkspace.values()).map(async (membership) => {
        const workspace = await ctx.db.get(membership.workspaceId)
        if (!workspace) return null
        const iconUrl = workspace.iconId ? await ctx.storage.getUrl(workspace.iconId) : null
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
      canManageMembers: membership.role === "admin" || membership.role === "owner",
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

export const getAssignableMembers = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId)

    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()

    return sortMembers(members).map((member) => ({
      userId: member.userId,
      name: member.name ?? member.email ?? "Member",
      imageUrl: member.imageUrl ?? null,
    }))
  },
})

export const getWorkspaceTaskGenerationContext = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId)

    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    return {
      workspaceName: workspace.name,
      availableLabels: (workspace.labels ?? []).map((label) => label.name),
    }
  },
})

export const getEmailInviteDeliveryContext = query({
  args: {
    workspaceId: v.id("workspaces"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAdminAccess(ctx, args.workspaceId)

    const invite = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique()

    if (!invite || invite.workspaceId !== args.workspaceId) {
      throw new Error("Invite not found")
    }

    if (invite.inviteType !== "email") {
      throw new Error("Invite is not an email invite")
    }

    if (invite.status !== "pending" || invite.expiresAt <= Date.now()) {
      throw new Error("Invite is no longer active")
    }

    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    if (!invite.invitedEmail) {
      throw new Error("Invite is missing an email address")
    }

    return {
      workspaceName: workspace.name,
      role: invite.role,
      invitedEmail: invite.invitedEmail,
      token: invite.token,
    }
  },
})

export const syncMyProfile = mutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const membership = await findWorkspaceMembership(ctx, args.workspaceId, identity)

    if (!membership) return

    const profile = getIdentityProfile(identity)
    const userId = getAuthUserId(identity)
    const needsUpdate =
      membership.userId !== userId ||
      membership.name !== profile.name ||
      membership.email !== profile.email ||
      membership.imageUrl !== profile.imageUrl

    if (needsUpdate) {
      await ctx.db.patch(membership._id, {
        userId,
        ...profile,
      })
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

    if (!invite || invite.status !== "pending" || invite.expiresAt <= Date.now()) {
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

    const nextLabels = dedupeLabelsByName(args.labels)
    const canonicalByNormalizedName = new Map(
      nextLabels.map((label) => [normalizeLabelName(label.name), label.name] as const)
    )

    const workspaceTasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()

    for (const task of workspaceTasks) {
      if (!task.labels || task.labels.length === 0) continue

      const nextTaskLabels: string[] = []
      const seen = new Set<string>()

      for (const label of task.labels) {
        const canonicalLabel = canonicalByNormalizedName.get(normalizeLabelName(label))
        if (!canonicalLabel) continue

        const key = normalizeLabelName(canonicalLabel)
        if (seen.has(key)) continue

        seen.add(key)
        nextTaskLabels.push(canonicalLabel)
      }

      const labelsChanged =
        nextTaskLabels.length !== task.labels.length ||
        nextTaskLabels.some((label, index) => label !== task.labels[index])

      if (!labelsChanged) continue

      await ctx.db.patch(task._id, {
        labels: nextTaskLabels,
        updatedAt: Date.now(),
      })
    }

    await ctx.db.patch(args.workspaceId, { labels: nextLabels })
    await insertWorkspaceLog(ctx, {
      workspaceId: args.workspaceId,
      category: "members",
      type: "labels_saved",
      message:
        nextLabels.length === 1
          ? "Labels updated: 1 label saved"
          : `Labels updated: ${nextLabels.length} labels saved`,
      source: "manual",
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

// Maximum number of documents to delete in a single batch within a Convex
// mutation. Convex caps each mutation at ~8k document writes / ~16k reads, so
// we stay well under that to allow headroom for the queries themselves.
const PURGE_BATCH_SIZE = 200

async function drainWorkspaceMemberships(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">
) {
  while (true) {
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .take(PURGE_BATCH_SIZE)

    for (const member of members) {
      await ctx.db.delete(member._id)
    }

    if (members.length < PURGE_BATCH_SIZE) {
      break
    }
  }
}

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

    // Step 1: remove every membership so the workspace immediately disappears
    // from getUserWorkspaces for everyone (including other members).
    await drainWorkspaceMemberships(ctx, args.workspaceId)

    // Step 2: delete the workspace document and its icon synchronously so the
    // workspace is gone the moment this mutation resolves, regardless of how
    // much related data is still being cleaned up in the background.
    if (workspace.iconId) {
      await ctx.storage.delete(workspace.iconId)
    }
    await ctx.db.delete(args.workspaceId)

    // Step 3: schedule a background purge of related rows (tasks, logs,
    // integrations, messages, etc.). The previous implementation tried to do
    // all of this in one transaction and silently failed once a workspace had
    // enough records to exceed Convex's per-mutation read/write limits.
    await ctx.scheduler.runAfter(0, internal.workspaces.purgeWorkspaceData, {
      workspaceId: args.workspaceId,
    })
  },
})

export const purgeWorkspaceData = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const workspaceId = args.workspaceId
    let budget = PURGE_BATCH_SIZE

    // Drains documents from `query` up to the current `budget`. Returns true
    // when the table is fully cleaned out within this batch (so we can move
    // on to the next table) and false when we've exhausted the budget on a
    // single table (so the caller should schedule another pass).
    async function drain(
      runQuery: () => {
        take: (n: number) => Promise<Array<{ _id: any }>>
      }
    ): Promise<boolean> {
      if (budget <= 0) return false
      const limit = budget
      const docs = await runQuery().take(limit)
      for (const doc of docs) {
        await ctx.db.delete(doc._id)
      }
      budget -= docs.length
      // We took fewer rows than the limit, so this table is empty.
      return docs.length < limit
    }

    async function drainTasksWithAttachments(): Promise<boolean> {
      if (budget <= 0) return false
      const limit = budget
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .take(limit)

      for (const task of tasks) {
        for (const attachment of task.attachments ?? []) {
          await ctx.storage.delete(attachment.storageId)
        }
        await ctx.db.delete(task._id)
      }

      budget -= tasks.length
      return tasks.length < limit
    }

    async function drainLinearIntegrationsWithDeliveries(): Promise<boolean> {
      if (budget <= 0) return false
      const integrationLimit = budget
      const integrations = await ctx.db
        .query("linearWorkspaceIntegrations")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .take(integrationLimit)

      for (const integration of integrations) {
        if (budget <= 0) return false

        const deliveryLimit = budget
        const deliveries = await ctx.db
          .query("linearWebhookDeliveries")
          .withIndex("by_integration", (q) =>
            q.eq("integrationId", integration._id)
          )
          .take(deliveryLimit)

        for (const delivery of deliveries) {
          await ctx.db.delete(delivery._id)
        }

        budget -= deliveries.length
        if (deliveries.length === deliveryLimit || budget <= 0) {
          return false
        }

        await ctx.db.delete(integration._id)
        budget -= 1
      }

      return integrations.length < integrationLimit
    }

    // Cleanup steps. Each closure builds the query lazily so it picks up the
    // latest `budget` value when invoked. Order matters only insofar as parent
    // rows should generally be removed after their children — we delete
    // workspaceMembers last so this mutation's auth model (which queries
    // workspaceMembers) keeps working if anything is rerun.
    const steps: Array<() => Promise<boolean>> = [
      () =>
        drain(() =>
          ctx.db
            .query("workspaceInvites")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      drainTasksWithAttachments,
      () =>
        drain(() =>
          ctx.db
            .query("workspaceLogs")
            .withIndex("by_workspace_timestamp", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      () =>
        drain(() =>
          ctx.db
            .query("workspaceLogMetrics")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      () =>
        drain(() =>
          ctx.db
            .query("deletedTaskSources")
            .withIndex("by_workspace_source", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      // Slack
      () =>
        drain(() =>
          ctx.db
            .query("slackPendingNotifications")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      () =>
        drain(() =>
          ctx.db
            .query("slackMessages")
            .withIndex("by_workspace_channel_created_at", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      () =>
        drain(() =>
          ctx.db
            .query("slackOAuthStates")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      () =>
        drain(() =>
          ctx.db
            .query("slackWorkspaceIntegrations")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      // Discord
      () =>
        drain(() =>
          ctx.db
            .query("discordPendingNotifications")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      () =>
        drain(() =>
          ctx.db
            .query("discordMessages")
            .withIndex("by_workspace_channel_created_at", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      () =>
        drain(() =>
          ctx.db
            .query("discordWorkspaceIntegrations")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      () =>
        drain(() =>
          ctx.db
            .query("discordPairingCodes")
            .withIndex("by_paired_workspace", (q) =>
              q.eq("pairedWorkspaceId", workspaceId)
            )
        ),
      // Linear
      () =>
        drain(() =>
          ctx.db
            .query("linearTaskLinks")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      drainLinearIntegrationsWithDeliveries,
      // GitHub
      () =>
        drain(() =>
          ctx.db
            .query("githubInstallStates")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      () =>
        drain(() =>
          ctx.db
            .query("githubWorkspaceIntegrations")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      () =>
        drain(() =>
          ctx.db
            .query("githubTaskLinks")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      () =>
        drain(() =>
          ctx.db
            .query("githubWebhookDeliveries")
            .withIndex("by_workspace_received_at", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      () =>
        drain(() =>
          ctx.db
            .query("githubTaskDevelopmentRefs")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      // X (Twitter)
      () =>
        drain(() =>
          ctx.db
            .query("xPosts")
            .withIndex("by_workspace_created_at", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      () =>
        drain(() =>
          ctx.db
            .query("xWebhookDeliveries")
            .withIndex("by_workspace_received_at", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      () =>
        drain(() =>
          ctx.db
            .query("xOAuthStates")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      () =>
        drain(() =>
          ctx.db
            .query("xWorkspaceIntegrations")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      // CLI
      () =>
        drain(() =>
          ctx.db
            .query("cliApiKeys")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
      // Memberships are normally cleared by the public mutation. Re-running
      // here keeps cleanup idempotent if this internal mutation is invoked
      // directly or retried after a partial failure.
      () =>
        drain(() =>
          ctx.db
            .query("workspaceMembers")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", workspaceId)
            )
        ),
    ]

    let needsContinuation = false
    for (const step of steps) {
      const tableDone = await step()
      if (!tableDone) {
        needsContinuation = true
        break
      }
    }

    if (needsContinuation) {
      await ctx.scheduler.runAfter(
        0,
        internal.workspaces.purgeWorkspaceData,
        { workspaceId }
      )
    }
  },
})

export const createWorkspace = mutation({
  args: {
    name: v.string(),
    iconId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const userId = getAuthUserId(identity)
    const prefix = generatePrefix(args.name)
    const profile = getIdentityProfile(identity)

    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.name,
      prefix,
      iconId: args.iconId,
      ownerId: userId,
      taskCounter: 0,
    })

    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
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
    const { identity } = await requireWorkspaceAdminAccess(ctx, args.workspaceId)
    const userId = getAuthUserId(identity)

    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    const inviteId = await ctx.db.insert("workspaceInvites", {
      workspaceId: args.workspaceId,
      createdByUserId: userId,
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
    const { identity } = await requireWorkspaceAdminAccess(ctx, args.workspaceId)
    const userId = getAuthUserId(identity)
    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    const email = normalizeEmail(args.email)
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()

    if (members.some((member) => normalizeEmail(member.email ?? "") === email)) {
      throw new Error("That user is already in the workspace")
    }

    const existingInvite = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "pending")
      )
      .collect()

    const duplicateInvite = existingInvite.find(
      (invite) => invite.inviteType === "email" && normalizeEmail(invite.invitedEmail ?? "") === email
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
      createdByUserId: userId,
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

    const { identity, membership } = await requireWorkspaceAdminAccess(ctx, member.workspaceId)
    if (member.role === "owner") {
      throw new Error("The workspace owner role cannot be changed")
    }
    if (
      member.userId === membership.userId ||
      getAuthUserIds(identity).includes(member.userId)
    ) {
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

    const { identity, membership } = await requireWorkspaceAdminAccess(ctx, member.workspaceId)
    if (member.role === "owner") {
      throw new Error("The workspace owner cannot be removed")
    }
    if (
      member.userId === membership.userId ||
      getAuthUserIds(identity).includes(member.userId)
    ) {
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
    const userId = getAuthUserId(identity)
    const invite = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique()

    if (!invite || invite.status !== "pending" || invite.expiresAt <= Date.now()) {
      throw new Error("Invite is no longer valid")
    }

    if (invite.invitedEmail) {
      const identityEmail = normalizeEmail(identity.email ?? "")
      if (!identityEmail || identityEmail !== normalizeEmail(invite.invitedEmail)) {
        throw new Error("This invite was sent to a different email address")
      }
    }

    const workspace = await ctx.db.get(invite.workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    const existingMembership = await findWorkspaceMembership(
      ctx,
      invite.workspaceId,
      identity
    )

    const profile = getIdentityProfile(identity)

    if (existingMembership) {
      if (
        existingMembership.role !== "owner" &&
        WORKSPACE_ROLE_RANK[invite.role] > WORKSPACE_ROLE_RANK[existingMembership.role as WorkspaceRole]
      ) {
        await ctx.db.patch(existingMembership._id, {
          userId,
          role: invite.role,
          ...profile,
        })
      }
    } else {
      await ctx.db.insert("workspaceMembers", {
        workspaceId: invite.workspaceId,
        userId,
        role: invite.role as WorkspaceInviteRole,
        ...profile,
      })
    }

    await ctx.db.patch(invite._id, {
      status: "accepted",
      acceptedAt: Date.now(),
      acceptedByUserId: userId,
    })

    await insertWorkspaceLog(ctx, {
      workspaceId: invite.workspaceId,
      category: "members",
      type: "member_joined",
      message: `${profile.name ?? profile.email ?? userId} joined as ${invite.role}`,
      source: "manual",
    })

    return {
      workspaceId: invite.workspaceId,
      workspaceName: workspace.name,
    }
  },
})
