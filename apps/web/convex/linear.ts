import { v } from "convex/values"
import {
  action,
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { internal } from "./_generated/api"
import { insertWorkspaceLog } from "./logs"
import {
  requireWorkspaceAccess,
  requireWorkspaceAdminAccess,
} from "./permissions"
import {
  DEFAULT_WORKSPACE_LABELS,
  type TaskPriority,
  type TaskStatus,
} from "../lib/task-board"

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql"
const LINEAR_MEDIAN_TITLE_PREFIX = "[MDN]"
const LINEAR_MEDIAN_TITLE_PREFIX_REGEX = /^\[MDN\]\s*/
const LINEAR_MAPPABLE_STATUSES: TaskStatus[] = [
  "requests",
  "todo",
  "in_progress",
  "ready",
  "shipped",
  "archive",
]

type LinearViewer = {
  id: string
  name: string | null
  email: string | null
}

type LinearTeam = {
  id: string
  name: string
  key: string | null
}

type LinearWorkflowState = {
  id: string
  name: string
  type: string
  position: number | null
}

type LinearIssueLabel = {
  id: string
  name: string
  color: string | null
}

type LinearIssue = {
  id: string
  identifier: string
  title: string
  description: string | null
  url: string | null
  priority: number | null
  labels: LinearIssueLabel[]
  archivedAt?: string | null
  createdAt: string
  updatedAt: string
  state: {
    id: string
    name: string
    type: string
  } | null
}

type LinearWebhookPayload = {
  action?: string
  type?: string
  data?: {
    id?: string
  }
}

type LinearStatusMappings = Partial<Record<TaskStatus, string>>

const linearIssueValidator = v.object({
  id: v.string(),
  identifier: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  url: v.optional(v.string()),
  priority: v.optional(v.number()),
  labels: v.optional(
    v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        color: v.optional(v.string()),
      })
    )
  ),
  createdAt: v.string(),
  updatedAt: v.string(),
  state: v.optional(
    v.object({
      id: v.string(),
      name: v.string(),
      type: v.string(),
    })
  ),
})

const linearStatusMappingsValidator = v.object({
  requests: v.optional(v.string()),
  todo: v.optional(v.string()),
  in_progress: v.optional(v.string()),
  ready: v.optional(v.string()),
  shipped: v.optional(v.string()),
  archive: v.optional(v.string()),
})

function getCanonicalTaskSourceKey(source: {
  platform: "discord" | "slack" | "x" | "linear" | "github" | "cli"
  url: string
  author: string
}) {
  const normalizedUrl = source.url.trim()
  // For Linear, use author (issue identifier) as the key to prevent duplicates
  // when URLs change (e.g., issue moved between projects). The identifier is stable.
  if (source.platform === "linear") {
    return `linear:${source.author.trim()}`
  }
  // For GitHub, use URL as the key since URLs are stable for issues/PRs
  if (normalizedUrl && source.platform === "github") {
    return `${source.platform}:${normalizedUrl}`
  }

  return `${source.platform}:${normalizedUrl}:${source.author.trim()}`
}

function normalizeTitle(value: string) {
  return stripMedianTaskTitlePrefixFromLinear(value)
    .replace(/\s+/g, " ")
    .toLowerCase()
}

function formatMedianTaskTitleForLinear(title: string) {
  const stripped = stripMedianTaskTitlePrefixFromLinear(title)
  if (!stripped) {
    return LINEAR_MEDIAN_TITLE_PREFIX
  }

  return `${LINEAR_MEDIAN_TITLE_PREFIX} ${stripped}`
}

function stripMedianTaskTitlePrefixFromLinear(title: string) {
  const trimmed = title.trim()
  if (LINEAR_MEDIAN_TITLE_PREFIX_REGEX.test(trimmed)) {
    return trimmed.replace(LINEAR_MEDIAN_TITLE_PREFIX_REGEX, "").trim()
  }

  return trimmed
}

function getMedianTaskTitleFromLinearIssue(issueTitle: string) {
  const stripped = stripMedianTaskTitlePrefixFromLinear(issueTitle)
  return stripped || issueTitle.trim()
}

function mergeTaskSources(
  existingSources:
    | Array<{
        platform: "discord" | "slack" | "x" | "linear" | "github" | "cli"
        url: string
        author: string
      }>
    | undefined,
  nextSource:
    | {
        platform: "discord" | "slack" | "x" | "linear" | "github" | "cli"
        url: string
        author: string
      }
    | undefined
) {
  // Compute the canonical key for the incoming source so we can replace
  // any stale existing entry that shares the same key (e.g. same URL but
  // outdated author after a Linear issue moves between projects).
  const nextKey = nextSource ? getCanonicalTaskSourceKey(nextSource) : null

  const seen = new Set<string>()
  const merged: Array<{
    platform: "discord" | "slack" | "x" | "linear" | "github" | "cli"
    url: string
    author: string
  }> = []

  for (const source of existingSources ?? []) {
    const key = getCanonicalTaskSourceKey(source)
    if (seen.has(key) || key === nextKey) continue
    seen.add(key)
    merged.push(source)
  }

  // Append the canonical source last so it always wins.
  if (nextSource) {
    merged.push(nextSource)
  }

  return merged.length > 0 ? merged : undefined
}

function maskApiKey(apiKey: string) {
  if (apiKey.length <= 8) return "********"
  return `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`
}

function formatCreatedAtLabel(createdAt: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(createdAt))
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function normalizeTaskLabelName(value: string) {
  return value.trim().toLowerCase()
}

function normalizeTaskLabels(labels: string[] | undefined) {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const label of labels ?? []) {
    const next = normalizeTaskLabelName(label)
    if (!next || seen.has(next)) continue
    seen.add(next)
    normalized.push(next)
  }

  return normalized
}

function buildWorkspaceLabelColorMap(
  workspaceLabels:
    | {
        name: string
        color: string
      }[]
    | undefined
) {
  const colorMap = new Map<string, string>()

  for (const label of workspaceLabels ?? DEFAULT_WORKSPACE_LABELS) {
    const key = normalizeTaskLabelName(label.name)
    if (!key || colorMap.has(key)) continue
    colorMap.set(key, label.color)
  }

  return colorMap
}

function mapLinearLabelsToTaskLabels(labels: LinearIssueLabel[]) {
  return normalizeTaskLabels(labels.map((label) => label.name))
}

async function isDeletedLinearTaskSource(
  ctx: { db: any },
  workspaceId: Id<"workspaces">,
  sourceUrl: string
) {
  const suppression = await ctx.db
    .query("deletedTaskSources")
    .withIndex("by_workspace_source", (q: any) =>
      q
        .eq("workspaceId", workspaceId)
        .eq("platform", "linear")
        .eq("sourceUrl", sourceUrl)
    )
    .first()

  return Boolean(suppression)
}

function normalizeStatusMappings(
  statusMappings: LinearStatusMappings | null | undefined
): LinearStatusMappings {
  const normalized: LinearStatusMappings = {}

  for (const status of LINEAR_MAPPABLE_STATUSES) {
    const stateId = statusMappings?.[status]?.trim()
    if (stateId) {
      normalized[status] = stateId
    }
  }

  return normalized
}

