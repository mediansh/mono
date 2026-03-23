import type { MutationCtx, QueryCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import {
  hasTaskWritePermission,
  hasWorkspaceAdminPermission,
  type WorkspaceRole,
} from "../lib/workspace-permissions"

type ConvexCtx = QueryCtx | MutationCtx

export async function requireIdentity(ctx: ConvexCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error("Not authenticated")
  }

  return identity
}

export async function getWorkspaceMembership(
  ctx: ConvexCtx,
  workspaceId: Id<"workspaces">
) {
  const identity = await requireIdentity(ctx)
  const membership = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_user_workspace", (q) =>
      q.eq("userId", identity.subject).eq("workspaceId", workspaceId)
    )
    .unique()

  if (!membership) {
    throw new Error("Not authorized")
  }

  return {
    identity,
    membership: membership as Doc<"workspaceMembers"> & { role: WorkspaceRole },
  }
}

export async function requireWorkspaceAccess(
  ctx: ConvexCtx,
  workspaceId: Id<"workspaces">
) {
  return await getWorkspaceMembership(ctx, workspaceId)
}

export async function requireTaskWriteAccess(
  ctx: ConvexCtx,
  workspaceId: Id<"workspaces">
) {
  const result = await getWorkspaceMembership(ctx, workspaceId)
  if (!hasTaskWritePermission(result.membership.role)) {
    throw new Error("Task editing is only available to members and admins")
  }

  return result
}

export async function requireWorkspaceAdminAccess(
  ctx: ConvexCtx,
  workspaceId: Id<"workspaces">
) {
  const result = await getWorkspaceMembership(ctx, workspaceId)
  if (!hasWorkspaceAdminPermission(result.membership.role)) {
    throw new Error("Only admins can manage workspace settings")
  }

  return result
}

export function getIdentityProfile(identity: Awaited<ReturnType<typeof requireIdentity>>) {
  return {
    name: identity.name ?? identity.nickname ?? identity.preferredUsername ?? undefined,
    email: identity.email ?? undefined,
    imageUrl: identity.pictureUrl ?? undefined,
  }
}
