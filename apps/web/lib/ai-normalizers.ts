// Tolerant pre-zod normalizer for the production feedback extractor.
// Models drift around the canonical {actions: [...]} envelope — bare
// arrays, bare action objects, alternate top-level keys — so we coerce
// here before validating. Production code and the admin benchmark both
// run inputs through this to keep their judgments aligned.

import type { z } from "zod"
import type {
  extractedFeedbackActionSchema,
  extractedFeedbackTasksSchema,
} from "./ai-schemas"

export function normalizeExtractedFeedbackPayload(
  rawPayload: unknown
): z.infer<typeof extractedFeedbackTasksSchema> {
  if (Array.isArray(rawPayload)) {
    return {
      actions: rawPayload as z.infer<
        typeof extractedFeedbackTasksSchema
      >["actions"],
    }
  }

  if (
    rawPayload &&
    typeof rawPayload === "object" &&
    "action" in rawPayload &&
    typeof (rawPayload as { action?: unknown }).action === "string"
  ) {
    return {
      actions: [rawPayload as z.infer<typeof extractedFeedbackActionSchema>],
    }
  }

  if (rawPayload && typeof rawPayload === "object") {
    const payload = rawPayload as Record<string, unknown>
    const fallbackActions =
      payload.actions ??
      payload.actionItems ??
      payload.items ??
      payload.tasks ??
      payload.operations

    if (Array.isArray(fallbackActions)) {
      return {
        actions: fallbackActions as z.infer<
          typeof extractedFeedbackTasksSchema
        >["actions"],
      }
    }

    if (
      fallbackActions &&
      typeof fallbackActions === "object" &&
      "action" in fallbackActions
    ) {
      return {
        actions: [
          fallbackActions as z.infer<typeof extractedFeedbackActionSchema>,
        ],
      }
    }
  }

  return rawPayload as z.infer<typeof extractedFeedbackTasksSchema>
}
