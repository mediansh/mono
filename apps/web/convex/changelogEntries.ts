import { v } from "convex/values"
import { mutation, query, type MutationCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { requireAdmin } from "./admins"
import { getIdentityProfile } from "./permissions"

const statusValidator = v.union(v.literal("draft"), v.literal("published"))

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
}

async function ensureUniqueSlug(
  ctx: MutationCtx,
  base: string,
  excludeId?: Id<"changelogEntries">,
): Promise<string> {
  const slug = slugify(base) || "entry"
  let candidate = slug
  let suffix = 1
  while (true) {
    const existing = await ctx.db
      .query("changelogEntries")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .unique()
    if (!existing || existing._id === excludeId) return candidate
    suffix += 1
    candidate = `${slug}-${suffix}`
  }
}

export const list = query({
  args: {
    status: v.optional(statusValidator),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)

    if (args.status) {
      return await ctx.db
        .query("changelogEntries")
        .withIndex("by_status_created", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect()
    }

    return await ctx.db
      .query("changelogEntries")
      .withIndex("by_updated")
      .order("desc")
      .collect()
  },
})

export const getById = query({
  args: { id: v.id("changelogEntries") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    return await ctx.db.get(args.id)
  },
})

export const create = mutation({
  args: {
    title: v.string(),
    slug: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    content: v.string(),
    version: v.optional(v.string()),
    status: statusValidator,
  },
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx)
    const profile = getIdentityProfile(identity)

    const now = Date.now()
    const slug = await ensureUniqueSlug(ctx, args.slug || args.title)

    return await ctx.db.insert("changelogEntries", {
      slug,
      title: args.title,
      excerpt: args.excerpt,
      content: args.content,
      version: args.version,
      status: args.status,
      publishedAt: args.status === "published" ? now : undefined,
      authorId: identity.subject,
      authorName: profile.name,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const update = mutation({
  args: {
    id: v.id("changelogEntries"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    content: v.optional(v.string()),
    version: v.optional(v.string()),
    status: v.optional(statusValidator),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const entry = await ctx.db.get(args.id)
    if (!entry) throw new Error("Changelog entry not found")

    const patch: Partial<typeof entry> = { updatedAt: Date.now() }

    if (args.title !== undefined) patch.title = args.title
    if (args.excerpt !== undefined) patch.excerpt = args.excerpt
    if (args.content !== undefined) patch.content = args.content
    if (args.version !== undefined) patch.version = args.version

    if (args.slug !== undefined) {
      patch.slug = await ensureUniqueSlug(ctx, args.slug, args.id)
    }

    if (args.status !== undefined && args.status !== entry.status) {
      patch.status = args.status
      if (args.status === "published" && !entry.publishedAt) {
        patch.publishedAt = Date.now()
      }
    }

    await ctx.db.patch(args.id, patch)
  },
})

export const remove = mutation({
  args: { id: v.id("changelogEntries") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    await ctx.db.delete(args.id)
  },
})