function buildDefaultStatusMappings(states: LinearWorkflowState[]) {
  return normalizeStatusMappings({
    requests: pickDefaultWorkflowStateId(states, "requests"),
    todo: pickDefaultWorkflowStateId(states, "todo"),
    in_progress: pickDefaultWorkflowStateId(states, "in_progress"),
    ready: pickDefaultWorkflowStateId(states, "ready"),
    shipped: pickDefaultWorkflowStateId(states, "shipped"),
    archive: pickDefaultWorkflowStateId(states, "archive"),
  })
}

function assertUniqueStatusMappings(statusMappings: LinearStatusMappings) {
  const seenStateIds = new Map<string, TaskStatus>()

  for (const status of LINEAR_MAPPABLE_STATUSES) {
    const stateId = statusMappings[status]
    if (!stateId) continue

    const existingStatus = seenStateIds.get(stateId)
    if (existingStatus) {
      throw new Error(
        "Each Median status must map to a different Linear workflow state"
      )
    }

    seenStateIds.set(stateId, status)
  }
}

function mapLinearPriorityToTask(
  priority: number | null | undefined
): TaskPriority {
  switch (priority) {
    case 1:
      return "urgent"
    case 2:
      return "high"
    case 3:
      return "medium"
    case 4:
      return "low"
    default:
      return "none"
  }
}

function mapTaskPriorityToLinear(priority: TaskPriority) {
  switch (priority) {
    case "urgent":
      return 1
    case "high":
      return 2
    case "medium":
      return 3
    case "low":
      return 4
    case "none":
      return 0
  }
}

function mapLinearStateToDefaultTaskStatus(issue: LinearIssue): TaskStatus {
  const stateType = issue.state?.type?.toLowerCase()
  const stateName = issue.state?.name?.toLowerCase() ?? ""

  if (stateType === "completed") return "shipped"
  if (stateType === "canceled") return "archive"
  if (stateType === "backlog" || stateType === "triage") return "requests"
  if (stateType === "unstarted") return "todo"
  if (stateType === "started" && stateName.includes("review")) return "ready"
  if (stateType === "started") return "in_progress"

  return "todo"
}

function mapLinearStateToTaskStatus(
  issue: LinearIssue,
  statusMappings?: LinearStatusMappings | null
): TaskStatus {
  const stateId = issue.state?.id
  if (stateId) {
    for (const status of LINEAR_MAPPABLE_STATUSES) {
      if (statusMappings?.[status] === stateId) {
        return status
      }
    }
  }

  return mapLinearStateToDefaultTaskStatus(issue)
}

function sortWorkflowStates(states: LinearWorkflowState[]) {
  return [...states].sort((a, b) => {
    const aPosition = a.position ?? Number.MAX_SAFE_INTEGER
    const bPosition = b.position ?? Number.MAX_SAFE_INTEGER
    if (aPosition !== bPosition) return aPosition - bPosition
    return a.name.localeCompare(b.name)
  })
}

function pickDefaultWorkflowStateId(
  states: LinearWorkflowState[],
  status: TaskStatus
) {
  const sorted = sortWorkflowStates(states)
  const findByType = (type: string) =>
    sorted.find((state) => state.type.toLowerCase() === type)?.id
  const findReview = () =>
    sorted.find(
      (state) =>
        state.type.toLowerCase() === "started" &&
        state.name.toLowerCase().includes("review")
    )?.id

  switch (status) {
    case "requests":
      return (
        findByType("backlog") ?? findByType("triage") ?? findByType("unstarted")
      )
    case "todo":
      return (
        findByType("unstarted") ?? findByType("backlog") ?? findByType("triage")
      )
    case "in_progress":
      return findByType("started") ?? findByType("unstarted")
    case "ready":
      return findReview() ?? findByType("started") ?? findByType("unstarted")
    case "shipped":
      return findByType("completed")
    case "archive":
      return findByType("canceled") ?? findByType("completed")
  }
}

function pickWorkflowStateId(
  states: LinearWorkflowState[],
  status: TaskStatus,
  statusMappings?: LinearStatusMappings | null
) {
  const configuredStateId = statusMappings?.[status]
  if (
    configuredStateId &&
    states.some((state) => state.id === configuredStateId)
  ) {
    return configuredStateId
  }

  return pickDefaultWorkflowStateId(states, status)
}

async function linearGraphql<T>(
  apiKey: string,
  queryString: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(LINEAR_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({
      query: queryString,
      variables,
    }),
  })

  const rawBody = await response.text()
  let body: {
    data?: T
    errors?: { message?: string }[]
  } = {}

  if (rawBody) {
    try {
      body = (JSON.parse(rawBody) as {
        data?: T
        errors?: { message?: string }[]
      }) ?? { data: undefined, errors: undefined }
    } catch {
      body = {}
    }
  }

  if (!response.ok) {
    const message =
      body.errors
        ?.map((error) => error.message ?? "Unknown Linear error")
        .join("; ") ||
      rawBody ||
      `HTTP ${response.status}`
    throw new Error(`Linear request failed with ${response.status}: ${message}`)
  }

  if (body.errors?.length) {
    throw new Error(
      body.errors
        .map((error) => error.message ?? "Unknown Linear error")
        .join("; ")
    )
  }

  if (!body.data) {
    throw new Error("Linear returned no data")
  }

  return body.data
}

async function fetchViewerAndTeams(apiKey: string) {
  const data = await linearGraphql<{
    viewer: LinearViewer
    teams: {
      nodes: LinearTeam[]
    }
  }>(
    apiKey,
    `
      query PreviewLinearTeams {
        viewer {
          id
          name
          email
        }
        teams {
          nodes {
            id
            name
            key
          }
        }
      }
    `
  )

  return {
    viewer: data.viewer,
    teams: data.teams.nodes,
  }
}

async function fetchWorkflowStates(apiKey: string, teamId: string) {
  const data = await linearGraphql<{
    team: {
      states: {
        nodes: LinearWorkflowState[]
      }
    } | null
  }>(
    apiKey,
    `
      query TeamWorkflowStates($teamId: String!) {
        team(id: $teamId) {
          states {
            nodes {
              id
              name
              type
              position
            }
          }
        }
      }
    `,
    { teamId }
  )

  if (!data.team) {
    throw new Error("Linear team not found while loading workflow states")
  }

  return data.team.states.nodes
}

async function fetchIssueById(apiKey: string, issueId: string) {
  const data = await linearGraphql<{
    issue:
      | (Omit<LinearIssue, "labels"> & {
          labels?: {
            nodes: LinearIssueLabel[]
          }
        })
      | null
  }>(
    apiKey,
    `
      query LinearIssue($issueId: String!) {
        issue(id: $issueId) {
          id
          identifier
          title
          description
          url
          priority
          labels {
            nodes {
              id
              name
              color
            }
          }
          archivedAt
          createdAt
          updatedAt
          state {
            id
            name
            type
          }
        }
      }
    `,
    { issueId }
  )

  return data.issue
    ? {
        ...data.issue,
        labels: data.issue.labels?.nodes ?? [],
      }
    : null
}

