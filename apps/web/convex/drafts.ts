import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { Id, Doc } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import { requireTaskWriteAccess, requireWorkspaceAccess } from "./permissions"
import { insertWorkspaceLog } from "./logs"
import { clearLinearTaskLink, clearGitHubTaskLink } from "./tasks"

const draftStatusValidator = v.union(
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("ready"),
  v.literal("shipped"),
  v.literal("archive")
)

const draftPriorityValidator = v.union(
  v.literal("urgent"),
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
  v.literal("none")
)

const attachmentValidator = v.object({
  storageId: v.id("_storage"),
  name: v.string(),
  type: v.string(),
  size: v.number(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  displayWidth: v.optional(v.number()),
})

function normalizeTitleFingerprint(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

async function addDraftSourceSuppression(
  ctx: MutationCtx,
  args: {
    draftId: Id<"drafts">
    workspaceId: Id<"workspaces">
    platform: Doc<"deletedTaskSources">["platform"]
    sourceUrl: string
    titleFingerprint: string
  }
) {
  const sourceUrl = args.sourceUrl.trim()
  if (!sourceUrl) {
    return
  }

  const existing = await ctx.db
    .query("draftSuppressedTaskSources")
    .withIndex("by_workspace_source", (q) =>
      q
        .eq("workspaceId", args.workspaceId)
        .eq("platform", args.platform)
        .eq("sourceUrl", sourceUrl)
    )
    .filter((q) =>
      q.and(
        q.eq(q.field("draftId"), args.draftId),
        q.eq(q.field("titleFingerprint"), args.titleFingerprint)
      )
    )
    .first()

  if (existing) {
    await ctx.db.patch(existing._id, {
      suppressedAt: Date.now(),
    })
    return
  }

  await ctx.db.insert("draftSuppressedTaskSources", {
    draftId: args.draftId,
    workspaceId: args.workspaceId,
    platform: args.platform,
    sourceUrl,
    titleFingerprint: args.titleFingerprint,
    suppressedAt: Date.now(),
  })
}

async function listDraftSourceSuppressions(
  ctx: MutationCtx,
  draftId: Id<"drafts">
) {
  return await ctx.db
    .query("draftSuppressedTaskSources")
    .withIndex("by_draft", (q) => q.eq("draftId", draftId))
    .collect()
}

async function clearDraftSourceSuppressions(
  ctx: MutationCtx,
  draftId: Id<"drafts">
) {
  const suppressions = await listDraftSourceSuppressions(ctx, draftId)
  for (const suppression of suppressions) {
    await ctx.db.delete(suppression._id)
  }
}

async function persistDraftSourceSuppressions(
  ctx: MutationCtx,
  draftId: Id<"drafts">
) {
  const suppressions = await listDraftSourceSuppressions(ctx, draftId)

  for (const suppression of suppressions) {
    const existing = await ctx.db
      .query("deletedTaskSources")
      .withIndex("by_workspace_source_title", (q) =>
        q
          .eq("workspaceId", suppression.workspaceId)
          .eq("platform", suppression.platform)
          .eq("sourceUrl", suppression.sourceUrl)
          .eq("titleFingerprint", suppression.titleFingerprint)
      )
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        deletedAt: Date.now(),
      })
    } else {
      await ctx.db.insert("deletedTaskSources", {
        workspaceId: suppression.workspaceId,
        platform: suppression.platform,
        sourceUrl: suppression.sourceUrl,
        titleFingerprint: suppression.titleFingerprint,
        deletedAt: Date.now(),
      })
    }

    await ctx.db.delete(suppression._id)
  }
}

