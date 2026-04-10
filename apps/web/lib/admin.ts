type MetadataLike = { role?: unknown } | null | undefined

/**
 * Global admin check. Admins are assigned via Clerk's publicMetadata:
 *
 *     { "role": "admin" }
 *
 * Set this in the Clerk dashboard: Users → select user → Metadata → Public.
 * Works with both Clerk's client `useUser()` and server `currentUser()`.
 */
export function isAdminMetadata(metadata: MetadataLike): boolean {
  return metadata?.role === "admin"
}

export function isAdminUser(
  user: { publicMetadata?: MetadataLike } | null | undefined,
): boolean {
  if (!user) return false
  return isAdminMetadata(user.publicMetadata ?? null)
}
