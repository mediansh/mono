import { auth } from "@clerk/nextjs/server"
import { generateObject } from "ai"
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
        description: z.string().max(2000).optional(),
        status: z.enum(TASK_STATUSES).optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        labels: z.array(z.string()).max(5).optional(),
      })
    )
    .min(1)
    .max(12),
})

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

    const { object } = await generateObject({
      model: "openai/gpt-5-nano",
      schema: generatedTasksSchema,
      system: [
        "You generate actionable task objects for a project management app.",
        `Workspace: ${workspaceName}.`,
        `Allowed statuses: ${TASK_STATUSES.join(", ")}.`,
        `Allowed priorities: ${TASK_PRIORITIES.join(", ")}.`,
        `Allowed labels: ${labelsText}`,
        "Return between 1 and 12 tasks.",
        "Every task must have a concise title.",
        "Descriptions should be plain text and optional.",
        "Only use labels from the allowed labels list.",
        "Use sensible defaults when the user does not specify status or priority.",
        "Do not include markdown, commentary, or fields outside the schema.",
      ].join(" "),
      prompt,
    })

    const normalizedTasks = object.tasks.map((task) => ({
      ...task,
      labels: (task.labels ?? []).filter((label) =>
        availableLabels.includes(label)
      ),
    }))

    return NextResponse.json({ tasks: normalizedTasks })
  } catch {
    return NextResponse.json(
      { error: "Unable to generate tasks right now." },
      { status: 500 }
    )
  }
}
