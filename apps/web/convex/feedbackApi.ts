import { generateText, Output } from "ai"
import { v } from "convex/values"
import { z } from "zod"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import {
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server"
import { requireApiKey } from "./apiKeys"
import { AI_MODEL_IDS, AI_MODELS, getAiModelForPlan } from "../lib/ai"
import { getAiCostForTokens } from "../lib/billing/config"
import { insertWorkspaceLog } from "./logs"
import {
  extractedFeedbackTasksSchema,
  feedbackClassificationSchema,
} from "./slackFeedback"

const MAX_EXTRACTED_TASK_ACTIONS = 5
const MAX_EXTRACTED_TASK_LABELS = 5
const MAX_CONTENT_LENGTH = 10_000

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
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

function extractJsonObject(text: string) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return a JSON object.")
  }
  return text.slice(start, end + 1)
}

function readApiKey(request: Request, body: { apiKey?: unknown }): string | null {
  const authHeader =
    request.headers.get("authorization") ?? request.headers.get("Authorization")
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    if (match?.[1]) {
      return match[1].trim()
    }
  }
  if (typeof body.apiKey === "string" && body.apiKey.trim()) {
    return body.apiKey.trim()
  }
  return null
}

type SubmitFeedbackBody = {
  apiKey?: unknown
  content?: unknown
  author?: unknown
  sourceUrl?: unknown
  metadata?: unknown
  classify?: unknown
}

export const submitFeedbackHttpOptions = httpAction(async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
})

export const submitFeedbackHttp = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  let body: SubmitFeedbackBody
  try {
    body = (await request.json()) as SubmitFeedbackBody
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400)
  }

  const apiKey = readApiKey(request, body)
  if (!apiKey) {
    return jsonResponse(
      { error: "Missing API key. Provide via Authorization: Bearer <key> or apiKey in body." },
      401
    )
  }

  if (typeof body.content !== "string" || !body.content.trim()) {
    return jsonResponse({ error: "`content` is required and must be a non-empty string" }, 400)
  }

  if (body.content.length > MAX_CONTENT_LENGTH) {
    return jsonResponse(
      { error: `\`content\` exceeds maximum of ${MAX_CONTENT_LENGTH} characters` },
      400
    )
  }

  if (body.author !== undefined && typeof body.author !== "string") {
    return jsonResponse({ error: "`author` must be a string when provided" }, 400)
  }
  if (body.sourceUrl !== undefined && typeof body.sourceUrl !== "string") {
    return jsonResponse({ error: "`sourceUrl` must be a string when provided" }, 400)
  }
  if (body.classify !== undefined && typeof body.classify !== "boolean") {
    return jsonResponse({ error: "`classify` must be a boolean when provided" }, 400)
  }

  let lookup: {
    workspaceId: Id<"workspaces">
    apiKeyId: Id<"cliApiKeys">
    workspaceName: string
    hasActivePlan: boolean
  }
  try {
    lookup = await ctx.runQuery(internal.feedbackApi.lookupApiKey, { apiKey })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid or revoked API key"
    return jsonResponse({ error: message }, 401)
  }

  if (lookup.hasActivePlan === false) {
    return jsonResponse({ error: "An active plan is required" }, 402)
  }

  const classify = body.classify === true
  const author = typeof body.author === "string" ? body.author.trim() || undefined : undefined
  const sourceUrl =
    typeof body.sourceUrl === "string" ? body.sourceUrl.trim() || undefined : undefined
  const metadata = body.metadata ?? undefined
  const content = body.content.trim()

  const requestId: Id<"apiFeedbackRequests"> = await ctx.runMutation(
    internal.feedbackApi.recordApiFeedbackRequest,
    {
      workspaceId: lookup.workspaceId,
      workspaceName: lookup.workspaceName,
      apiKeyId: lookup.apiKeyId,
      content,
      author,
      sourceUrl,
      metadata,
      classify,
    }
  )

  return jsonResponse({ requestId, status: "pending" }, 202)
})

export const lookupApiKey = internalQuery({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    const keyRecord = await requireApiKey(ctx, args.apiKey)
    const workspace = await ctx.db.get(keyRecord.workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }
    return {
      workspaceId: workspace._id,
      apiKeyId: keyRecord._id,
      workspaceName: workspace.name,
      hasActivePlan: workspace.hasActivePlan !== false,
    }
  },
})

