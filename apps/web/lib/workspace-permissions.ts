export const WORKSPACE_ROLES = ["guest", "member", "admin", "owner"] as const

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]
export type WorkspaceInviteRole = Exclude<WorkspaceRole, "owner">

export const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  guest: 0,
  member: 1,
  admin: 2,
  owner: 3,
}

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return WORKSPACE_ROLES.includes(value as WorkspaceRole)
}

export function hasTaskWritePermission(role: string | undefined | null) {
  if (!isWorkspaceRole(role ?? "")) return false
  const normalizedRole = role as WorkspaceRole
  return WORKSPACE_ROLE_RANK[normalizedRole] >= WORKSPACE_ROLE_RANK.member
}

export function hasWorkspaceAdminPermission(role: string | undefined | null) {
  if (!isWorkspaceRole(role ?? "")) return false
  const normalizedRole = role as WorkspaceRole
  return WORKSPACE_ROLE_RANK[normalizedRole] >= WORKSPACE_ROLE_RANK.admin
}

export function canManageRole(targetRole: string | undefined | null) {
  return targetRole !== "owner"
}

export function getRoleLabel(role: string | undefined | null) {
  switch (role) {
    case "guest":
      return "Guest"
    case "member":
      return "Member"
    case "admin":
      return "Admin"
    case "owner":
      return "Owner"
    default:
      return "Unknown"
  }
}