async function restoreLinearTaskLinkFromDraft(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">
    taskId: Id<"tasks">
    linearLink: NonNullable<Doc<"drafts">["linearLink"]>
  }
) {
  const existingByTask = await ctx.db
    .query("linearTaskLinks")
    .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
    .unique()
  const existingByIssue = await ctx.db
    .query("linearTaskLinks")
    .withIndex("by_linear_issue", (q) =>
      q.eq("linearIssueId", args.linearLink.linearIssueId)
    )
    .unique()

  const payload = {
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    linearIssueId: args.linearLink.linearIssueId,
    linearIssueIdentifier: args.linearLink.linearIssueIdentifier,
    linearIssueUrl: args.linearLink.linearIssueUrl,
    lastLinearUpdatedAt: args.linearLink.lastLinearUpdatedAt,
    lastSyncedAt: 0,
  }

  if (
    existingByTask &&
    existingByIssue &&
    existingByTask._id !== existingByIssue._id
  ) {
    await ctx.db.delete(existingByIssue._id)
  }

  if (existingByTask) {
    await ctx.db.patch(existingByTask._id, payload)
    return
  }

  if (existingByIssue) {
    await ctx.db.patch(existingByIssue._id, payload)
    return
  }

  await ctx.db.insert("linearTaskLinks", payload)
}

async function restoreGitHubTaskLinkFromDraft(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">
    taskId: Id<"tasks">
    githubLink: NonNullable<Doc<"drafts">["githubLink"]>
  }
) {
  const existingByTask = await ctx.db
    .query("githubTaskLinks")
    .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
    .unique()
  const existingByIssue = await ctx.db
    .query("githubTaskLinks")
    .withIndex("by_github_issue", (q) =>
      q.eq("githubIssueId", args.githubLink.githubIssueId)
    )
    .unique()

  const payload = {
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    installationId: args.githubLink.installationId,
    githubRepositoryId: args.githubLink.githubRepositoryId,
    githubRepositoryName: args.githubLink.githubRepositoryName,
    githubRepositoryFullName: args.githubLink.githubRepositoryFullName,
    githubIssueId: args.githubLink.githubIssueId,
    githubIssueNumber: args.githubLink.githubIssueNumber,
    githubIssueUrl: args.githubLink.githubIssueUrl,
    lastGithubUpdatedAt: args.githubLink.lastGithubUpdatedAt,
    lastSyncedAt: 0,
  }

  if (
    existingByTask &&
    existingByIssue &&
    existingByTask._id !== existingByIssue._id
  ) {
    await ctx.db.delete(existingByIssue._id)
  }

  if (existingByTask) {
    await ctx.db.patch(existingByTask._id, payload)
    return
  }

  if (existingByIssue) {
    await ctx.db.patch(existingByIssue._id, payload)
    return
  }

  await ctx.db.insert("githubTaskLinks", payload)
}

async function queueLinearSync(ctx: MutationCtx, taskId: Id<"tasks">) {
  await ctx.scheduler.runAfter(0, internal.linear.syncTaskToLinearIssue, {
    taskId,
  })
}

async function queueGitHubSync(ctx: MutationCtx, taskId: Id<"tasks">) {
  await ctx.scheduler.runAfter(0, internal.github.syncTaskToGitHubIssue, {
    taskId,
  })
}

async function adjustWorkspaceDraftCount(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  delta: number
) {
  const workspace = await ctx.db.get(workspaceId)
  if (!workspace) {
    return
  }

  const currentCount =
    typeof workspace.draftCount === "number"
      ? workspace.draftCount
      : (
          await ctx.db
            .query("drafts")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
            .collect()
        ).length

  await ctx.db.patch(workspaceId, {
    draftCount: Math.max(0, currentCount + delta),
  })
}

// ── Queries ──

export const listDrafts = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId)
    const drafts = await ctx.db
      .query("drafts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()
    return drafts.sort((a, b) => b.updatedAt - a.updatedAt)
  },
})

export const getDraft = query({
  args: { draftId: v.id("drafts") },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId)
    if (!draft) return null
    await requireWorkspaceAccess(ctx, draft.workspaceId)
    return draft
  },
})

export const getDraftCount = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId)
    const workspace = await ctx.db.get(args.workspaceId)
    if (typeof workspace?.draftCount === "number") {
      return workspace.draftCount
    }

    const drafts = await ctx.db
      .query("drafts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()
    return drafts.length
  },
})

// ── Mutations ──

export const saveDraft = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    title: v.string(),
    description: v.optional(v.string()),
    status: draftStatusValidator,
    priority: draftPriorityValidator,
    labels: v.array(v.string()),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, args) => {
    await requireTaskWriteAccess(ctx, args.workspaceId)
    const now = Date.now()
    const draftId = await ctx.db.insert("drafts", {
      workspaceId: args.workspaceId,
      title: args.title.trim(),
      description: args.description?.trim() || undefined,
      status: args.status,
      priority: args.priority,
      labels: args.labels,
      updatedAt: now,
      attachments: args.attachments ?? undefined,
    })
    await adjustWorkspaceDraftCount(ctx, args.workspaceId, 1)
    return draftId
  },
})

