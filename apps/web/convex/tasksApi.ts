import { v } from "convex/values"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { httpAction, internalQuery } from "./_generated/server"
import { requireApiKey } from "./apiKeys"
import { STATUS_ORDER, TASK_PRIORITIES, TASK_STATUSES } from "../lib/task-board"

const MAX_LIMIT = 500
const DEFAULT_LIMIT = 200

const taskStatusValidator = v.union(
  v.literal("requests"),
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("ready"),
  v.literal("shipped"),
  v.literal("archive")
)

const taskPriorityValidator = v.union(
  v.literal("urgent"),
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
  v.literal("none")
)

type TaskStatus = (typeof TASK_STATUSES)[number]
type TaskPriority = (typeof TASK_PRIORITIES)[number]

const VALID_STATUSES = new Set<string>(TASK_STATUSES)
const VALID_PRIORITIES = new Set<string>(TASK_PRIORITIES)

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      ...CORS_HEADERS,
    },
  })
}

function readApiKey(request: Request, url: URL): string | null {
  const authHeader =
    request.headers.get("authorization") ?? request.headers.get("Authorization")
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    if (match?.[1]) {
      return match[1].trim()
    }
  }
  const queryKey = url.searchParams.get("apiKey")
  if (queryKey && queryKey.trim()) {
    return queryKey.trim()
  }
  return null
}

// Phases can be passed either as a comma-separated `phases` param
// (?phases=todo,in_progress) or as repeated `phase` params
// (?phase=todo&phase=in_progress). Both forms are merged and de-duplicated.
function readRequestedPhases(url: URL): string[] {
  const raw: string[] = []
  for (const value of url.searchParams.getAll("phases")) {
    raw.push(...value.split(","))
  }
  for (const value of url.searchParams.getAll("phase")) {
    raw.push(...value.split(","))
  }
  const seen = new Set<string>()
  const phases: string[] = []
  for (const entry of raw) {
    const trimmed = entry.trim()
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed)
      phases.push(trimmed)
    }
  }
  return phases
}

// Every task returned by the API uses this exact shape, regardless of which
// phase it lives in, so callers can rely on a single schema.
function formatTask(task: Doc<"tasks">) {
  return {
    id: task._id,
    taskCode: task.taskCode,
    taskNumber: task.taskNumber,
    title: task.title,
    description: task.description ?? null,
    phase: task.status,
    status: task.status,
    priority: task.priority,
    labels: task.labels,
    project: task.project,
    order: task.order,
    assignee: task.assignee ?? null,
    assignees: task.assignees ?? [],
    source: task.source ?? null,
    sources: task.sources ?? [],
    customData: task.customData ?? null,
    createdAt: task._creationTime,
    updatedAt: task.updatedAt ?? null,
  }
}

export const listTasksHttpOptions = httpAction(async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
})

export const listTasksHttp = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  const url = new URL(request.url)

  const apiKey = readApiKey(request, url)
  if (!apiKey) {
    return jsonResponse(
      {
        error:
          "Missing API key. Provide via Authorization: Bearer <key> or apiKey query parameter.",
      },
      401
    )
  }

  const requestedPhases = readRequestedPhases(url)
  const invalidPhases = requestedPhases.filter(
    (phase) => !VALID_STATUSES.has(phase)
  )
  if (invalidPhases.length > 0) {
    return jsonResponse(
      {
        error: `Invalid phase(s): ${invalidPhases.join(", ")}. Valid phases are: ${TASK_STATUSES.join(", ")}.`,
      },
      400
    )
  }
  const phases =
    requestedPhases.length > 0 ? (requestedPhases as TaskStatus[]) : undefined

  const priorityParam = url.searchParams.get("priority")?.trim()
  if (priorityParam && !VALID_PRIORITIES.has(priorityParam)) {
    return jsonResponse(
      {
        error: `Invalid priority: ${priorityParam}. Valid priorities are: ${TASK_PRIORITIES.join(", ")}.`,
      },
      400
    )
  }
  const priority = priorityParam ? (priorityParam as TaskPriority) : undefined

  const label = url.searchParams.get("label")?.trim() || undefined

  let limit = DEFAULT_LIMIT
  const limitParam = url.searchParams.get("limit")
  if (limitParam !== null) {
    const parsed = Number(limitParam)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return jsonResponse(
        { error: "`limit` must be a positive integer." },
        400
      )
    }
    limit = Math.min(parsed, MAX_LIMIT)
  }

  let result: {
    workspace: { id: Id<"workspaces">; name: string; prefix: string }
    tasks: ReturnType<typeof formatTask>[]
  }
  try {
    result = await ctx.runQuery(internal.tasksApi.listTasksForApiKey, {
      apiKey,
      phases,
      priority,
      label,
      limit,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid or revoked API key"
    return jsonResponse({ error: message }, 401)
  }

  return jsonResponse(
    {
      workspace: result.workspace,
      phases: phases ?? TASK_STATUSES,
      count: result.tasks.length,
      tasks: result.tasks,
    },
    200
  )
})

export const listTasksForApiKey = internalQuery({
  args: {
    apiKey: v.string(),
    phases: v.optional(v.array(taskStatusValidator)),
    priority: v.optional(taskPriorityValidator),
    label: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const keyRecord = await requireApiKey(ctx, args.apiKey)
    const workspace = await ctx.db.get(keyRecord.workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    const tasks = (await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", keyRecord.workspaceId)
      )
      .collect()) as Doc<"tasks">[]

    const phaseSet = args.phases ? new Set<string>(args.phases) : null

    let filtered = tasks
    if (phaseSet) {
      filtered = filtered.filter((task) => phaseSet.has(task.status))
    }
    if (args.priority) {
      filtered = filtered.filter((task) => task.priority === args.priority)
    }
    if (args.label) {
      filtered = filtered.filter((task) => task.labels.includes(args.label!))
    }

    // Taskboard order: by phase, then by the within-phase order field.
    filtered.sort((a, b) => {
      const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      if (statusDiff !== 0) return statusDiff
      return a.order - b.order
    })

    const limit = args.limit ?? DEFAULT_LIMIT
    const limited = filtered.slice(0, limit)

    return {
      workspace: {
        id: workspace._id,
        name: workspace.name,
        prefix: workspace.prefix ?? "MED",
      },
      tasks: limited.map(formatTask),
    }
  },
})
