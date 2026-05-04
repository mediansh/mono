import { auth } from "@clerk/nextjs/server"
import { generateText } from "ai"
import { fetchAction, fetchQuery } from "convex/nextjs"
import { NextResponse } from "next/server"
import { z } from "zod"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { AI_MODEL_IDS, AI_MODELS, hasOpenRouterApiKey } from "@/lib/ai"
import { withAxiom, logger } from "@/lib/logger"
import { getPostHogServerClient } from "@/lib/posthog-server"
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit"
import { safeTrackAiUsage } from "@/lib/billing/autumn"
import { getAiCostForTokens } from "@/lib/billing/config"

import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/task-board"

const requestSchema = z.object({
  prompt: z.string().min(1),
  workspaceId: z.string().min(1),
})

const generatedTasksSchema = z.object({
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
          {
            message: "Every generated task must include tags.",
          }
        )
    )
    .min(1)
    .max(12),
})

function extractJsonObject(text: string) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return a JSON object.")
  }

  return text.slice(start, end + 1)
}

type TaskGenerationMode = "single" | "smart" | "multiple"

const SMART_TASK_LIMIT = 5
const MAX_AI_TASK_GENERATION_RETRIES = 3

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

  if (
    explicitSingleIntentPatterns.some((pattern) => pattern.test(normalized))
  ) {
    return "single"
  }

  // If the prompt already enumerates separate deliverables, keep the full breakdown.
  const numberedListItemMatches = normalized.match(
    /(?:^|\n)\s*(?:\d+[.)]|[-*])\s+/g
  )
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