export const updateDraft = mutation({
  args: {
    draftId: v.id("drafts"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(draftStatusValidator),
    priority: v.optional(draftPriorityValidator),
    labels: v.optional(v.array(v.string())),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId)
    if (!draft) throw new Error("Draft not found")
    await requireTaskWriteAccess(ctx, draft.workspaceId)

    const updates: Record<string, unknown> = { updatedAt: Date.now() }
    if (args.title !== undefined) updates.title = args.title.trim()
    if (args.description !== undefined)
      updates.description = args.description.trim() || undefined
    if (args.status !== undefined) updates.status = args.status
    if (args.priority !== undefined) updates.priority = args.priority
    if (args.labels !== undefined) updates.labels = args.labels
    if (args.attachments !== undefined) updates.attachments = args.attachments

    await ctx.db.patch(args.draftId, updates)
  },
})

export const deleteDraft = mutation({
  args: { draftId: v.id("drafts") },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId)
    if (!draft) throw new Error("Draft not found")
    await requireTaskWriteAccess(ctx, draft.workspaceId)

    if (draft.githubLink) {
      await ctx.scheduler.runAfter(0, internal.github.closeLinkedGitHubIssue, {
        workspaceId: draft.workspaceId,
        githubRepositoryFullName: draft.githubLink.githubRepositoryFullName,
        githubIssueNumber: draft.githubLink.githubIssueNumber,
      })
    }

    if (draft.linearLink) {
      await ctx.scheduler.runAfter(0, internal.linear.deleteLinearIssue, {
        workspaceId: draft.workspaceId,
        linearIssueId: draft.linearLink.linearIssueId,
      })
    }

    await persistDraftSourceSuppressions(ctx, args.draftId)
    await adjustWorkspaceDraftCount(ctx, draft.workspaceId, -1)
    await ctx.db.delete(args.draftId)
  },
})

export const publishDraft = mutation({
  args: { draftId: v.id("drafts") },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId)
    if (!draft) throw new Error("Draft not found")
    await requireTaskWriteAccess(ctx, draft.workspaceId)

    const workspace = await ctx.db.get(draft.workspaceId)
    if (!workspace) throw new Error("Workspace not found")

    const now = Date.now()

    // Get existing tasks for ordering
    const existingTasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", draft.workspaceId))
      .collect()

    const baseTaskNumber = Math.max(
      workspace.taskCounter ?? 0,
      ...existingTasks.map((t) => t.taskNumber)
    )
    const nextTaskNumber = baseTaskNumber + 1

    let maxOrder = 0
    for (const task of existingTasks) {
      if (task.status === draft.status) {
        maxOrder = Math.max(maxOrder, task.order + 1)
      }
    }

    const taskId = await ctx.db.insert("tasks", {
      workspaceId: draft.workspaceId,
      taskCode: `${workspace.prefix || "MED"}-${nextTaskNumber}`,
      taskNumber: nextTaskNumber,
      title: draft.title,
      description: draft.description,
      status: draft.status,
      priority: draft.priority,
      labels: draft.labels,
      order: maxOrder,
      project: workspace.name,
      updatedAt: now,
      assignee: { name: "Abdul", avatar: "" },
      source: draft.source,
      sources:
        draft.sources && draft.sources.length > 0
          ? draft.sources
          : draft.source
            ? [draft.source]
            : undefined,
      attachments: draft.attachments,
    })

    if (draft.linearLink) {
      await restoreLinearTaskLinkFromDraft(ctx, {
        workspaceId: draft.workspaceId,
        taskId,
        linearLink: draft.linearLink,
      })
    }

    if (draft.githubLink) {
      await restoreGitHubTaskLinkFromDraft(ctx, {
        workspaceId: draft.workspaceId,
        taskId,
        githubLink: draft.githubLink,
      })
    }

    await ctx.db.patch(draft.workspaceId, {
      taskCounter: nextTaskNumber,
    })

    await clearDraftSourceSuppressions(ctx, args.draftId)
    await adjustWorkspaceDraftCount(ctx, draft.workspaceId, -1)

    // Log and sync integrations
    const task = await ctx.db.get(taskId)
    if (task) {
      await insertWorkspaceLog(ctx, {
        workspaceId: draft.workspaceId,
        category: "tasks",
        type: "task_created",
        message: `Published draft "${task.title}" as ${task.taskCode}`,
        source: "manual",
      })
      await queueLinearSync(ctx, task._id)
      await queueGitHubSync(ctx, task._id)
    }

    // Delete the draft
    await ctx.db.delete(args.draftId)

    return taskId
  },
})

