// Shared Zod schemas for the three production LLM call sites.
// Production code and the admin benchmark suite both validate against these.

import { z } from "zod"
import { TASK_PRIORITIES, TASK_STATUSES } from "./task-board"

// Maximum number of relevant message ids the classifier may return.
// Mirrors RELEVANT_MESSAGE_LIMIT in apps/web/convex/discordFeedback.ts.
const RELEVANT_MESSAGE_LIMIT = 25

export const feedbackClassificationSchema = z.object({
  isProductFeedback: z.boolean(),
  needsTaskAction: z.boolean(),
  confidence: z.number(),
  summary: z.string().min(1).nullable(),
  reason: z.string().min(1),
  relevantMessageIds: z.array(z.string()).max(RELEVANT_MESSAGE_LIMIT),
})

export const extractedFeedbackActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    title: z.string().min(1).max(140),
    description: z.string().max(2000).nullable(),
    priority: z.enum(["urgent", "high", "medium", "low", "none"]).nullable(),
    labels: z.array(z.string()),
  }),
  z.object({
    action: z.literal("update"),
    taskCode: z.string().min(1),
    title: z.string().min(1).max(140),
    description: z.string().max(2000).nullable(),
    priority: z.enum(["urgent", "high", "medium", "low", "none"]).nullable(),
    labels: z.array(z.string()),
  }),
])

export const extractedFeedbackTasksSchema = z.object({
  actions: z.array(extractedFeedbackActionSchema),
})

export const generatedTasksSchema = z.object({
  tasks: z
    .array(
      z
        .object({
          title: z.string().min(1).max(140),
          description: z.string().max(2000).nullable(),
          status: z.enum(TASK_STATUSES).nullable(),
          priority: z.enum(TASK_PRIORITIES).nullable(),
          tags: z.array(z.string()).max(5).optional(),
          labels: z.array(z.string()).max(5).optional(),
        })
        .refine(
          (task) => task.tags !== undefined || task.labels !== undefined,
          { message: "Every generated task must include tags." }
        )
    )
    .min(1)
    .max(12),
})