export const recordApiFeedbackRequest = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    workspaceName: v.string(),
    apiKeyId: v.id("cliApiKeys"),
    content: v.string(),
    author: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    metadata: v.optional(v.any()),
    classify: v.boolean(),
  },
  handler: async (ctx, args): Promise<Id<"apiFeedbackRequests">> => {
    const now = Date.now()
    const requestId = await ctx.db.insert("apiFeedbackRequests", {
      workspaceId: args.workspaceId,
      apiKeyId: args.apiKeyId,
      content: args.content,
      author: args.author,
      sourceUrl: args.sourceUrl,
      metadata: args.metadata,
      classify: args.classify,
      status: "pending",
      receivedAt: now,
    })

    await ctx.db.patch(args.apiKeyId, { lastUsedAt: now })

    await insertWorkspaceLog(ctx, {
      workspaceId: args.workspaceId,
      category: "webhooks",
      type: "webhook_received",
      message: `Received feedback via API${args.author ? ` from ${args.author}` : ""}`,
      source: "api",
    })

    await ctx.scheduler.runAfter(
      0,
      internal.billingTracking.trackIntegrationEvent,
      {
        workspaceId: args.workspaceId,
        workspaceName: args.workspaceName,
        source: "api",
        properties: { request_id: requestId },
      }
    )

    await ctx.scheduler.runAfter(0, internal.feedbackApi.processApiFeedback, {
      requestId,
    })

    return requestId
  },
})

export const updateApiFeedbackRequestStatus = internalMutation({
  args: {
    requestId: v.id("apiFeedbackRequests"),
    status: v.union(
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("rejected_not_feedback")
    ),
    createdTaskIds: v.optional(v.array(v.id("tasks"))),
    updatedTaskIds: v.optional(v.array(v.id("tasks"))),
    errorMessage: v.optional(v.string()),
    cost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId)
    if (!request) return

    const isTerminal =
      args.status === "completed" ||
      args.status === "failed" ||
      args.status === "rejected_not_feedback"

    await ctx.db.patch(args.requestId, {
      status: args.status,
      createdTaskIds: args.createdTaskIds ?? request.createdTaskIds,
      updatedTaskIds: args.updatedTaskIds ?? request.updatedTaskIds,
      errorMessage: args.errorMessage ?? request.errorMessage,
      completedAt: isTerminal ? Date.now() : request.completedAt,
    })

    if (args.status === "completed") {
      const created = args.createdTaskIds?.length ?? 0
      const updated = args.updatedTaskIds?.length ?? 0
      const message =
        created === 0 && updated === 0
          ? "Processed API feedback (no actionable tasks)"
          : `Processed API feedback — created ${created}, updated ${updated}`
      await insertWorkspaceLog(ctx, {
        workspaceId: request.workspaceId,
        category: "tasks",
        type: "feedback_processed",
        message,
        source: "api",
        cost: args.cost,
      })
    } else if (args.status === "rejected_not_feedback") {
      await insertWorkspaceLog(ctx, {
        workspaceId: request.workspaceId,
        category: "tasks",
        type: "feedback_processed",
        message: "API submission classified as not product feedback",
        source: "api",
        cost: args.cost,
      })
    } else if (args.status === "failed") {
      await insertWorkspaceLog(ctx, {
        workspaceId: request.workspaceId,
        category: "webhooks",
        type: "webhook_error",
        message: `Failed to process API feedback: ${args.errorMessage ?? "unknown error"}`,
        source: "api",
      })
    }
  },
})

