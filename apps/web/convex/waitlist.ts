import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const join = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim()

    const existing = await ctx.db
      .query("waitlistEntries")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first()

    if (existing) {
      return { alreadyJoined: true }
    }

    await ctx.db.insert("waitlistEntries", {
      email,
      joinedAt: Date.now(),
    })

    return { alreadyJoined: false }
  },
})

export const getCount = query({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db.query("waitlistEntries").collect()
    return entries.length
  },
})