async function issueUnarchive(apiKey: string, issueId: string) {
  const data = await linearGraphql<{
    issueUnarchive: {
      success: boolean
    }
  }>(
    apiKey,
    `
      mutation UnarchiveIssue($issueId: String!) {
        issueUnarchive(id: $issueId) {
          success
        }
      }
    `,
    {
      issueId,
    }
  )

  if (!data.issueUnarchive.success) {
    throw new Error("Failed to unarchive the Linear issue")
  }
}

async function fetchTeamIssues(apiKey: string, teamId: string) {
  const issues: LinearIssue[] = []
  let after: string | null = null

  do {
    const result: {
      team: {
        issues: {
          nodes: Array<
            Omit<LinearIssue, "labels"> & {
              labels?: {
                nodes: LinearIssueLabel[]
              }
            }
          >
          pageInfo: {
            hasNextPage: boolean
            endCursor: string | null
          }
        }
      } | null
    } = await linearGraphql(
      apiKey,
      `
        query TeamIssues($teamId: String!, $after: String) {
          team(id: $teamId) {
            issues(first: 100, after: $after, includeArchived: false) {
              nodes {
                id
                identifier
                title
                description
                url
                priority
                labels {
                  nodes {
                    id
                    name
                    color
                  }
                }
                createdAt
                updatedAt
                state {
                  id
                  name
                  type
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `,
      {
        teamId,
        after,
      }
    )

    if (!result.team) {
      throw new Error("Linear team not found")
    }

    issues.push(
      ...result.team.issues.nodes.map((issue) => ({
        ...issue,
        labels: issue.labels?.nodes ?? [],
      }))
    )
    after = result.team.issues.pageInfo.hasNextPage
      ? result.team.issues.pageInfo.endCursor
      : null
  } while (after)

  return issues
}

async function fetchTeamLabels(apiKey: string, teamId: string) {
  const data = await linearGraphql<{
    team: {
      labels: {
        nodes: LinearIssueLabel[]
      }
    } | null
  }>(
    apiKey,
    `
      query TeamLabels($teamId: String!) {
        team(id: $teamId) {
          labels(first: 250) {
            nodes {
              id
              name
              color
            }
          }
        }
      }
    `,
    { teamId }
  )

  if (!data.team) {
    throw new Error("Linear team not found while loading labels")
  }

  return data.team.labels.nodes
}

async function issueLabelCreate(
  apiKey: string,
  input: {
    teamId: string
    name: string
    color?: string
  }
) {
  const data = await linearGraphql<{
    issueLabelCreate: {
      success: boolean
      issueLabel: LinearIssueLabel | null
    }
  }>(
    apiKey,
    `
      mutation CreateIssueLabel($input: IssueLabelCreateInput!) {
        issueLabelCreate(input: $input) {
          success
          issueLabel {
            id
            name
            color
          }
        }
      }
    `,
    { input }
  )

  if (!data.issueLabelCreate.success || !data.issueLabelCreate.issueLabel) {
    throw new Error("Failed to create the Linear issue label")
  }

  return data.issueLabelCreate.issueLabel
}

async function createWebhook(apiKey: string, teamId: string, url: string) {
  const data = await linearGraphql<{
    webhookCreate: {
      success: boolean
      webhook: {
        id: string
        enabled: boolean
      } | null
    }
  }>(
    apiKey,
    `
      mutation CreateLinearWebhook($teamId: String!, $url: String!) {
        webhookCreate(
          input: {
            teamId: $teamId
            url: $url
            resourceTypes: ["Issue"]
          }
        ) {
          success
          webhook {
            id
            enabled
          }
        }
      }
    `,
    {
      teamId,
      url,
    }
  )

  if (!data.webhookCreate.success || !data.webhookCreate.webhook?.id) {
    throw new Error("Failed to create the Linear webhook")
  }

  return data.webhookCreate.webhook.id
}

async function deleteWebhook(apiKey: string, webhookId: string) {
  await linearGraphql(
    apiKey,
    `
      mutation DeleteLinearWebhook($id: String!) {
        webhookDelete(id: $id) {
          success
        }
      }
    `,
    {
      id: webhookId,
    }
  )
}

async function issueCreate(
  apiKey: string,
  input: {
    teamId: string
    title: string
    description?: string
    priority: number
    labelIds: string[]
    stateId?: string
  }
) {
  const data = await linearGraphql<{
    issueCreate: {
      success: boolean
      issue: {
        id: string
        identifier: string
        url: string | null
        updatedAt: string
      } | null
    }
  }>(
    apiKey,
    `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            url
            updatedAt
          }
        }
      }
    `,
    {
      input,
    }
  )

  if (!data.issueCreate.success || !data.issueCreate.issue) {
    throw new Error("Failed to create the Linear issue")
  }

  return data.issueCreate.issue
}

async function issueUpdate(
  apiKey: string,
  issueId: string,
  input: {
    title: string
    description?: string
    priority: number
    labelIds: string[]
    stateId?: string
  }
) {
  const data = await linearGraphql<{
    issueUpdate: {
      success: boolean
      issue: {
        id: string
        identifier: string
        url: string | null
        updatedAt: string
      } | null
    }
  }>(
    apiKey,
    `
      mutation UpdateIssue($issueId: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $issueId, input: $input) {
          success
          issue {
            id
            identifier
            url
            updatedAt
          }
        }
      }
    `,
    {
      issueId,
      input,
    }
  )

  if (!data.issueUpdate.success || !data.issueUpdate.issue) {
    throw new Error("Failed to update the Linear issue")
  }

  return data.issueUpdate.issue
}

async function issueDelete(apiKey: string, issueId: string) {
  const data = await linearGraphql<{
    issueDelete: {
      success: boolean
    }
  }>(
    apiKey,
    `
      mutation DeleteIssue($issueId: String!) {
        issueDelete(id: $issueId) {
          success
        }
      }
    `,
    {
      issueId,
    }
  )

  if (!data.issueDelete.success) {
    throw new Error("Failed to delete the Linear issue")
  }
}

function buildLinearWebhookUrl(webhookToken: string) {
  const baseUrl =
    process.env.CONVEX_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL
  if (!baseUrl) {
    throw new Error("Missing CONVEX_SITE_URL for Linear webhook registration")
  }

  return `${baseUrl.replace(/\/$/, "")}/linear/webhook?token=${encodeURIComponent(webhookToken)}`
}

