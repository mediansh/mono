import { v } from "convex/values"
import { internalAction } from "./_generated/server"
import {
  safeTrackIntegrationEvent,
  safeTrackAiUsage,
} from "../lib/billing/autumn"
import type { TrackedAiModel } from "../lib/billing/config"

export const trackIntegrationEvent = internalAction({
  args: {
    workspaceId: v.string(),
    workspaceName: v.optional(v.string()),
    source: v.union(
      v.literal("discord"),
      v.literal("github"),
      v.literal("linear"),
      v.literal("x")
    ),
    properties: v.optional(v.any()),
  },
  handler: async (_ctx, args) => {
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
