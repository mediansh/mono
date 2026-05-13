import type { MutationCtx, QueryCtx } from "./_generated/server"

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

export async function requireApiKey(
  ctx: QueryCtx | MutationCtx,
  apiKey: string
) {
  const hash = await sha256(apiKey)
  const keyRecord = await ctx.db
    .query("cliApiKeys")
    .withIndex("by_key_hash", (q) => q.eq("keyHash", hash))
    .unique()

  if (!keyRecord || keyRecord.revokedAt) {
    throw new Error("Invalid or revoked API key")
  }

  // Fail closed when the workspace this key was issued for no longer
  // exists. Workspace deletion schedules an async purge of CLI API keys,
  // so without this check a key can remain valid against orphaned data
  // until the cleanup runs (or longer if cleanup fails).
  const workspace = await ctx.db.get(keyRecord.workspaceId)
  if (!workspace) {
    throw new Error("Invalid or revoked API key")
  }

  return keyRecord
}
