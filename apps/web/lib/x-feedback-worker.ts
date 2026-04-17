import type { Id } from "@/convex/_generated/dataModel"

/**
 * Legacy external worker implementation.
 * Primary X feedback processing now executes in Convex
 * (`xFeedback.processFeedbackWindow`).
 *
 * This legacy path is intentionally disabled to avoid depending on removed
 * client modules. Keep this export for rollback compatibility.
 */
export async function processXFeedbackInBackground(args: {
  integrationId: Id<"xWorkspaceIntegrations">
}) {
  throw new Error(
    `Legacy X feedback worker is disabled. Processing runs in Convex now. integrationId=${args.integrationId}`
  )
}
