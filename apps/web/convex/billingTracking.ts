import { v } from "convex/values"
import { internalAction } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import {
  safeTrackIntegrationEvent,
  safeTrackAiUsage,
} from "../lib/billing/autumn"
import type { TrackedAiModel } from "../lib/billing/config"
import type { WorkspaceQuotaStatus } from "./billing"

export const trackIntegrationEvent = internalAction({
  args: {
    workspaceId: v.string(),
    workspaceName: v.optional(v.string()),
    source: v.union(
      v.literal("discord"),
      v.literal("slack"),
      v.literal("github"),
      v.literal("linear"),
      v.literal("x")
    ),
    properties: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Skip tracking when overages are disabled and the workspace has run out
    // of events. The corresponding ingest path is also gated, so this is the
    // belt-and-braces guard preventing the meter from ticking past the cap.
    try {
      const quota = (await ctx.runAction(
        internal.billing.getWorkspaceQuotaStatusInternal,
        { workspaceId: args.workspaceId as Id<"workspaces"> }
      )) as WorkspaceQuotaStatus

      if (quota.eventsExhausted) {
        console.info(
          `[billing] Skipping integration event — events exhausted: source=${args.source} workspace=${args.workspaceId}`
        )
        return
      }
    } catch (error) {
      console.error(
        "[billing] Quota check failed in trackIntegrationEvent — allowing track",
        { workspaceId: args.workspaceId, source: args.source },
        error
      )
    }

    console.info(
      `[billing] Tracking integration event: source=${args.source} workspace=${args.workspaceId}`
    )
    await safeTrackIntegrationEvent({
      workspaceId: args.workspaceId,
      workspaceName: args.workspaceName,
      source: args.source,
      properties: args.properties,
    })
  },
})

export const trackAiUsage = internalAction({
  args: {
    workspaceId: v.string(),
    workspaceName: v.optional(v.string()),
    email: v.optional(v.string()),
    model: v.string(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    properties: v.optional(v.any()),
  },
  handler: async (_ctx, args) => {
    console.info(
      `[billing] Tracking AI usage: model=${args.model} input=${args.inputTokens ?? 0} output=${args.outputTokens ?? 0} workspace=${args.workspaceId}`
    )
    await safeTrackAiUsage({
      workspaceId: args.workspaceId,
      workspaceName: args.workspaceName,
      email: args.email,
      model: args.model as TrackedAiModel,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      properties: args.properties,
    })
  },
})