export const getApiFeedbackRequestInternal = internalQuery({
  args: { requestId: v.id("apiFeedbackRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId)
    if (!request) return null
    const workspace = await ctx.db.get(request.workspaceId)
    if (!workspace) return null
    return {
      request,
      workspace: {
        _id: workspace._id,
        name: workspace.name,
        availableLabels: (workspace.labels ?? []).map((label) => label.name),
      },
    }
  },
})

export const processApiFeedback = internalAction({
  args: { requestId: v.id("apiFeedbackRequests") },
  handler: async (ctx, args) => {
    const loaded = await ctx.runQuery(
      internal.feedbackApi.getApiFeedbackRequestInternal,
      { requestId: args.requestId }
    )
    if (!loaded) {
      console.warn("[api-feedback] Request not found", args.requestId)
      return
    }

    const { request, workspace } = loaded

    await ctx.runMutation(internal.feedbackApi.updateApiFeedbackRequestStatus, {
      requestId: args.requestId,
      status: "processing",
    })

    const planStatus = (await ctx.runAction(
      internal.billing.getWorkspacePlanStatusInternal,
      { workspaceId: workspace._id }
    )) as { hasActivePlan: boolean; currentPlanId: string | null }

    if (!planStatus.hasActivePlan) {
      await ctx.runMutation(internal.feedbackApi.updateApiFeedbackRequestStatus, {
        requestId: args.requestId,
        status: "failed",
        errorMessage: "Workspace does not have an active plan",
      })
      return
    }

    const submissionContext = `Submitted via API by ${request.author ?? "anonymous"} from ${request.sourceUrl ?? "unknown"}`

    let totalAiCost = 0

    try {
      if (request.classify) {
        const classifierSystem = [
          "You classify a user-submitted feedback note for a product team.",
          `The product is ${workspace.name}.`,
          "Return isProductFeedback=true only when the note describes a concrete bug, feature request, workflow friction, or actionable complaint about the product.",
          "Reject compliments, praise, off-topic chat, and generic positive sentiment with no specific request.",
          "Return valid JSON only. No markdown. No code fences.",
          'Use this exact JSON shape: {"isProductFeedback":false,"confidence":0.0,"summary":null,"reason":"...","relevantMessageIds":[]}',
        ].join(" ")

        const classifierPrompt = [
          submissionContext,
          "Submission:",
          request.content,
        ].join("\n\n")

        const classifierResult = await generateText({
          model: AI_MODELS.feedbackClassifier,
          system: classifierSystem,
          prompt: classifierPrompt,
        })

        const classifierCost = getAiCostForTokens({
          model: AI_MODEL_IDS.feedbackClassifier,
          inputTokens: classifierResult.usage?.inputTokens,
          outputTokens: classifierResult.usage?.outputTokens,
        })
        totalAiCost += classifierCost

        await ctx.runAction(internal.billingTracking.trackAiUsage, {
          workspaceId: workspace._id,
          workspaceName: workspace.name,
          model: AI_MODEL_IDS.feedbackClassifier,
          inputTokens: classifierResult.usage?.inputTokens,
          outputTokens: classifierResult.usage?.outputTokens,
          properties: {
            feature: "api_feedback_classifier",
            request_id: args.requestId,
          },
        })

        const classification = feedbackClassificationSchema.parse(
          JSON.parse(extractJsonObject(classifierResult.text))
        )

        if (!classification.isProductFeedback) {
          await ctx.runMutation(
            internal.feedbackApi.updateApiFeedbackRequestStatus,
            {
              requestId: args.requestId,
              status: "rejected_not_feedback",
              cost: totalAiCost > 0 ? totalAiCost : undefined,
            }
          )
          return
        }
      }

      const existingTasks = (await ctx.runQuery(
        internal.tasks.getTaskSnapshotForApiFeedbackInternal,
        { workspaceId: workspace._id, limit: 50 }
      )) as Array<{
        taskId: Id<"tasks">
        taskCode: string
        title: string
        description: string | null
        status: string
        priority: string
        labels: string[]
        sourceUrl: string | null
      }>

      const labelsText =
        workspace.availableLabels.length > 0
          ? workspace.availableLabels.join(", ")
          : "No predefined labels."

      const extractorSystem = [
        "You turn product feedback into concise task requests for a task board.",
        `The product is ${workspace.name}.`,
        "Only create or update tasks for actionable feedback about the real product.",
        "Return between 0 and 5 actions total.",
        "Each action must be distinct, concrete, and understandable on its own.",
        "Use update when the new feedback materially adds detail to an existing open task.",
        "Do not update shipped or archived tasks.",
        "If an existing task describes the EXACT same specific issue with no meaningful new information, do not create a task and do not update anything.",
        "Descriptions should summarize the user problem and expected outcome in plain text.",
        "Priority may be urgent, high, medium, low, or none.",
        `Allowed labels: ${labelsText}`,
        "Only use labels from the allowed list. Use an empty array when none apply.",
        'Return valid structured output only with action items shaped like {"action":"create",...} or {"action":"update","taskCode":"MDN-123",...}.',
      ].join(" ")

      const existingTaskLines =
        existingTasks.length === 0
          ? "No existing tasks."
          : existingTasks
              .map((task) =>
                [
                  `${task.taskCode} | ${task.status} | ${task.priority} | ${task.title}`,
                  task.labels.length > 0 ? `labels: ${task.labels.join(", ")}` : null,
                  task.description ? `description: ${task.description}` : null,
                ]
                  .filter(Boolean)
                  .join(" | ")
              )
              .join("\n")

      const extractorPrompt = [
        submissionContext,
        "Existing task context:",
        existingTaskLines,
        "Submission:",
        request.content,
      ].join("\n\n")

      const extractorSelection = getAiModelForPlan(
        "feedbackExtractor",
        planStatus.currentPlanId
      )

      let extracted: z.infer<typeof extractedFeedbackTasksSchema>
      let extractorUsage:
        | { inputTokens?: number; outputTokens?: number }
        | undefined
      try {
        const extractorResult = await generateText({
          model: extractorSelection.model,
          system: extractorSystem,
          prompt: extractorPrompt,
          experimental_output: Output.object({
            schema: extractedFeedbackTasksSchema,
          }),
        })
        extracted = extractorResult.experimental_output
        extractorUsage = extractorResult.usage
      } catch (extractorError) {
        console.error(
          "[api-feedback] Extractor returned invalid output",
          extractorError
        )
        await ctx.runMutation(
          internal.feedbackApi.updateApiFeedbackRequestStatus,
          {
            requestId: args.requestId,
            status: "failed",
            errorMessage:
              extractorError instanceof Error
                ? extractorError.message
                : String(extractorError),
            cost: totalAiCost > 0 ? totalAiCost : undefined,
          }
        )
        return
      }

      const extractorCost = getAiCostForTokens({
        model: extractorSelection.modelId,
        inputTokens: extractorUsage?.inputTokens,
        outputTokens: extractorUsage?.outputTokens,
      })
      totalAiCost += extractorCost

      await ctx.runAction(internal.billingTracking.trackAiUsage, {
        workspaceId: workspace._id,
        workspaceName: workspace.name,
        model: extractorSelection.modelId,
        inputTokens: extractorUsage?.inputTokens,
        outputTokens: extractorUsage?.outputTokens,
        properties: {
          feature: "api_feedback_extractor",
          request_id: args.requestId,
        },
      })

      const extractedActions = extracted.actions.slice(
        0,
        MAX_EXTRACTED_TASK_ACTIONS
      )

      if (extractedActions.length === 0) {
        await ctx.runMutation(
          internal.feedbackApi.updateApiFeedbackRequestStatus,
          {
            requestId: args.requestId,
            status: "completed",
            createdTaskIds: [],
            updatedTaskIds: [],
            cost: totalAiCost > 0 ? totalAiCost : undefined,
          }
        )
        return
      }

      const sourceUrlForTask = request.sourceUrl ?? ""
      const authorForTask = request.author ?? "api"

      const result = (await ctx.runMutation(
        internal.tasks.createTasksFromApiFeedbackInternal,
        {
          workspaceId: workspace._id,
          operations: extractedActions.map((action) =>
            action.action === "create"
              ? {
                  action: "create" as const,
                  task: {
                    title: action.title,
                    description: action.description ?? undefined,
                    status: "requests" as const,
                    priority: action.priority ?? "none",
                    labels: action.labels
                      .slice(0, MAX_EXTRACTED_TASK_LABELS)
                      .filter((label) =>
                        workspace.availableLabels.includes(label)
                      ),
                    source: {
                      platform: "api" as const,
                      url: sourceUrlForTask,
                      author: authorForTask,
                    },
                  },
                }
              : {
                  action: "update" as const,
                  taskCode: action.taskCode,
                  title: action.title,
                  description: action.description ?? undefined,
                  priority: action.priority ?? undefined,
                  labels: action.labels
                    .slice(0, MAX_EXTRACTED_TASK_LABELS)
                    .filter((label) =>
                      workspace.availableLabels.includes(label)
                    ),
                }
          ),
          cost: totalAiCost > 0 ? totalAiCost : undefined,
        }
      )) as { createdTaskIds: Id<"tasks">[]; updatedTaskIds: Id<"tasks">[] }

      await ctx.runMutation(internal.feedbackApi.updateApiFeedbackRequestStatus, {
        requestId: args.requestId,
        status: "completed",
        createdTaskIds: result.createdTaskIds,
        updatedTaskIds: result.updatedTaskIds,
        cost: totalAiCost > 0 ? totalAiCost : undefined,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown processing error"
      console.error("[api-feedback] Processing failed", error)
      await ctx.runMutation(internal.feedbackApi.updateApiFeedbackRequestStatus, {
        requestId: args.requestId,
        status: "failed",
        errorMessage: message,
        cost: totalAiCost > 0 ? totalAiCost : undefined,
      })
    }
  },
})

export const drainPendingApiFeedback = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100
    const pending = await ctx.db
      .query("apiFeedbackRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(limit)

    for (const row of pending) {
      await ctx.scheduler.runAfter(0, internal.feedbackApi.processApiFeedback, {
        requestId: row._id,
      })
    }

    return { scheduled: pending.length }
  },
})
