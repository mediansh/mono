import { auth } from "@clerk/nextjs/server"
import { generateText } from "ai"
import { fetchAction } from "convex/nextjs"
import { NextResponse } from "next/server"
import { z } from "zod"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { withAxiom, logger } from "@/lib/logger"
import { getPostHogServerClient } from "@/lib/posthog-server"
import { safeTrackAiUsage } from "@/lib/billing/autumn"
import { getAiCostForTokens } from "@/lib/billing/config"

import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/task-board"

const requestSchema = z.object({
  prompt: z.string().min(1),
  workspaceId: z.string().min(1),
  workspaceName: z.string().min(1),
  availableLabels: z.array(z.string()).max(20).default([]),
})

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

  // If the prompt already enumerates separate deliverables, keep the full breakdown.
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

export const POST = withAxiom(async (request: Request) => {
  const { userId, getToken } = await auth()

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    logger.error("Missing AI_GATEWAY_API_KEY", { userId })
    return NextResponse.json(
      { error: "Missing AI_GATEWAY_API_KEY." },
      { status: 500 }
    )
  }

  const start = Date.now()

  try {
    const body = await request.json()
    const parsed = requestSchema.safeParse(body)

    if (!parsed.success) {
      logger.warn("Invalid task generation request", { userId })
      return NextResponse.json({ error: "Invalid request." }, { status: 400 })
    }

    const { prompt, workspaceId, workspaceName, availableLabels } = parsed.data

    // Hard-stop AI generation when the workspace has disabled overages and the
    // AI budget is exhausted. We fail open on any quota lookup error so a flaky
    // billing read never blocks generation.
    try {
      const convexToken = await getToken({ template: "convex" })
      if (convexToken) {
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
      }
    } catch (quotaError) {
      logger.warn("Quota check failed — allowing AI generation", {
        userId,
        workspaceId,
        error: quotaError instanceof Error ? quotaError.message : "Unknown error",
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

    const model = "anthropic/claude-haiku-4.5"
    const generationMode = getTaskGenerationMode(prompt)
    const allowMultipleTasks = generationMode !== "single"
    const result = await generateText({
      model,
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
      logger.warn("AI generation returned zero token usage — billing will not track", {
        userId,
        workspaceId,
        model,
      })
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

    return NextResponse.json({ tasks: finalTasks, cost: cost > 0 ? cost : undefined })
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
          model: "anthropic/claude-haiku-4.5",
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
