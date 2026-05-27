import { auth } from "@clerk/nextjs/server"
import { generateText } from "ai"
import { fetchAction, fetchQuery } from "convex/nextjs"
import { NextResponse } from "next/server"
import { z } from "zod"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { AI_MODEL_IDS, AI_MODELS, hasOpenRouterApiKey } from "@/lib/ai"
import { buildTaskCleanupSystemPrompt } from "@/lib/ai-prompts"
import { cleanedUpTasksSchema } from "@/lib/ai-schemas"
import { withAxiom, logger } from "@/lib/logger"
import { getPostHogServerClient } from "@/lib/posthog-server"
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit"
import { safeTrackAiUsage } from "@/lib/billing/autumn"
import { getAiCostForTokens } from "@/lib/billing/config"

const MAX_TASKS = 50
const MAX_RETRIES = 3

const requestSchema = z.object({
  workspaceId: z.string().min(1),
  tasks: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).nullable().optional(),
        status: z.enum([
          "requests",
          "todo",
          "in_progress",
          "ready",
          "shipped",
          "archive",
        ]),
        priority: z.enum(["urgent", "high", "medium", "low", "none"]),
        labels: z.array(z.string().min(1).max(100)).max(10),
        order: z.number().int().min(0).max(10000),
      })
    )
    .min(1)
    .max(MAX_TASKS),
})

function extractJsonObject(text: string) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return a JSON object.")
  }
  return text.slice(start, end + 1)
}

function cleanedTasksLengthMatchesInput(
  outputTaskCounts: Map<string, number>,
  inputTaskIds: Set<string>
) {
  if (outputTaskCounts.size !== inputTaskIds.size) return false

  for (const id of inputTaskIds) {
    if (outputTaskCounts.get(id) !== 1) return false
  }

  return true
}

async function generateAndValidateCleanup({
  prompt,
  system,
  userId,
}: {
  prompt: string
  system: string
  userId: string
}) {
  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await generateText({
        model: AI_MODELS.taskCleanup,
        system,
        prompt,
      })
      const rawObject = JSON.parse(extractJsonObject(result.text))
      const validatedObject = cleanedUpTasksSchema.parse(rawObject)
      return { result, validatedObject }
    } catch (error) {
      lastError = error
      if (attempt >= MAX_RETRIES) break

      logger.warn("AI task cleanup attempt failed; retrying", {
        userId,
        attempt: attempt + 1,
        maxRetries: MAX_RETRIES,
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
    key: `tasks-cleanup:${userId}:${ip}`,
    limit: 6,
    windowMs: 60_000,
  })

  if (!rateLimit.allowed) {
    logger.warn("Task cleanup rate limit exceeded", { userId, ip })
    return NextResponse.json(
      { error: "Too many AI cleanup requests. Try again in a minute." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    )
  }

  try {
    const body = await request.json()
    const parsed = requestSchema.safeParse(body)

    if (!parsed.success) {
      logger.warn("Invalid task cleanup request", { userId })
      return NextResponse.json({ error: "Invalid request." }, { status: 400 })
    }

    const { workspaceId, tasks } = parsed.data
    const convexToken = await getToken({ template: "convex" })
    if (!convexToken) {
      logger.warn("Missing Convex token for task cleanup", {
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

    try {
      const quota = await fetchAction(
        api.billing.getWorkspaceQuotaStatus,
        { workspaceId: workspaceId as Id<"workspaces"> },
        { token: convexToken }
      )

      if (quota.creditsExhausted) {
        logger.info("Blocking AI task cleanup — credits exhausted", {
          userId,
          workspaceId,
        })
        return NextResponse.json(
          {
            error:
              "Credits exhausted. Overages are disabled for this workspace — upgrade your plan to keep using AI features.",
            code: "credits_exhausted",
          },
          { status: 402 }
        )
      }
    } catch (quotaError) {
      logger.warn("Quota check failed — blocking AI cleanup", {
        userId,
        workspaceId,
        error:
          quotaError instanceof Error ? quotaError.message : "Unknown error",
      })
      return NextResponse.json(
        {
          error:
            "Credits exhausted. Overages are disabled for this workspace — upgrade your plan to keep using AI features.",
          code: "credits_exhausted",
        },
        { status: 402 }
      )
    }

    const labelsText =
      availableLabels.length > 0
        ? availableLabels.join(", ")
        : "No predefined labels available."

    const model = AI_MODEL_IDS.taskCleanup
    const system = buildTaskCleanupSystemPrompt({ workspaceName, labelsText })

    const taskPayload = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description ?? null,
      status: t.status,
      priority: t.priority,
      labels: t.labels,
      order: t.order,
    }))

    logger.info("Cleaning up tasks with AI", {
      userId,
      workspaceName,
      taskCount: tasks.length,
    })

    const { result, validatedObject } = await generateAndValidateCleanup({
      prompt: JSON.stringify(taskPayload),
      system,
      userId,
    })

    const inputTaskIds = new Set(tasks.map((t) => t.id))
    const outputTaskCounts = new Map<string, number>()
    for (const task of validatedObject.tasks) {
      outputTaskCounts.set(task.id, (outputTaskCounts.get(task.id) ?? 0) + 1)
    }

    const hasOneToOneTaskMapping =
      validatedObject.tasks.length === tasks.length &&
      cleanedTasksLengthMatchesInput(outputTaskCounts, inputTaskIds)

    if (!hasOneToOneTaskMapping) {
      logger.warn("AI task cleanup returned mismatched task ids", {
        userId,
        workspaceId,
        inputTaskCount: tasks.length,
        outputTaskCount: validatedObject.tasks.length,
      })
      return NextResponse.json(
        { error: "AI cleanup returned an invalid task mapping." },
        { status: 502 }
      )
    }

    const cleanedTasks = validatedObject.tasks.map((t) => ({
      ...t,
      labels: t.labels.filter((label) => availableLabels.includes(label)),
    }))

    const durationMs = Date.now() - start

    logger.info("Tasks cleaned up successfully", {
      userId,
      taskCount: cleanedTasks.length,
      durationMs,
    })

    const inputTokens = result.usage?.inputTokens ?? 0
    const outputTokens = result.usage?.outputTokens ?? 0

    if (inputTokens === 0 && outputTokens === 0) {
      logger.warn(
        "AI cleanup returned zero token usage — billing will not track",
        { userId, workspaceId, model }
      )
    }

    const posthog = getPostHogServerClient()
    if (posthog) {
      posthog.capture({
        distinctId: userId,
        event: "llm_generation",
        properties: {
          model,
          feature: "task_cleanup",
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
          duration_ms: durationMs,
          task_count: cleanedTasks.length,
          success: true,
          finish_reason: result.finishReason,
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
        feature: "task_cleanup",
        user_id: userId,
      },
    })

    const cost = getAiCostForTokens({ model, inputTokens, outputTokens })

    return NextResponse.json({
      tasks: cleanedTasks,
      cost: cost > 0 ? cost : undefined,
    })
  } catch (error) {
    const durationMs = Date.now() - start

    logger.error("AI task cleanup failed", {
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
          model: AI_MODEL_IDS.taskCleanup,
          feature: "task_cleanup",
          duration_ms: durationMs,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      })
    }

    return NextResponse.json(
      { error: "Unable to clean up tasks right now." },
      { status: 500 }
    )
  }
})