async function syncTaskToLinear(
  ctx: any,
  integration: {
    _id: Id<"linearWorkspaceIntegrations">
    apiKey: string
    teamId: string
    workspaceId: Id<"workspaces">
    statusMappings?: LinearStatusMappings
  },
  task: Doc<"tasks">,
  link: Doc<"linearTaskLinks"> | null,
  workflowStates: LinearWorkflowState[]
) {
  const taskLabels = normalizeTaskLabels(task.labels)
  let labelIds: string[] = []

  if (taskLabels.length > 0) {
    const workspaceLabels = await ctx.runQuery(
      internal.linear.getWorkspaceLinearLabelDefinitions,
      {
        workspaceId: integration.workspaceId,
      }
    )
    labelIds = await resolveLinearLabelIds(
      integration.apiKey,
      integration.teamId,
      taskLabels,
      workspaceLabels
    )
  }

  const stateId = pickWorkflowStateId(
    workflowStates,
    task.status,
    integration.statusMappings
  )
  const input = {
    title: formatMedianTaskTitleForLinear(task.title),
    description: normalizeOptionalText(task.description),
    priority: mapTaskPriorityToLinear(task.priority),
    labelIds,
    stateId,
  }

  if (link) {
    const existingIssue = await fetchIssueById(
      integration.apiKey,
      link.linearIssueId
    )
    if (existingIssue?.archivedAt && task.status !== "archive") {
      await issueUnarchive(integration.apiKey, link.linearIssueId)
    }

    const updatedIssue = await issueUpdate(
      integration.apiKey,
      link.linearIssueId,
      input
    )
    await ctx.runMutation(internal.linear.saveLinearTaskLink, {
      workspaceId: integration.workspaceId,
      taskId: task._id,
      linearIssueId: updatedIssue.id,
      linearIssueIdentifier: updatedIssue.identifier,
      linearIssueUrl: updatedIssue.url ?? undefined,
      lastLinearUpdatedAt: updatedIssue.updatedAt,
    })
    return "updated" as const
  }

  const createdIssue = await issueCreate(integration.apiKey, {
    teamId: integration.teamId,
    ...input,
  })
  await ctx.runMutation(internal.linear.saveLinearTaskLink, {
    workspaceId: integration.workspaceId,
    taskId: task._id,
    linearIssueId: createdIssue.id,
    linearIssueIdentifier: createdIssue.identifier,
    linearIssueUrl: createdIssue.url ?? undefined,
    lastLinearUpdatedAt: createdIssue.updatedAt,
  })
  return "created" as const
}

async function resolveLinearLabelIds(
  apiKey: string,
  teamId: string,
  taskLabels: string[],
  workspaceLabels:
    | {
        name: string
        color: string
      }[]
    | undefined
) {
  if (taskLabels.length === 0) {
    return []
  }

  const colorMap = buildWorkspaceLabelColorMap(workspaceLabels)
  const knownLabels = new Map<string, LinearIssueLabel>()

  for (const label of await fetchTeamLabels(apiKey, teamId)) {
    knownLabels.set(normalizeTaskLabelName(label.name), label)
  }

  const labelIds: string[] = []
  for (const taskLabel of taskLabels) {
    let linearLabel = knownLabels.get(taskLabel)

    if (!linearLabel) {
      try {
        linearLabel = await issueLabelCreate(apiKey, {
          teamId,
          name: taskLabel,
          color: colorMap.get(taskLabel),
        })
      } catch {
        linearLabel = (await fetchTeamLabels(apiKey, teamId)).find(
          (label) => normalizeTaskLabelName(label.name) === taskLabel
        )
        if (!linearLabel) {
          throw new Error(`Failed to resolve Linear label "${taskLabel}"`)
        }
      }

      knownLabels.set(taskLabel, linearLabel)
    }

    labelIds.push(linearLabel.id)
  }

  return labelIds
}

export const getWorkspaceLinearIntegration = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireWorkspaceAccess(ctx, args.workspaceId)
    const integration = await ctx.db
      .query("linearWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()

    return {
      canManage: membership.role === "admin" || membership.role === "owner",
      integration: integration
        ? {
            _id: integration._id,
            teamId: integration.teamId,
            teamKey: integration.teamKey ?? null,
            teamName: integration.teamName,
            linearUserName: integration.linearUserName,
            linearUserEmail: integration.linearUserEmail ?? null,
            statusMappings: normalizeStatusMappings(integration.statusMappings),
            connectedAt: integration.connectedAt,
            lastSyncedAt: integration.lastSyncedAt ?? null,
            maskedApiKey: maskApiKey(integration.apiKey),
          }
        : null,
    }
  },
})

export const assertWorkspaceAdminAccess = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAdminAccess(ctx, args.workspaceId)
  },
})

export const getLinearIntegrationForWorkspace = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("linearWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()
  },
})

export const getWorkspaceLinearLabelDefinitions = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId)
    return workspace?.labels ?? DEFAULT_WORKSPACE_LABELS
  },
})

export const getLinearIntegrationByWebhookToken = internalQuery({
  args: {
    webhookToken: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("linearWorkspaceIntegrations")
      .withIndex("by_webhook_token", (q) =>
        q.eq("webhookToken", args.webhookToken)
      )
      .unique()
  },
})

export const getLinearIntegrationById = internalQuery({
  args: {
    integrationId: v.id("linearWorkspaceIntegrations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.integrationId)
  },
})

export const saveWorkspaceLinearIntegration = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    apiKey: v.string(),
    linearUserId: v.string(),
    linearUserName: v.string(),
    linearUserEmail: v.optional(v.string()),
    teamId: v.string(),
    teamKey: v.optional(v.string()),
    teamName: v.string(),
    statusMappings: v.optional(linearStatusMappingsValidator),
    statusMappingsUpdatedAt: v.optional(v.number()),
    webhookId: v.optional(v.string()),
    webhookToken: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("linearWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()

    const payload = {
      workspaceId: args.workspaceId,
      apiKey: args.apiKey,
      linearUserId: args.linearUserId,
      linearUserName: args.linearUserName,
      linearUserEmail: args.linearUserEmail,
      teamId: args.teamId,
      teamKey: args.teamKey,
      teamName: args.teamName,
      statusMappings: normalizeStatusMappings(args.statusMappings),
      statusMappingsUpdatedAt:
        args.statusMappingsUpdatedAt ?? existing?.statusMappingsUpdatedAt,
      webhookId: args.webhookId,
      webhookToken: args.webhookToken,
      connectedAt: existing?.connectedAt ?? Date.now(),
      lastSyncedAt: existing?.lastSyncedAt,
    }

    if (existing) {
      await ctx.db.patch(existing._id, payload)
      return existing._id
    }

    return await ctx.db.insert("linearWorkspaceIntegrations", payload)
  },
})

export const clearWorkspaceLinearIntegration = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.db
      .query("linearWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()

    if (integration) {
      await ctx.db.delete(integration._id)
    }

    const links = await ctx.db
      .query("linearTaskLinks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()

    for (const link of links) {
      // Strip the now-defunct linear source from the surviving task.
      const task = await ctx.db.get(link.taskId)
      if (task) {
        const cleaned = (task.sources ?? []).filter(
          (s) => s.platform !== "linear"
        )
        await ctx.db.patch(task._id, {
          sources: cleaned.length > 0 ? cleaned : undefined,
        })
      }
      await ctx.db.delete(link._id)
    }
  },
})

export const markLinearIntegrationSyncedAt = internalMutation({
  args: {
    integrationId: v.id("linearWorkspaceIntegrations"),
    syncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.integrationId, {
      lastSyncedAt: args.syncedAt,
    })
  },
})

export const saveWorkspaceLinearStatusMappings = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    statusMappings: linearStatusMappingsValidator,
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.db
      .query("linearWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()

    if (!integration) {
      throw new Error("Linear integration not found")
    }

    await ctx.db.patch(integration._id, {
      statusMappings: normalizeStatusMappings(args.statusMappings),
      statusMappingsUpdatedAt: args.updatedAt,
    })
  },
})

