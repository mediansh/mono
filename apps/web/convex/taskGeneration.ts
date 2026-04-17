import { generateText } from "ai"
import { v } from "convex/values"
import { z } from "zod"
import { action } from "./_generated/server"
import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import type { WorkspaceQuotaStatus } from "./billing"
import { AI_MODEL_IDS, AI_MODELS, hasAnthropicApiKey } from "../lib/ai"
import { safeTrackAiUsage } from "../lib/billing/autumn"
import { getAiCostForTokens } from "../lib/billing/config"
import { TASK_PRIORITIES, TASK_STATUSES } from "../lib/task-board"
import { trackLLMGeneration } from "./posthog"

const generatedTasksSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(140),
        description: z.string().max(2000).nullable(),
        status: z.enum(TASK_STATUSES).nullable(),
        priority: z.enum(TASK_PRIORITIES).nullable(),
        labels: z.array(z.string()).max(5),
      })
    )
    .min(1)
    .max(12),
})

type TaskGenerationMode = "single" | "smart" | "multiple"

const SMART_TASK_LIMIT = 5

function extractJsonObject(text: string) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return a JSON object.")
  }
  return text.slice(start, end + 1)
}

function getTaskGenerationMode(prompt: string): TaskGenerationMode {
  const normalized = prompt.toLowerCase()

  const explicitSingleIntentPatterns = [
    /\bexactly\s+one\s+task\b/,
    /\bjust\s+one\s+task\b/,
    /\bone\s+task\b/,
    /\bsingle\s+task\b/,
  ]

  const explicitMultiIntentPatterns = [
    /\b([2-9]|1[0-2])\s+tasks?\b/,
    /\bmultiple\s+tasks?\b/,
    /\bseveral\s+tasks?\b/,
    /\blist\s+of\s+tasks?\b/,
    /\bcreate\s+(?:a\s+)?(?:list|set)\b/,
    /\bsplit\s+(?:this|it)\s+into\b/,
    /\bbreak\s+(?:this|it)\s+down\s+into\b/,
    /\bseparate\s+tasks?\b/,
  ]

  if (explicitMultiIntentPatterns.some((pattern) => pattern.test(normalized))) {
    return "multiple"
  }
  if (explicitSingleIntentPatterns.some((pattern) => pattern.test(normalized))) {
    return "single"
  }

  const numberedListItemMatches = normalized.match(/(?:^|\n)\s*(?:\d+[.)]|[-*])\s+/g)
  if ((numberedListItemMatches?.length ?? 0) >= 2) {
    return "multiple"
  }

  return "smart"
}

function getTaskGenerationInstruction(mode: TaskGenerationMode): string {
  switch (mode) {
    case "single":
      return "Return exactly 1 task. The user explicitly asked for a single task."
    case "multiple":
      return "Return between 2 and 12 tasks. The user asked for multiple tasks or a clear breakdown. Use the fewest tasks that still matches the request."
    case "smart":
      return `Return between 1 and ${SMART_TASK_LIMIT} tasks. Prefer 1 task for a single cohesive request. Return multiple tasks only when the prompt clearly contains multiple distinct deliverables or asks for a breakdown. Follow the user's wording instead of refusing valid multi-task requests.`
  }
}

function finalizeGeneratedTasks(
  tasks: {
    title: string
    description?: string
    status?: (typeof TASK_STATUSES)[number]
    priority?: (typeof TASK_PRIORITIES)[number]
    labels: string[]
  }[],
  mode: TaskGenerationMode
) {
  switch (mode) {
    case "single":
      return tasks.slice(0, 1)
    case "smart":
      return tasks.slice(0, SMART_TASK_LIMIT)
    case "multiple":
      return tasks
  }
}

export type GenerateTasksResult =
  | {
      ok: true
      tasks: {
        title: string
        description?: string
        status?: (typeof TASK_STATUSES)[number]
        priority?: (typeof TASK_PRIORITIES)[number]
        labels: string[]
      }[]
      cost?: number
    }
  | { ok: false; error: string; code?: "ai_budget_exhausted" | "missing_api_key" }

