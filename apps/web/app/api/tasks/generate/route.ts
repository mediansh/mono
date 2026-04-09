import { auth } from "@clerk/nextjs/server"
import { generateText } from "ai"
import { NextResponse } from "next/server"
import { z } from "zod"
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

function shouldGenerateMultipleTasks(prompt: string): boolean {
  const normalized = prompt.toLowerCase()

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
    return true
  }

  // If user explicitly enumerates multiple independent deliverables, allow multiple tasks.
  const numberedListItemMatches = normalized.match(/(?:^|\n)\s*(?:\d+[.)]|[-*])\s+/g)
  return (numberedListItemMatches?.length ?? 0) >= 2
}

export const POST = withAxiom(async (request: Request) => {
  const { userId } = await auth()

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
    const allowMultipleTasks = shouldGenerateMultipleTasks(prompt)
    const result = await generateText({
      model,
      system: [
        "You generate actionable task objects for a project management app.",
        `Workspace: ${workspaceName}.`,
        `Allowed statuses: ${TASK_STATUSES.join(", ")}.`,
        `Allowed priorities: ${TASK_PRIORITIES.join(", ")}.`,
        `Allowed labels: ${labelsText}`,
        allowMultipleTasks
          ? "Return between 1 and 12 tasks only when the prompt clearly asks for multiple distinct tasks."
          : "Return exactly 1 task by default. Do not split into multiple tasks unless the prompt explicitly asks for it.",
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
    const finalTasks = allowMultipleTasks ? normalizedTasks : normalizedTasks.slice(0, 1)

    const durationMs = Date.now() - start

    logger.info("Tasks generated successfully", {
      userId,
      taskCount: finalTasks.length,
      durationMs,
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