export const saveLinearTaskLink = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    taskId: v.id("tasks"),
    linearIssueId: v.string(),
    linearIssueIdentifier: v.string(),
    linearIssueUrl: v.optional(v.string()),
    lastLinearUpdatedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingByTask = await ctx.db
      .query("linearTaskLinks")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .unique()

    const existingByIssue = await ctx.db
      .query("linearTaskLinks")
      .withIndex("by_linear_issue", (q) =>
        q.eq("linearIssueId", args.linearIssueId)
      )
      .unique()

    const payload = {
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      linearIssueId: args.linearIssueId,
      linearIssueIdentifier: args.linearIssueIdentifier,
      linearIssueUrl: args.linearIssueUrl,
      lastLinearUpdatedAt: args.lastLinearUpdatedAt,
      lastSyncedAt: Date.now(),
    }

    if (
      existingByTask &&
      existingByIssue &&
      existingByTask._id !== existingByIssue._id
    ) {
      await ctx.db.delete(existingByIssue._id)
    }

    let linkId
    if (existingByTask) {
      await ctx.db.patch(existingByTask._id, payload)
      linkId = existingByTask._id
    } else if (existingByIssue) {
      await ctx.db.patch(existingByIssue._id, payload)
      linkId = existingByIssue._id
    } else {
      linkId = await ctx.db.insert("linearTaskLinks", payload)
    }

    // Denormalize: keep task.sources in sync so listByWorkspace
    // doesn't need to read the linearTaskLinks table at all.
    // Use filter-and-append (not mergeTaskSources) so the fresh
    // canonical data always replaces any stale entry with the same URL.
    const task = await ctx.db.get(args.taskId)
    if (task) {
      const canonicalSource = {
        platform: "linear" as const,
        url: args.linearIssueUrl?.trim() ?? "",
        author: args.linearIssueIdentifier,
      }
      const existing = task.sources ?? (task.source ? [task.source] : [])
      const canonicalUrl = canonicalSource.url
      // Filter out any existing Linear source that matches by URL OR author
      // to prevent duplicates when issue URLs change (e.g., moved between projects)
      const filtered = existing.filter((s) => {
        if (s.platform !== "linear") return true
        // Remove if URL matches (when both have URLs)
        if (canonicalUrl && s.url.trim() === canonicalUrl) return false
        // Remove if author/identifier matches
        if (s.author === canonicalSource.author) return false
        return true
      })
      const next = [...filtered, canonicalSource]
      await ctx.db.patch(task._id, {
        sources: next.length > 0 ? next : undefined,
      })
    }

    return linkId
  },
})

export const deleteLinearTaskLinkByTaskId = internalMutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("linearTaskLinks")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .unique()

    if (link) {
      await ctx.db.delete(link._id)
    }
  },
})

export const recordLinearWebhookDelivery = internalMutation({
  args: {
    deliveryId: v.string(),
    integrationId: v.id("linearWorkspaceIntegrations"),
    eventType: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("linearWebhookDeliveries")
      .withIndex("by_delivery", (q) => q.eq("deliveryId", args.deliveryId))
      .unique()

    if (existing) {
      return false
    }

    await ctx.db.insert("linearWebhookDeliveries", {
      deliveryId: args.deliveryId,
      integrationId: args.integrationId,
      eventType: args.eventType,
      receivedAt: Date.now(),
    })
    const integration = await ctx.db.get(args.integrationId)
    if (integration) {
      await insertWorkspaceLog(ctx, {
        workspaceId: integration.workspaceId,
        category: "webhooks",
        type: "webhook_received",
        message: `Linear webhook: ${args.eventType}`,
        source: "linear",
      })

      await ctx.scheduler.runAfter(
        0,
        internal.billingTracking.trackIntegrationEvent,
        {
          workspaceId: integration.workspaceId,
          source: "linear" as const,
          properties: {
            event_type: args.eventType,
            delivery_id: args.deliveryId,
          },
        }
      )
    }
    return true
  },
})

export const reconcileMissingLinearIssues = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    activeLinearIssueIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const activeLinearIssueIds = new Set(args.activeLinearIssueIds)
    const links = await ctx.db
      .query("linearTaskLinks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()

    let archivedCount = 0
    let deletedCount = 0
    let unlinkedCount = 0

    for (const link of links) {
      if (activeLinearIssueIds.has(link.linearIssueId)) {
        continue
      }

      const task = await ctx.db.get(link.taskId)

      if (!task) {
        await ctx.db.delete(link._id)
        unlinkedCount += 1
        continue
      }

      const isImportedArchivedLinearTask =
        task.status === "archive" && task.source?.platform === "linear"

      if (isImportedArchivedLinearTask) {
        await ctx.db.delete(link._id)
        await ctx.db.delete(task._id)
        deletedCount += 1
        continue
      }

      // Strip the now-defunct linear source from the task so the
      // denormalized task.sources stays consistent after unlinking.
      const cleanedSources = (task.sources ?? []).filter(
        (s) => s.platform !== "linear"
      )
      if (task.status !== "archive") {
        await ctx.db.patch(task._id, {
          status: "archive",
          updatedAt: Date.now(),
          sources: cleanedSources.length > 0 ? cleanedSources : undefined,
        })
        archivedCount += 1
      } else if (cleanedSources.length !== (task.sources ?? []).length) {
        await ctx.db.patch(task._id, {
          sources: cleanedSources.length > 0 ? cleanedSources : undefined,
        })
      }

      await ctx.db.delete(link._id)
      unlinkedCount += 1
    }

    return {
      archivedCount,
      deletedCount,
      unlinkedCount,
    }
  },
})

export const archiveTaskForRemovedLinearIssue = internalMutation({
  args: {
    linearIssueId: v.string(),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("linearTaskLinks")
      .withIndex("by_linear_issue", (q) =>
        q.eq("linearIssueId", args.linearIssueId)
      )
      .unique()

    if (!link) return false

    const task = await ctx.db.get(link.taskId)
    if (!task) return false

    if (task.status !== "archive") {
      await ctx.db.patch(task._id, {
        status: "archive",
        updatedAt: Date.now(),
      })
    }

    await ctx.db.patch(link._id, {
      lastSyncedAt: Date.now(),
    })
    return true
  },
})

export const getLinkedTaskSnapshot = internalQuery({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId)
    if (!task) return null

    const integration = await ctx.db
      .query("linearWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", task.workspaceId))
      .unique()

    if (!integration) return null

    const link = await ctx.db
      .query("linearTaskLinks")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .unique()

    return {
      task,
      integration,
      link,
    }
  },
})

export const listUnsyncedWorkspaceTasks = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()
    const links = await ctx.db
      .query("linearTaskLinks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()

    const linkedTaskIds = new Set(links.map((link) => link.taskId))
    return tasks.filter((task) => !linkedTaskIds.has(task._id))
  },
})

export const listWorkspaceTaskSyncStates = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()
    const links = await ctx.db
      .query("linearTaskLinks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()

    const linksByTaskId = new Map(links.map((link) => [link.taskId, link]))
    return tasks.map((task) => ({
      task,
      link: linksByTaskId.get(task._id) ?? null,
    }))
  },
})