export const generateTasks = action({
  args: {
    workspaceId: v.id("workspaces"),
    prompt: v.string(),
  },
  handler: async (ctx, args): Promise<GenerateTasksResult> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return { ok: false, error: "Unauthorized" }
    }

    if (!hasAnthropicApiKey()) {
      console.error("[taskGeneration] Missing ANTHROPIC_API_KEY", {
        userId: identity.subject,
      })
      return { ok: false, error: "Missing ANTHROPIC_API_KEY.", code: "missing_api_key" }
    }

    const prompt = args.prompt.trim()
    if (!prompt) {
      return { ok: false, error: "Invalid request." }
    }

    const start = Date.now()

    const generationContext = await ctx.runQuery(
      api.workspaces.getWorkspaceTaskGenerationContext,
      { workspaceId: args.workspaceId }
    )
    const { workspaceName, availableLabels } = generationContext

    try {
      const quota: WorkspaceQuotaStatus = await ctx.runAction(
        internal.billing.getWorkspaceQuotaStatusInternal,
        { workspaceId: args.workspaceId }
      )
      if (quota.aiExhausted) {
        return {
          ok: false,
          error:
            "AI budget exhausted. Overages are disabled for this workspace — upgrade your plan to keep generating tasks.",
          code: "ai_budget_exhausted",
        }
      }
    } catch (quotaError) {
      console.warn(
        "[taskGeneration] Quota check failed — allowing AI generation",
        {
          userId: identity.subject,
          workspaceId: args.workspaceId,
          error:
            quotaError instanceof Error ? quotaError.message : "Unknown error",
        }
      )
    }

    const labelsText =
      availableLabels.length > 0
        ? availableLabels.join(", ")
        : "No predefined labels available."

    const model = AI_MODEL_IDS.taskGeneration
    const generationMode = getTaskGenerationMode(prompt)

    try {
      const result = await generateText({
        model: AI_MODELS.taskGeneration,
        system: [
          "You generate actionable task objects for a project management app.",
          `Workspace: ${workspaceName}.`,
          `Allowed statuses: ${TASK_STATUSES.join(", ")}.`,
          `Allowed priorities: ${TASK_PRIORITIES.join(", ")}.`,
          `Allowed labels: ${labelsText}`,
          getTaskGenerationInstruction(generationMode),
          "Every task must have a concise title.",
          "Every task object must include title, description, status, priority, and labels.",
          "Use null for description, status, or priority when not specified.",
          "Use an empty array for labels when none apply.",
          "Descriptions should be plain text.",
          "Only use labels from the allowed labels list.",
          "Use sensible defaults when the user does not specify status or priority.",
          "Return valid JSON only. No markdown. No code fences. No commentary.",
          'The JSON format must be: {"tasks":[{"title":"...","description":null,"status":"todo","priority":"none","labels":[]}]}',
        ].join(" "),
        prompt,
      })

      const rawObject = JSON.parse(extractJsonObject(result.text))
      const validatedObject = generatedTasksSchema.parse(rawObject)
      const normalizedTasks = validatedObject.tasks.map((task) => ({
        title: task.title,
        description: task.description ?? undefined,
        status: task.status ?? undefined,
        priority: task.priority ?? undefined,
        labels: task.labels.filter((label) => availableLabels.includes(label)),
      }))
      const finalTasks = finalizeGeneratedTasks(normalizedTasks, generationMode)

      const durationMs = Date.now() - start
      const inputTokens = result.usage?.inputTokens ?? 0
      const outputTokens = result.usage?.outputTokens ?? 0

      await trackLLMGeneration({
        distinctId: identity.subject,
        model,
        feature: "task_generation",
        inputTokens,
        outputTokens,
        durationMs,
        success: true,
        metadata: {
          prompt_length: prompt.length,
          task_count: finalTasks.length,
          generation_mode: generationMode,
          finish_reason: result.finishReason,
        },
      })

      await safeTrackAiUsage({
        workspaceId: args.workspaceId,
        workspaceName,
        model,
        inputTokens,
        outputTokens,
        properties: {
          feature: "task_generation",
          user_id: identity.subject,
        },
      })

      const cost = getAiCostForTokens({ model, inputTokens, outputTokens })

      return {
        ok: true,
        tasks: finalTasks,
        cost: cost > 0 ? cost : undefined,
      }
    } catch (error) {
      const durationMs = Date.now() - start
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error"
      console.error("[taskGeneration] AI task generation failed", {
        userId: identity.subject,
        workspaceId: args.workspaceId as Id<"workspaces">,
        error: errorMessage,
        durationMs,
      })

      await trackLLMGeneration({
        distinctId: identity.subject,
        model,
        feature: "task_generation",
        durationMs,
        success: false,
        error: errorMessage,
      })

      return { ok: false, error: "Unable to generate tasks right now." }
    }
  },
})
