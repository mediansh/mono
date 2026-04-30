import { v } from "convex/values"
import { internalMutation, internalQuery } from "./_generated/server"

export const getLastDeployment = internalQuery({
  args: { repoFullName: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("deployments")
      .withIndex("by_repo_and_deployed", (q) =>
        q.eq("repoFullName", args.repoFullName)
      )
      .order("desc")
      .first()
  },
})

export const getDeploymentCountForDate = internalQuery({
  args: { repoFullName: v.string(), datePrefix: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("deployments")
      .withIndex("by_repo_and_deployed", (q) =>
        q.eq("repoFullName", args.repoFullName)
      )
      .order("desc")
      .take(50)
    return all.filter((d) => d.version.startsWith(args.datePrefix)).length
  },
})

export const recordDeployment = internalMutation({
  args: {
    sha: v.string(),
    version: v.string(),
    repoFullName: v.string(),
    deployedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("deployments", args)
  },
})