export const upsertTaskFromLinearIssue = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    statusMappings: linearStatusMappingsValidator,
    issue: linearIssueValidator,
  },
  handler: async (ctx, args) => {
    const issue: LinearIssue = {
      id: args.issue.id,
      identifier: args.issue.identifier,
      title: args.issue.title,
      description: args.issue.description ?? null,
      url: args.issue.url ?? null,
      priority: args.issue.priority ?? null,
      labels: (args.issue.labels ?? []).map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color ?? null,
      })),
      createdAt: args.issue.createdAt,
      updatedAt: args.issue.updatedAt,
      state: args.issue.state
        ? {
            id: args.issue.state.id,
            name: args.issue.state.name,
            type: args.issue.state.type,
          }
        : null,
    }

    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    const existingLink = await ctx.db
      .query("linearTaskLinks")
      .withIndex("by_linear_issue", (q) => q.eq("linearIssueId", issue.id))
      .unique()

    const taskStatus = mapLinearStateToTaskStatus(
      issue,
      normalizeStatusMappings(args.statusMappings)
    )
    const taskPriority = mapLinearPriorityToTask(issue.priority)
    const taskLabels = mapLinearLabelsToTaskLabels(issue.labels)
    const nextDescription = normalizeOptionalText(issue.description)
    const linearUpdatedAt = new Date(issue.updatedAt).getTime()
    const nextSource = issue.url
      ? {
          platform: "linear" as const,
          url: issue.url,
          author: issue.identifier,
        }
      : undefined

    if (existingLink) {
      const linkedTask = await ctx.db.get(existingLink.taskId)

      if (!linkedTask) {
        await ctx.db.delete(existingLink._id)
      } else {
        const updates: Partial<Doc<"tasks">> = {
          title: getMedianTaskTitleFromLinearIssue(issue.title),
          description: nextDescription,
          priority: taskPriority,
          labels: taskLabels,
          updatedAt: Number.isFinite(linearUpdatedAt)
            ? linearUpdatedAt
            : Date.now(),
        }

        if (linkedTask.status !== taskStatus) {
          const workspaceTasks = await ctx.db
            .query("tasks")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", args.workspaceId)
            )
            .collect()
          updates.status = taskStatus
          updates.order = workspaceTasks.filter(
            (task) => task._id !== linkedTask._id && task.status === taskStatus
          ).length
        }

        if (!linkedTask.source || linkedTask.source.platform === "linear") {
          updates.source = nextSource
        }
        updates.sources = mergeTaskSources(
          linkedTask.sources ?? (linkedTask.source ? [linkedTask.source] : []),
          nextSource
        )

        await ctx.db.patch(linkedTask._id, updates)
        await ctx.db.patch(existingLink._id, {
          linearIssueIdentifier: issue.identifier,
          linearIssueUrl: issue.url ?? undefined,
          lastLinearUpdatedAt: issue.updatedAt,
          lastSyncedAt: Date.now(),
        })
        return linkedTask._id
      }
    }

    if (
      nextSource?.url &&
      (await isDeletedLinearTaskSource(ctx, args.workspaceId, nextSource.url))
    ) {
      return null
    }

    const workspaceTasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()
    const workspaceLinks = await ctx.db
      .query("linearTaskLinks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()

    const linkedTaskIds = new Set(workspaceLinks.map((link) => link.taskId))
    const matchedTask = workspaceTasks.find(
      (task) =>
        !linkedTaskIds.has(task._id) &&
        normalizeTitle(task.title) === normalizeTitle(issue.title)
    )

    if (matchedTask) {
      const updates: Partial<Doc<"tasks">> = {
        title: getMedianTaskTitleFromLinearIssue(issue.title),
        description: nextDescription,
        priority: taskPriority,
        labels: taskLabels,
        updatedAt: Number.isFinite(linearUpdatedAt)
          ? linearUpdatedAt
          : Date.now(),
      }

      if (matchedTask.status !== taskStatus) {
        updates.status = taskStatus
        updates.order = workspaceTasks.filter(
          (task) => task._id !== matchedTask._id && task.status === taskStatus
        ).length
      }

      if (!matchedTask.source || matchedTask.source.platform === "linear") {
        updates.source = nextSource
      }
      updates.sources = mergeTaskSources(
        matchedTask.sources ?? (matchedTask.source ? [matchedTask.source] : []),
        nextSource
      )

      await ctx.db.patch(matchedTask._id, updates)
      await insertWorkspaceLog(ctx, {
        workspaceId: args.workspaceId,
        category: "tasks",
        type: matchedTask.status !== taskStatus ? "task_moved" : "task_updated",
        message:
          matchedTask.status !== taskStatus
            ? `${matchedTask.taskCode} moved from "${matchedTask.status}" to "${taskStatus}"`
            : `${matchedTask.taskCode} updated`,
        source: "linear",
      })
      await ctx.db.insert("linearTaskLinks", {
        workspaceId: args.workspaceId,
        taskId: matchedTask._id,
        linearIssueId: issue.id,
        linearIssueIdentifier: issue.identifier,
        linearIssueUrl: issue.url ?? undefined,
        lastLinearUpdatedAt: issue.updatedAt,
        lastSyncedAt: Date.now(),
      })
      return matchedTask._id
    }

    const nextTaskNumber =
      Math.max(
        workspace.taskCounter ?? 0,
        ...workspaceTasks.map((task) => task.taskNumber)
      ) + 1
    const createdTaskId = await ctx.db.insert("tasks", {
      workspaceId: args.workspaceId,
      taskCode: `${workspace.prefix || "MED"}-${nextTaskNumber}`,
      taskNumber: nextTaskNumber,
      title: getMedianTaskTitleFromLinearIssue(issue.title),
      description: nextDescription,
      status: taskStatus,
      priority: taskPriority,
      labels: taskLabels,
      order: workspaceTasks.filter((task) => task.status === taskStatus).length,
      project: workspace.name,
      updatedAt: Number.isFinite(linearUpdatedAt)
        ? linearUpdatedAt
        : Date.now(),
      assignee: {
        name: "Abdul",
        avatar: "",
      },
      source: nextSource,
      createdAtLabel: formatCreatedAtLabel(issue.createdAt),
      attachments: undefined,
    })

    await ctx.db.patch(workspace._id, {
      taskCounter: nextTaskNumber,
    })

    await ctx.db.insert("linearTaskLinks", {
      workspaceId: args.workspaceId,
      taskId: createdTaskId,
      linearIssueId: issue.id,
      linearIssueIdentifier: issue.identifier,
      linearIssueUrl: issue.url ?? undefined,
      lastLinearUpdatedAt: issue.updatedAt,
      lastSyncedAt: Date.now(),
    })

    await insertWorkspaceLog(ctx, {
      workspaceId: args.workspaceId,
      category: "tasks",
      type: "task_created",
      message: `Task ${workspace.prefix || "MED"}-${nextTaskNumber} "${issue.title.trim()}" created`,
      source: "linear",
    })

    return createdTaskId
  },
})

export const previewLinearTeams = action({
  args: {
    apiKey: v.string(),
  },
  handler: async (_ctx, args) => {
    const result = await fetchViewerAndTeams(args.apiKey.trim())
    return {
      viewer: {
        id: result.viewer.id,
        name: result.viewer.name ?? null,
        email: result.viewer.email ?? null,
      },
      teams: result.teams
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((team) => ({
          id: team.id,
          name: team.name,
          key: team.key ?? null,
        })),
    }
  },
})

