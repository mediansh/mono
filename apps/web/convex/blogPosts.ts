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
  excludeId?: Id<"blogPosts">,
): Promise<string> {
  const slug = slugify(base) || "post"
  let candidate = slug
  let suffix = 1
  while (true) {
    const existing = await ctx.db
      .query("blogPosts")
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
        .query("blogPosts")
        .withIndex("by_status_created", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect()
    }

    return await ctx.db.query("blogPosts").withIndex("by_updated").order("desc").collect()
  },
})

export const getById = query({
  args: { id: v.id("blogPosts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    return await ctx.db.get(args.id)
  },
})

export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    const posts = await ctx.db
      .query("blogPosts")
      .withIndex("by_status_created", (q) => q.eq("status", "published"))
      .order("desc")
      .collect()
    return posts.map((post) => ({
      _id: post._id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      coverImageUrl: post.coverImageUrl,
      publishedAt: post.publishedAt ?? post.createdAt,
      authorName: post.authorName,
    }))
  },
})

export const getPublishedBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const post = await ctx.db
      .query("blogPosts")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique()
    if (!post || post.status !== "published") return null
    return {
      _id: post._id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      coverImageUrl: post.coverImageUrl,
      publishedAt: post.publishedAt ?? post.createdAt,
      authorName: post.authorName,
    }
  },
})

export const create = mutation({
  args: {
    title: v.string(),
    slug: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    content: v.string(),
    coverImageUrl: v.optional(v.string()),
    status: statusValidator,
  },
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx)
    const profile = getIdentityProfile(identity)

    const now = Date.now()
    const slug = await ensureUniqueSlug(ctx, args.slug || args.title)

    return await ctx.db.insert("blogPosts", {
      slug,
      title: args.title,
      excerpt: args.excerpt,
      content: args.content,
      coverImageUrl: args.coverImageUrl,
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
    id: v.id("blogPosts"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    content: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
    status: v.optional(statusValidator),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const post = await ctx.db.get(args.id)
    if (!post) throw new Error("Post not found")

    const patch: Partial<typeof post> = { updatedAt: Date.now() }

    if (args.title !== undefined) patch.title = args.title
    if (args.excerpt !== undefined) patch.excerpt = args.excerpt
    if (args.content !== undefined) patch.content = args.content
    if (args.coverImageUrl !== undefined) patch.coverImageUrl = args.coverImageUrl

    if (args.slug !== undefined) {
      patch.slug = await ensureUniqueSlug(ctx, args.slug, args.id)
    }

    if (args.status !== undefined && args.status !== post.status) {
      patch.status = args.status
      if (args.status === "published" && !post.publishedAt) {
        patch.publishedAt = Date.now()
      }
    }

    await ctx.db.patch(args.id, patch)
  },
})

export const remove = mutation({
  args: { id: v.id("blogPosts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    await ctx.db.delete(args.id)
  },
})
