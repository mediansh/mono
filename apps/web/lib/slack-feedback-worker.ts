import type { Id } from "@/convex/_generated/dataModel"

/**
 * Legacy external worker implementation.
 * Primary Slack feedback processing now executes in Convex
 * (`slackFeedback.processFeedbackWindow`).
 *
 * This legacy path is intentionally disabled to avoid depending on removed
 * client modules. Keep this export for rollback compatibility.
 */
export async function processSlackFeedbackInBackground(args: {
  integrationId: Id<"slackWorkspaceIntegrations">
}) {
  throw new Error(
    `Legacy Slack feedback worker is disabled. Processing runs in Convex now. integrationId=${args.integrationId}`
  )
}