export const getWorkspaceLinearWorkflowStates = action({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.linear.assertWorkspaceAdminAccess, {
      workspaceId: args.workspaceId,
    })

    const integration = await ctx.runQuery(
      internal.linear.getLinearIntegrationForWorkspace,
      {
        workspaceId: args.workspaceId,
      }
    )
    if (!integration) {
      throw new Error("No Linear integration found for this workspace")
    }

    const workflowStates = sortWorkflowStates(
      await fetchWorkflowStates(integration.apiKey, integration.teamId)
    )

    return {
      states: workflowStates.map((state) => ({
        id: state.id,
        name: state.name,
        type: state.type,
      })),
    }
  },
})

export const connectWorkspaceLinearIntegration = action({
  args: {
    workspaceId: v.id("workspaces"),
    apiKey: v.string(),
    teamId: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    integrationId: Id<"linearWorkspaceIntegrations">
    teamName: string
    teamKey: string | null
    viewerName: string
    syncResult: {
      importedCount: number
      pushedCount: number
    }
  }> => {
    await ctx.runMutation(internal.linear.assertWorkspaceAdminAccess, {
      workspaceId: args.workspaceId,
    })

    const apiKey = args.apiKey.trim()
    const existingIntegration = await ctx.runQuery(
      internal.linear.getLinearIntegrationForWorkspace,
      {
        workspaceId: args.workspaceId,
      }
    )

    if (existingIntegration?.webhookId) {
      try {
        await deleteWebhook(
          existingIntegration.apiKey,
          existingIntegration.webhookId
        )
      } catch {
        // Replace the integration anyway so the workspace is not stuck on a bad webhook.
      }
    }

    const connectionData = await fetchViewerAndTeams(apiKey)
    const selectedTeam = connectionData.teams.find(
      (team) => team.id === args.teamId
    )

    if (!selectedTeam) {
      throw new Error("Selected Linear team not found for this API key")
    }

    const workflowStates = await fetchWorkflowStates(apiKey, selectedTeam.id)
    const statusMappings = buildDefaultStatusMappings(workflowStates)
    const webhookToken = crypto.randomUUID().replace(/-/g, "")
    const webhookId = await createWebhook(
      apiKey,
      selectedTeam.id,
      buildLinearWebhookUrl(webhookToken)
    )

    await ctx.runMutation(internal.linear.clearWorkspaceLinearIntegration, {
      workspaceId: args.workspaceId,
    })
    const integrationId = await ctx.runMutation(
      internal.linear.saveWorkspaceLinearIntegration,
      {
        workspaceId: args.workspaceId,
        apiKey,
        linearUserId: connectionData.viewer.id,
        linearUserName:
          connectionData.viewer.name ??
          connectionData.viewer.email ??
          "Linear user",
        linearUserEmail: connectionData.viewer.email ?? undefined,
        teamId: selectedTeam.id,
        teamKey: selectedTeam.key ?? undefined,
        teamName: selectedTeam.name,
        statusMappings,
        statusMappingsUpdatedAt: Date.now(),
        webhookId,
        webhookToken,
      }
    )

    const syncResult = await ctx.runAction(
      internal.linear.performWorkspaceLinearSync,
      {
        workspaceId: args.workspaceId,
      }
    )

    await ctx.runMutation(internal.logs.recordWorkspaceLog, {
      workspaceId: args.workspaceId,
      category: "integrations",
      type: "integration_connected",
      message: `Linear integration connected to team ${selectedTeam.name}`,
      source: "linear",
    })

    return {
      integrationId,
      teamName: selectedTeam.name,
      teamKey: selectedTeam.key ?? null,
      viewerName:
        connectionData.viewer.name ??
        connectionData.viewer.email ??
        "Linear user",
      syncResult,
    }
  },
})

export const updateWorkspaceLinearStatusMappings = action({
  args: {
    workspaceId: v.id("workspaces"),
    statusMappings: linearStatusMappingsValidator,
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.linear.assertWorkspaceAdminAccess, {
      workspaceId: args.workspaceId,
    })

    const integration = await ctx.runQuery(
      internal.linear.getLinearIntegrationForWorkspace,
      {
        workspaceId: args.workspaceId,
      }
    )
    if (!integration) {
      throw new Error("No Linear integration found for this workspace")
    }

    const workflowStates = await fetchWorkflowStates(
      integration.apiKey,
      integration.teamId
    )
    const workflowStateIds = new Set(workflowStates.map((state) => state.id))
    const normalizedMappings = normalizeStatusMappings(args.statusMappings)

    assertUniqueStatusMappings(normalizedMappings)

    for (const status of LINEAR_MAPPABLE_STATUSES) {
      const stateId = normalizedMappings[status]
      if (stateId && !workflowStateIds.has(stateId)) {
        throw new Error(
          "One or more selected Linear workflow states no longer exist"
        )
      }
    }

    const updatedAt = Date.now()
    await ctx.runMutation(internal.linear.saveWorkspaceLinearStatusMappings, {
      workspaceId: args.workspaceId,
      statusMappings: normalizedMappings,
      updatedAt,
    })

    return {
      statusMappings: normalizedMappings,
      updatedAt,
    }
  },
})

export const disconnectWorkspaceLinearIntegration = action({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.linear.assertWorkspaceAdminAccess, {
      workspaceId: args.workspaceId,
    })

    const integration = await ctx.runQuery(
      internal.linear.getLinearIntegrationForWorkspace,
      {
        workspaceId: args.workspaceId,
      }
    )

    if (integration?.webhookId) {
      try {
        await deleteWebhook(integration.apiKey, integration.webhookId)
      } catch {
        // Best effort cleanup.
      }
    }

    await ctx.runMutation(internal.linear.clearWorkspaceLinearIntegration, {
      workspaceId: args.workspaceId,
    })

    await ctx.runMutation(internal.logs.recordWorkspaceLog, {
      workspaceId: args.workspaceId,
      category: "integrations",
      type: "integration_disconnected",
      message: "Linear integration disconnected",
      source: "linear",
    })

    return { success: true }
  },
})