async function generateAndValidateTasks({
  prompt,
  system,
  userId,
}: {
  prompt: string
  system: string
  userId: string
}) {
  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_AI_TASK_GENERATION_RETRIES; attempt++) {
    try {
      const result = await generateText({
        model: AI_MODELS.taskGeneration,
        system,
        prompt,
      })
      const rawObject = JSON.parse(extractJsonObject(result.text))
      const validatedObject = generatedTasksSchema.parse(rawObject)

      return { result, validatedObject }
    } catch (error) {
      lastError = error

      if (attempt >= MAX_AI_TASK_GENERATION_RETRIES) {
        break
      }

      logger.warn("AI task generation attempt failed; retrying", {
        userId,
        attempt: attempt + 1,
        nextAttempt: attempt + 2,
        maxRetries: MAX_AI_TASK_GENERATION_RETRIES,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  throw lastError
}

export const POST = withAxiom(async (request: Request) => {
  const { userId, getToken } = await auth()

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!hasOpenRouterApiKey()) {
    logger.error("Missing OPENROUTER_API_KEY", { userId })
    return NextResponse.json(
      { error: "Missing OPENROUTER_API_KEY." },
      { status: 500 }
    )
  }

  const start = Date.now()
  const ip = getRequestIp(request)
  const rateLimit = checkRateLimit({
    key: `tasks-generate:${userId}:${ip}`,
    limit: 12,
    windowMs: 60_000,
  })

  if (!rateLimit.allowed) {
    logger.warn("Task generation rate limit exceeded", { userId, ip })
    return NextResponse.json(
      { error: "Too many AI generation requests. Try again in a minute." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    )
  }

  try {
    const body = await request.json()
    const parsed = requestSchema.safeParse(body)

    if (!parsed.success) {
      logger.warn("Invalid task generation request", { userId })
      return NextResponse.json({ error: "Invalid request." }, { status: 400 })
    }

    const { prompt, workspaceId } = parsed.data
    const convexToken = await getToken({ template: "convex" })
    if (!convexToken) {
      logger.warn("Missing Convex token for task generation", {
        userId,
        workspaceId,
      })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const generationContext = await fetchQuery(
      api.workspaces.getWorkspaceTaskGenerationContext,
      { workspaceId: workspaceId as Id<"workspaces"> },
      { token: convexToken }
    )

    const { workspaceName, availableLabels } = generationContext

    // Hard-stop AI generation when the workspace has disabled overages and the
    // AI budget is exhausted. Access is already verified above, so a flaky
    // billing read should not become a cross-workspace spend bypass.
    try {
      const quota = await fetchAction(
        api.billing.getWorkspaceQuotaStatus,
        { workspaceId: workspaceId as Id<"workspaces"> },
        { token: convexToken }
      )

      if (quota.aiExhausted) {
        logger.info("Blocking AI task generation — budget exhausted", {
          userId,
          workspaceId,
        })
        return NextResponse.json(
          {
            error:
              "AI budget exhausted. Overages are disabled for this workspace — upgrade your plan to keep generating tasks.",
            code: "ai_budget_exhausted",
          },
          { status: 402 }
        )
      }
    } catch (quotaError) {
      logger.warn("Quota check failed — allowing AI generation", {
        userId,
        workspaceId,
        error:
          quotaError instanceof Error ? quotaError.message : "Unknown error",
      })
    }

    logger.info("Generating tasks with AI", {
      userId,
      workspaceName,
      promptLength: prompt.length,
      labelCount: availableLabels.length,
    })

    const labelsText =
      availableLabels.length > 0
        ? availableLabels.join(", ")
        : "No predefined labels available."

    const model = AI_MODEL_IDS.taskGeneration
    const generationMode = getTaskGenerationMode(prompt)
    const allowMultipleTasks = generationMode !== "single"
    const taskGenerationSystem = [
      "You generate actionable task objects for a project management app.",
      `Workspace: ${workspaceName}.`,
      `Allowed statuses: ${TASK_STATUSES.join(", ")}.`,
      `Allowed priorities: ${TASK_PRIORITIES.join(", ")}.`,
      `Allowed tags: ${labelsText}`,
      getTaskGenerationInstruction(generationMode),
      "Every task must have a concise title.",
      "Every task object must include title, description, status, priority, and tags.",
      "Use null for description, status, or priority when not specified.",
      "Use an empty array for tags when none apply.",
      "Descriptions should be plain text.",
      "Only use tags from the allowed tags list.",
      "Use sensible defaults when the user does not specify status or priority.",
      "Return valid JSON only. No markdown. No code fences. No commentary.",
      'The JSON format must be: {"tasks":[{"title":"...","description":null,"status":"todo","priority":"none","tags":[]}]}',
    ].join(" ")

    const { result, validatedObject } = await generateAndValidateTasks({
      prompt,
      system: taskGenerationSystem,
      userId,
    })

    const normalizedTasks = validatedObject.tasks.map((task) => ({
      title: task.title,
      description: task.description ?? undefined,
      status: task.status ?? undefined,
      priority: task.priority ?? undefined,
      labels: (task.tags ?? task.labels ?? []).filter((label) =>
        availableLabels.includes(label)
      ),
    }))
    const finalTasks = finalizeGeneratedTasks(normalizedTasks, generationMode)

    const durationMs = Date.now() - start

    logger.info("Tasks generated successfully", {
      userId,
      taskCount: finalTasks.length,
      durationMs,
      generationMode,
      allowMultipleTasks,
    })

    const inputTokens = result.usage?.inputTokens ?? 0
    const outputTokens = result.usage?.outputTokens ?? 0

    if (inputTokens === 0 && outputTokens === 0) {
      logger.warn(
        "AI generation returned zero token usage — billing will not track",
        {
          userId,
          workspaceId,
          model,
        }
      )
    }

    // Track LLM generation metrics in PostHog
    const posthog = getPostHogServerClient()
    if (posthog) {
      posthog.capture({
        distinctId: userId,
        event: "llm_generation",
        properties: {
          model,
          feature: "task_generation",
          prompt_length: prompt.length,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
          duration_ms: durationMs,
          task_count: finalTasks.length,
          success: true,
          finish_reason: result.finishReason,
          generation_mode: generationMode,
          allow_multiple_tasks: allowMultipleTasks,
        },
      })
    }

    await safeTrackAiUsage({
      workspaceId,
      workspaceName,
      model,
      inputTokens,
      outputTokens,
      properties: {
        feature: "task_generation",
        user_id: userId,
      },
    })

    const cost = getAiCostForTokens({
      model,
      inputTokens,
      outputTokens,
    })

    return NextResponse.json({
      tasks: finalTasks,
      cost: cost > 0 ? cost : undefined,
    })
  } catch (error) {
    const durationMs = Date.now() - start

    logger.error("AI task generation failed", {
      userId,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      durationMs,
    })

    const posthog = getPostHogServerClient()
    if (posthog) {
      posthog.capture({
        distinctId: userId,
        event: "llm_generation",
        properties: {
          model: AI_MODEL_IDS.taskGeneration,
          feature: "task_generation",
          duration_ms: durationMs,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      })
    }

    return NextResponse.json(
      { error: "Unable to generate tasks right now." },
      { status: 500 }
    )
  }
})