export const moveTaskToDraft = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId)
    if (!task) throw new Error("Task not found")
    await requireTaskWriteAccess(ctx, task.workspaceId)

    const now = Date.now()
    const [linearLink, githubLink] = await Promise.all([
      ctx.db
        .query("linearTaskLinks")
        .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
        .unique(),
      ctx.db
        .query("githubTaskLinks")
        .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
        .unique(),
    ])

    // Create draft from task data
    const draftId = await ctx.db.insert("drafts", {
      workspaceId: task.workspaceId,
      title: task.title,
      description: task.description,
      status: task.status === "requests" ? "todo" : task.status,
      priority: task.priority,
      labels: task.labels,
      source: task.source,
      sources: task.sources,
      linearLink: linearLink
        ? {
            linearIssueId: linearLink.linearIssueId,
            linearIssueIdentifier: linearLink.linearIssueIdentifier,
            linearIssueUrl: linearLink.linearIssueUrl,
            lastLinearUpdatedAt: linearLink.lastLinearUpdatedAt,
          }
        : undefined,
      githubLink: githubLink
        ? {
            installationId: githubLink.installationId,
            githubRepositoryId: githubLink.githubRepositoryId,
            githubRepositoryName: githubLink.githubRepositoryName,
            githubRepositoryFullName: githubLink.githubRepositoryFullName,
            githubIssueId: githubLink.githubIssueId,
            githubIssueNumber: githubLink.githubIssueNumber,
            githubIssueUrl: githubLink.githubIssueUrl,
            lastGithubUpdatedAt: githubLink.lastGithubUpdatedAt,
          }
        : undefined,
      updatedAt: now,
      attachments: task.attachments,
    })
    await adjustWorkspaceDraftCount(ctx, task.workspaceId, 1)

    const titleFingerprint = normalizeTitleFingerprint(task.title)
    const suppressedSources = new Map<
      string,
      {
        platform: Doc<"deletedTaskSources">["platform"]
        sourceUrl: string
      }
    >()
    const recordSuppressedSource = (
      platform: Doc<"deletedTaskSources">["platform"] | undefined,
      sourceUrl: string | undefined
    ) => {
      const normalizedUrl = sourceUrl?.trim()
      if (!platform || !normalizedUrl) {
        return
      }

      suppressedSources.set(`${platform}:${normalizedUrl}`, {
        platform,
        sourceUrl: normalizedUrl,
      })
    }

    recordSuppressedSource(task.source?.platform, task.source?.url)
    for (const source of task.sources ?? []) {
      recordSuppressedSource(source.platform, source.url)
    }
    recordSuppressedSource("linear", linearLink?.linearIssueUrl)
    recordSuppressedSource("github", githubLink?.githubIssueUrl)

    for (const suppression of suppressedSources.values()) {
      await addDraftSourceSuppression(ctx, {
        draftId,
        workspaceId: task.workspaceId,
        platform: suppression.platform,
        sourceUrl: suppression.sourceUrl,
        titleFingerprint,
      })
    }

    // Log before deleting
    await insertWorkspaceLog(ctx, {
      workspaceId: task.workspaceId,
      category: "tasks",
      type: "task_updated",
      message: `Moved ${task.taskCode} "${task.title}" to drafts`,
      source: "manual",
    })

    // Clear active links while the task is parked as a draft.
    await clearLinearTaskLink(ctx, args.taskId)
    await clearGitHubTaskLink(ctx, args.taskId)

    // Delete the task
    await ctx.db.delete(args.taskId)

    return draftId
  },
})