export const performWorkspaceLinearSync = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(
      internal.linear.getLinearIntegrationForWorkspace,
      {
        workspaceId: args.workspaceId,
      }
    )
    if (!integration) {
      throw new Error("No Linear integration found for this workspace")
    }

    const teamIssues = await fetchTeamIssues(
      integration.apiKey,
      integration.teamId
    )
    const activeLinearIssueIds = teamIssues.map((issue) => issue.id)
    for (const issue of teamIssues) {
      await ctx.runMutation(internal.linear.upsertTaskFromLinearIssue, {
        workspaceId: args.workspaceId,
        statusMappings: normalizeStatusMappings(integration.statusMappings),
        issue: {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description ?? undefined,
          url: issue.url ?? undefined,
          priority: issue.priority ?? undefined,
          labels: issue.labels.map((label) => ({
            id: label.id,
            name: label.name,
            color: label.color ?? undefined,
          })),
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          state: issue.state
            ? {
                id: issue.state.id,
                name: issue.state.name,
                type: issue.state.type,
              }
            : undefined,
        },
      })
    }

    await ctx.runMutation(internal.linear.reconcileMissingLinearIssues, {
      workspaceId: args.workspaceId,
      activeLinearIssueIds,
    })

    const taskSyncStates = await ctx.runQuery(
      internal.linear.listWorkspaceTaskSyncStates,
      {
        workspaceId: args.workspaceId,
      }
    )

    const workflowStates = await fetchWorkflowStates(
      integration.apiKey,
      integration.teamId
    )
    const statusMappingsUpdatedAt = integration.statusMappingsUpdatedAt ?? 0
    let pushedCount = 0
    for (const item of taskSyncStates) {
      if (item.task.status === "archive" && item.link === null) {
        continue
      }

      const taskUpdatedAt = item.task.updatedAt ?? item.task._creationTime
      const needsPush =
        item.link === null ||
        taskUpdatedAt > item.link.lastSyncedAt ||
        statusMappingsUpdatedAt > item.link.lastSyncedAt

      if (!needsPush) {
        continue
      }

      await syncTaskToLinear(
        ctx,
        integration,
        item.task,
        item.link,
        workflowStates
      )
      pushedCount += 1
    }

    await ctx.runMutation(internal.linear.markLinearIntegrationSyncedAt, {
      integrationId: integration._id,
      syncedAt: Date.now(),
    })

    return {
      importedCount: teamIssues.length,
      pushedCount,
    }
  },
})

export const syncWorkspaceLinearIntegration = action({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    importedCount: number
    pushedCount: number
  }> => {
    await ctx.runMutation(internal.linear.assertWorkspaceAdminAccess, {
      workspaceId: args.workspaceId,
    })
    return await ctx.runAction(internal.linear.performWorkspaceLinearSync, {
      workspaceId: args.workspaceId,
    })
  },
})

export const syncTaskToLinearIssue = internalAction({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const snapshot = await ctx.runQuery(internal.linear.getLinkedTaskSnapshot, {
      taskId: args.taskId,
    })

    if (!snapshot) {
      return { skipped: true }
    }

    if (
      snapshot.link &&
      (snapshot.task.updatedAt ?? snapshot.task._creationTime) <=
        snapshot.link.lastSyncedAt &&
      (snapshot.integration.statusMappingsUpdatedAt ?? 0) <=
        snapshot.link.lastSyncedAt
    ) {
      return { skipped: true }
    }

    const workflowStates = await fetchWorkflowStates(
      snapshot.integration.apiKey,
      snapshot.integration.teamId
    )

    const operation = await syncTaskToLinear(
      ctx,
      snapshot.integration,
      snapshot.task,
      snapshot.link,
      workflowStates
    )

    await ctx.runMutation(internal.linear.markLinearIntegrationSyncedAt, {
      integrationId: snapshot.integration._id,
      syncedAt: Date.now(),
    })

    return {
      skipped: false,
      operation,
    }
  },
})

export const deleteLinearIssue = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    linearIssueId: v.string(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(
      internal.linear.getLinearIntegrationForWorkspace,
      {
        workspaceId: args.workspaceId,
      }
    )

    if (!integration) {
      return { skipped: true }
    }

    const issue = await fetchIssueById(integration.apiKey, args.linearIssueId)
    if (!issue) {
      return { skipped: true }
    }

    await issueDelete(integration.apiKey, args.linearIssueId)
    await ctx.runMutation(internal.linear.markLinearIntegrationSyncedAt, {
      integrationId: integration._id,
      syncedAt: Date.now(),
    })

    return { skipped: false }
  },
})

export const syncLinearIssueFromWebhook = internalAction({
  args: {
    integrationId: v.id("linearWorkspaceIntegrations"),
    issueId: v.string(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(
      internal.linear.getLinearIntegrationById,
      {
        integrationId: args.integrationId,
      }
    )

    if (!integration) {
      throw new Error("Linear integration not found")
    }

    const issue = await fetchIssueById(integration.apiKey, args.issueId)
    if (!issue) {
      return { skipped: true }
    }

    await ctx.runMutation(internal.linear.upsertTaskFromLinearIssue, {
      workspaceId: integration.workspaceId,
      statusMappings: normalizeStatusMappings(integration.statusMappings),
      issue: {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description ?? undefined,
        url: issue.url ?? undefined,
        priority: issue.priority ?? undefined,
        labels: issue.labels.map((label) => ({
          id: label.id,
          name: label.name,
          color: label.color ?? undefined,
        })),
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        state: issue.state
          ? {
              id: issue.state.id,
              name: issue.state.name,
              type: issue.state.type,
            }
          : undefined,
      },
    })
    await ctx.runMutation(internal.linear.markLinearIntegrationSyncedAt, {
      integrationId: integration._id,
      syncedAt: Date.now(),
    })

    return { skipped: false }
  },
})

export const linearWebhook = httpAction(async (ctx, request) => {
  const url = new URL(request.url)
  const webhookToken = url.searchParams.get("token")
  if (!webhookToken) {
    return new Response("Missing webhook token", { status: 401 })
  }

  const integration = await ctx.runQuery(
    internal.linear.getLinearIntegrationByWebhookToken,
    {
      webhookToken,
    }
  )
  if (!integration) {
    return new Response("Unknown webhook token", { status: 404 })
  }

  const deliveryId = request.headers.get("Linear-Delivery")
  const eventType = request.headers.get("Linear-Event") ?? "unknown"
  if (!deliveryId) {
    return new Response("Missing delivery id", { status: 400 })
  }

  const accepted = await ctx.runMutation(
    internal.linear.recordLinearWebhookDelivery,
    {
      deliveryId,
      integrationId: integration._id,
      eventType,
    }
  )
  if (!accepted) {
    return new Response("Duplicate delivery", { status: 200 })
  }

  const payload = (await request.json()) as LinearWebhookPayload
  if (payload.type !== "Issue" || !payload.data?.id) {
    return new Response("Ignored", { status: 200 })
  }

  if (payload.action === "remove") {
    await ctx.runMutation(internal.linear.archiveTaskForRemovedLinearIssue, {
      linearIssueId: payload.data.id,
    })
    return new Response("Archived", { status: 200 })
  }

  // Skip ingest when overages are disabled and the workspace's events are
  // exhausted. We still 200 so Linear doesn't keep retrying — sync resumes
  // automatically once the cycle resets or the user upgrades.
  try {
    const quota = await ctx.runAction(
      internal.billing.getWorkspaceQuotaStatusInternal,
      { workspaceId: integration.workspaceId }
    )
    if (quota.eventsExhausted) {
      console.info(
        "[linear] Skipping webhook — events exhausted (overages disabled)",
        { workspaceId: integration.workspaceId, deliveryId }
      )
      return new Response("Paused — events exhausted", { status: 200 })
    }
  } catch (error) {
    console.error(
      "[linear] Quota check failed in webhook — allowing sync",
      { workspaceId: integration.workspaceId, deliveryId },
      error
    )
  }

  await ctx.runAction(internal.linear.syncLinearIssueFromWebhook, {
    integrationId: integration._id,
    issueId: payload.data.id,
  })

  return new Response("OK", { status: 200 })
})
