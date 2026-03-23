import { auth } from "@clerk/nextjs/server"
import { generateText } from "ai"
import { NextResponse } from "next/server"
import { z } from "zod"

import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/task-board"

const requestSchema = z.object({
  prompt: z.string().min(1),
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

export async function POST(request: Request) {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    return NextResponse.json(
      { error: "Missing AI_GATEWAY_API_KEY." },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()
    const parsed = requestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 })
    }

    const { prompt, workspaceName, availableLabels } = parsed.data
    const labelsText =
      availableLabels.length > 0
        ? availableLabels.join(", ")
        : "No predefined labels available."

    const { text } = await generateText({
      model: "anthropic/claude-haiku-4.5",
      system: [
        "You generate actionable task objects for a project management app.",
        `Workspace: ${workspaceName}.`,
        `Allowed statuses: ${TASK_STATUSES.join(", ")}.`,
        `Allowed priorities: ${TASK_PRIORITIES.join(", ")}.`,
        `Allowed labels: ${labelsText}`,
        "Return between 1 and 12 tasks.",
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

    const rawObject = JSON.parse(extractJsonObject(text))
    const validatedObject = generatedTasksSchema.parse(rawObject)

    const normalizedTasks = validatedObject.tasks.map((task) => ({
      title: task.title,
      description: task.description ?? undefined,
      status: task.status ?? undefined,
      priority: task.priority ?? undefined,
      labels: task.labels.filter((label) => availableLabels.includes(label)),
    }))

    return NextResponse.json({ tasks: normalizedTasks })
  } catch (error) {
    console.error("[median:ai-task-generation]", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      userId,
    })

    return NextResponse.json(
      { error: "Unable to generate tasks right now." },
      { status: 500 }
    )
  }
}
