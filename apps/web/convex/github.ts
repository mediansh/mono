import { v } from "convex/values"
import {
  action,
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { internal } from "./_generated/api"
import { insertWorkspaceLog } from "./logs"
import {
  requireWorkspaceAccess,
  requireWorkspaceAdminAccess,
} from "./permissions"
import { STATUS_ORDER, type TaskStatus } from "../lib/task-board"

const GITHUB_API_URL = "https://api.github.com"
const GITHUB_INSTALL_STATE_TTL_MS = 1000 * 60 * 15
const GITHUB_CALLBACK_PATH = "/github/callback"
const GITHUB_WEBHOOK_PATH = "/github/webhook"

type GitHubRepository = {
  id: string
  name: string
  fullName: string
  ownerLogin: string
  defaultBranch?: string
  isPrivate: boolean
}

type GitHubIssueRecord = {
  id: string
  number: number
  htmlUrl: string
  title: string
  body?: string
  state: "open" | "closed"
  createdAt?: string
  updatedAt?: string
  repository: GitHubRepository
}

type RepositorySelection = {
  selectedRepoIds: string[]
  defaultRepoId?: string
}

type RefreshRepositoriesResult = {
  integration: Doc<"githubWorkspaceIntegrations">
  repositories: GitHubRepository[]
}

type SyncTaskToGitHubIssueResult =
  | {
      skipped: true
      reason?: "no_repository"
    }
  | {
      skipped: false
      repositoryFullName: string
      issueNumber: number
    }

type WorkspaceGitHubSyncResult = {
  importedCount: number
  pushedCount: number
  repositoryCount: number
}

type GitHubRestRepository = {
  id?: number
  name?: string
  full_name?: string
  private?: boolean
  default_branch?: string
  owner?: {
    login?: string
  }
}

type GitHubRestInstallation = {
  id?: number
  account?: {
    id?: number
    login?: string
    type?: string
  }
}

type GitHubRestIssue = {
  id?: number
  number?: number
  html_url?: string
  title?: string
  body?: string | null
  state?: "open" | "closed"
  created_at?: string
  updated_at?: string
  pull_request?: unknown
}

type GitHubRestPullRequest = {
  number?: number
  html_url?: string
  title?: string
  body?: string | null
  state?: "open" | "closed"
  merged?: boolean
  draft?: boolean
}

type GitHubIssueWebhookPayload = {
  action?: string
  installation?: {
    id?: number
  }
  repository?: GitHubRestRepository
  issue?: GitHubRestIssue
}

type GitHubPullRequestWebhookPayload = {
  action?: string
  installation?: {
    id?: number
  }
  repository?: GitHubRestRepository
  pull_request?: GitHubRestPullRequest
}

type GitHubPushWebhookPayload = {
  installation?: {
    id?: number
  }
  ref?: string
  repository?: GitHubRestRepository
  commits?: Array<{
    id?: string
    message?: string
    url?: string
  }>
}

type GitHubInstallationRepositoriesPayload = {
  action?: string
  installation?: {
    id?: number
  }
}

type GitHubInstallationPayload = {
  action?: string
  installation?: {
    id?: number
  }
}

class GitHubApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const githubRepositoryValidator = v.object({
  id: v.string(),
  name: v.string(),
  fullName: v.string(),
  ownerLogin: v.string(),
  defaultBranch: v.optional(v.string()),
  isPrivate: v.boolean(),
})

const githubIssueValidator = v.object({
  id: v.string(),
  number: v.number(),
  htmlUrl: v.string(),
  title: v.string(),
  body: v.optional(v.string()),
  state: v.union(v.literal("open"), v.literal("closed")),
  createdAt: v.optional(v.string()),
  updatedAt: v.optional(v.string()),
  repository: githubRepositoryValidator,
})

function logInfo(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.log("[convex:github]", message, details)
    return
  }

  console.log("[convex:github]", message)
}

function logError(
  message: string,
  error: unknown,
  details?: Record<string, unknown>
) {
  if (details) {
    console.error("[convex:github]", message, details, error)
    return
  }

  console.error("[convex:github]", message, error)
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing ${name}`)
  }
  return value
}

function getGitHubAppId() {
  return getRequiredEnv("GITHUB_APP_ID")
}

function getGitHubAppSlug() {
  return getRequiredEnv("GITHUB_APP_SLUG")
}

function getGitHubAppPrivateKey() {
  return getRequiredEnv("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n")
}

function getGitHubWebhookSecret() {
  return getRequiredEnv("GITHUB_WEBHOOK_SECRET")
}

function getConvexSiteUrl() {
  const baseUrl =
    process.env.CONVEX_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL
  if (!baseUrl) {
    throw new Error("Missing CONVEX_SITE_URL for GitHub integration")
  }
  return baseUrl.replace(/\/$/, "")
}

function getGitHubCallbackUrl() {
  return `${getConvexSiteUrl()}${GITHUB_CALLBACK_PATH}`
}

function getGitHubWebhookUrl() {
  return `${getConvexSiteUrl()}${GITHUB_WEBHOOK_PATH}`
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

async function isDeletedGitHubTaskSource(
  ctx: { db: any },
  workspaceId: Id<"workspaces">,
  sourceUrl: string
) {
  const suppression = await ctx.db
    .query("deletedTaskSources")
    .withIndex("by_workspace_source", (q: any) =>
      q
        .eq("workspaceId", workspaceId)
        .eq("platform", "github")
        .eq("sourceUrl", sourceUrl)
    )
    .first()

  return Boolean(suppression)
}

function normalizeTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

function formatCreatedAtLabel(value?: string) {
  if (!value) return undefined
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return undefined

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp))
}

function parseTimestamp(value?: string) {
  if (!value) return Date.now()
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Date.now()
}

function bytesToBinaryString(bytes: Uint8Array) {
  let result = ""
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    result += String.fromCharCode(...chunk)
  }

  return result
}

function base64EncodeBytes(bytes: Uint8Array) {
  return btoa(bytesToBinaryString(bytes))
}

function base64DecodeToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function base64UrlEncodeString(value: string) {
  return base64EncodeBytes(new TextEncoder().encode(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function base64UrlEncodeBytes(bytes: Uint8Array) {
  return base64EncodeBytes(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function pemToArrayBuffer(pem: string) {
  const content = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "")

  return base64DecodeToBytes(content).buffer
}

function pkcs1ToPkcs8(pkcs1Der: ArrayBuffer): ArrayBuffer {
  const pkcs1Bytes = new Uint8Array(pkcs1Der)
  // ASN.1 PKCS#8 header for RSA:
  // SEQUENCE { version INTEGER 0, algorithm AlgorithmIdentifier { OID rsaEncryption, NULL }, privateKey OCTET STRING }
  const pkcs8Header = new Uint8Array([
    0x30, 0x82, 0x00, 0x00, // SEQUENCE (length placeholder)
    0x02, 0x01, 0x00, // INTEGER 0 (version)
    0x30, 0x0d, // SEQUENCE (AlgorithmIdentifier)
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // OID rsaEncryption
    0x05, 0x00, // NULL
    0x04, 0x82, 0x00, 0x00, // OCTET STRING (length placeholder)
  ])

  const totalLength = pkcs8Header.length + pkcs1Bytes.length
  const result = new Uint8Array(totalLength)
  result.set(pkcs8Header)
  result.set(pkcs1Bytes, pkcs8Header.length)

  // Patch outer SEQUENCE length (totalLength - 4 for tag + length bytes)
  const outerLen = totalLength - 4
  result[2] = (outerLen >> 8) & 0xff
  result[3] = outerLen & 0xff

  // Patch OCTET STRING length (pkcs1 key length)
  const octetOffset = pkcs8Header.length - 2
  result[octetOffset] = (pkcs1Bytes.length >> 8) & 0xff
  result[octetOffset + 1] = pkcs1Bytes.length & 0xff

  return result.buffer
}

async function importGitHubPrivateKey() {
  const pem = getGitHubAppPrivateKey()
  const isPkcs1 = pem.includes("BEGIN RSA PRIVATE KEY")
  const der = pemToArrayBuffer(pem)
  const keyData = isPkcs1 ? pkcs1ToPkcs8(der) : der

  return await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  )
}

async function createGitHubAppJwt() {
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncodeString(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT",
    })
  )
  const payload = base64UrlEncodeString(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: getGitHubAppId(),
    })
  )
  const signingInput = `${header}.${payload}`
  const privateKey = await importGitHubPrivateKey()
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput)
  )

  return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`
}

async function githubRequest<T>(
  path: string,
  init: RequestInit & { token?: string } = {}
): Promise<T> {
  const response = await fetch(
    path.startsWith("http") ? path : `${GITHUB_API_URL}${path}`,
    {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.token
          ? {
              Authorization: `Bearer ${init.token}`,
            }
          : {}),
        ...(init.headers ?? {}),
      },
    }
  )

  if (response.status === 204) {
    return undefined as T
  }

  const rawBody = await response.text()
  const body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : null

  if (!response.ok) {
    const message =
      typeof body?.message === "string"
        ? body.message
        : rawBody || `GitHub request failed with ${response.status}`
    throw new GitHubApiError(response.status, message)
  }

  return (body ?? undefined) as T
}

async function createInstallationAccessToken(installationId: string) {
  const appJwt = await createGitHubAppJwt()
  const response = await githubRequest<{ token?: string }>(
    `/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      token: appJwt,
      body: JSON.stringify({}),
    }
  )

  if (!response.token) {
    throw new Error("GitHub returned no installation token")
  }

  return response.token
}

function normalizeRepository(repository: GitHubRestRepository): GitHubRepository | null {
  const id =
    repository.id !== undefined && repository.id !== null
      ? String(repository.id)
      : null
  const name = repository.name?.trim()
  const fullName = repository.full_name?.trim()
  const ownerLogin = repository.owner?.login?.trim()

  if (!id || !name || !fullName || !ownerLogin) {
    return null
  }

  return {
    id,
    name,
    fullName,
    ownerLogin,
    defaultBranch: normalizeOptionalText(repository.default_branch),
    isPrivate: Boolean(repository.private),
  }
}

async function fetchInstallation(installationId: string) {
  const appJwt = await createGitHubAppJwt()
  const installation = await githubRequest<GitHubRestInstallation>(
    `/app/installations/${installationId}`,
    {
      token: appJwt,
    }
  )

  const accountId =
    installation.account?.id !== undefined && installation.account.id !== null
      ? String(installation.account.id)
      : null
  const accountLogin = installation.account?.login?.trim()
  const accountType = installation.account?.type?.trim()

  if (!accountId || !accountLogin || !accountType) {
    throw new Error("GitHub installation account details were incomplete")
  }

  return {
    installationId,
    accountId,
    accountLogin,
    accountType,
  }
}

async function listInstallationRepositories(installationToken: string) {
  const repositories: GitHubRepository[] = []
  let page = 1

  while (true) {
    const response = await githubRequest<{
      repositories?: GitHubRestRepository[]
    }>(`/installation/repositories?per_page=100&page=${page}`, {
      token: installationToken,
    })

    const pageRepositories = (response.repositories ?? [])
      .map((repository) => normalizeRepository(repository))
      .filter(Boolean) as GitHubRepository[]

    repositories.push(...pageRepositories)

    if (pageRepositories.length < 100) {
      break
    }

    page += 1
  }

  return repositories.sort((left, right) =>
    left.fullName.localeCompare(right.fullName)
  )
}

function normalizeIssue(
  issue: GitHubRestIssue,
  repository: GitHubRepository
): GitHubIssueRecord | null {
  if (issue.pull_request) {
    return null
  }

  const id =
    issue.id !== undefined && issue.id !== null ? String(issue.id) : null
  const number = issue.number
  const htmlUrl = issue.html_url?.trim()
  const title = issue.title?.trim()
  const state = issue.state

  if (!id || !number || !htmlUrl || !title || !state) {
    return null
  }

  return {
    id,
    number,
    htmlUrl,
    title,
    body: normalizeOptionalText(issue.body),
    state,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    repository,
  }
}

async function listRepositoryIssues(
  installationToken: string,
  repository: GitHubRepository
) {
  const issues: GitHubIssueRecord[] = []
  let page = 1

  while (true) {
    const response = await githubRequest<GitHubRestIssue[]>(
      `/repos/${repository.fullName}/issues?state=all&per_page=100&page=${page}`,
      {
        token: installationToken,
      }
    )

    const pageIssues = response
      .map((issue) => normalizeIssue(issue, repository))
      .filter(Boolean) as GitHubIssueRecord[]

    issues.push(...pageIssues)

    if (response.length < 100) {
      break
    }

    page += 1
  }

  return issues
}

async function createRepositoryIssue(
  installationToken: string,
  repositoryFullName: string,
  input: {
    title: string
    body?: string
    state?: "open" | "closed"
  }
) {
  const created = await githubRequest<GitHubRestIssue>(
    `/repos/${repositoryFullName}/issues`,
    {
      method: "POST",
      token: installationToken,
      body: JSON.stringify({
        title: input.title,
        body: input.body,
      }),
    }
  )

  return created
}

async function updateRepositoryIssue(
  installationToken: string,
  repositoryFullName: string,
  issueNumber: number,
  input: {
    title?: string
    body?: string
    state?: "open" | "closed"
  }
) {
  return await githubRequest<GitHubRestIssue>(
    `/repos/${repositoryFullName}/issues/${issueNumber}`,
    {
      method: "PATCH",
      token: installationToken,
      body: JSON.stringify(input),
    }
  )
}

function extractTaskCodes(...values: Array<string | null | undefined>) {
  const codes = new Set<string>()
  const matcher = /\b[A-Z][A-Z0-9]+-\d+\b/g

  for (const value of values) {
    if (!value) continue
    for (const match of value.toUpperCase().matchAll(matcher)) {
      if (match[0]) {
        codes.add(match[0])
      }
    }
  }

  return [...codes]
}

function stripLeadingTaskCode(value: string) {
  return value.replace(/^\s*[A-Z][A-Z0-9]+-\d+[:\]\)\s-]*/i, "").trim()
}

function buildManagedIssueTitle(task: Doc<"tasks">) {
  const title = stripLeadingTaskCode(task.title)
  return `${task.taskCode} ${title || task.title.trim()}`
}

function buildManagedIssueBody(task: Doc<"tasks">) {
  const description = task.description?.trim()
  return [
    `Median Task: ${task.taskCode}`,
    "",
    description || "_No description provided in Median._",
  ].join("\n")
}

function mapTaskStatusToIssueState(status: TaskStatus) {
  return status === "shipped" || status === "archive" ? "closed" : "open"
}

function getTaskUpdatedAt(task: Doc<"tasks">) {
  return task.updatedAt ?? task._creationTime
}

function mapIssueStateToNewTaskStatus(state: "open" | "closed"): TaskStatus {
  return state === "closed" ? "shipped" : "todo"
}

function deriveTaskStatusFromIssueState(
  currentStatus: TaskStatus,
  state: "open" | "closed"
): TaskStatus {
  if (state === "closed") {
    return currentStatus === "archive" ? "archive" : "shipped"
  }

  if (currentStatus === "shipped" || currentStatus === "archive") {
    return "todo"
  }

  return currentStatus
}

function formatStatusRedirect(
  redirectUrl: string,
  status: "connected" | "error",
  message: string
) {
  const url = new URL(redirectUrl)
  url.searchParams.set("github_status", status)
  url.searchParams.set("github_message", message)
  return url.toString()
}

function buildInstallUrl(state: string) {
  const url = new URL(
    `https://github.com/apps/${encodeURIComponent(getGitHubAppSlug())}/installations/new`
  )
  url.searchParams.set("state", state)
  return url.toString()
}

async function signWebhookPayload(secret: string, bodyText: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  )

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(bodyText)
  )

  return `sha256=${bytesToHex(new Uint8Array(signature))}`
}

function timingSafeEqualString(left: string, right: string) {
  const encoder = new TextEncoder()
  const leftBuffer = encoder.encode(left)
  const rightBuffer = encoder.encode(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  let mismatch = 0

  for (let index = 0; index < leftBuffer.length; index += 1) {
    mismatch |= leftBuffer[index]! ^ rightBuffer[index]!
  }

  return mismatch === 0
}

function chooseDefaultRepoId(
  repositories: GitHubRepository[],
  selectedRepoIds: string[],
  preferredRepoId?: string
) {
  if (
    preferredRepoId &&
    selectedRepoIds.includes(preferredRepoId) &&
    repositories.some((repository) => repository.id === preferredRepoId)
  ) {
    return preferredRepoId
  }

  return selectedRepoIds[0]
}

function normalizeRepositorySelection(
  repositories: GitHubRepository[],
  selectedRepoIds?: string[],
  defaultRepoId?: string
): RepositorySelection {
  const validRepoIds = new Set(repositories.map((repository) => repository.id))
  const uniqueSelectedRepoIds = Array.from(
    new Set((selectedRepoIds ?? []).filter((repoId) => validRepoIds.has(repoId)))
  )
  const nextSelectedRepoIds =
    uniqueSelectedRepoIds.length > 0
      ? uniqueSelectedRepoIds
      : repositories.map((repository) => repository.id)

  return {
    selectedRepoIds: nextSelectedRepoIds,
    defaultRepoId: chooseDefaultRepoId(
      repositories,
      nextSelectedRepoIds,
      defaultRepoId
    ),
  }
}

async function refreshRepositoriesForWorkspace(
  ctx: any,
  workspaceId: Id<"workspaces">
): Promise<RefreshRepositoriesResult> {
  const integration: Doc<"githubWorkspaceIntegrations"> | null =
    await ctx.runQuery(
    internal.github.getGitHubIntegrationForWorkspace,
    {
      workspaceId,
    }
  )

  if (!integration) {
    throw new Error("No GitHub integration found for this workspace")
  }

  const installationToken = await createInstallationAccessToken(
    integration.installationId
  )
  const repositories = await listInstallationRepositories(installationToken)

  await ctx.runMutation(internal.github.saveWorkspaceGitHubRepositories, {
    workspaceId,
    repositories,
  })

  return {
    integration,
    repositories,
  }
}

export const getWorkspaceGitHubIntegration = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireWorkspaceAccess(ctx, args.workspaceId)
    const integration = await ctx.db
      .query("githubWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()
    const links = integration
      ? await ctx.db
          .query("githubTaskLinks")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
          .collect()
      : []

    return {
      canManage: membership.role === "admin" || membership.role === "owner",
      callbackUrl: getGitHubCallbackUrl(),
      webhookUrl: getGitHubWebhookUrl(),
      integration: integration
        ? {
            _id: integration._id,
            installationId: integration.installationId,
            accountLogin: integration.accountLogin,
            accountType: integration.accountType,
            repositories: integration.repositories,
            selectedRepoIds: integration.selectedRepoIds,
            defaultRepoId: integration.defaultRepoId ?? null,
            issueSyncEnabled: integration.issueSyncEnabled ?? true,
            prAutomationEnabled: integration.prAutomationEnabled ?? true,
            commitAutomationEnabled: integration.commitAutomationEnabled ?? true,
            connectedAt: integration.connectedAt,
            lastSyncedAt: integration.lastSyncedAt ?? null,
            issueLinkCount: links.length,
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

export const getWorkspaceMembershipUserId = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceAdminAccess(ctx, args.workspaceId)
    return {
      userId: identity.subject,
    }
  },
})

export const getGitHubIntegrationForWorkspace = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("githubWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()
  },
})

export const getGitHubIntegrationByInstallationId = internalQuery({
  args: {
    installationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("githubWorkspaceIntegrations")
      .withIndex("by_installation", (q) =>
        q.eq("installationId", args.installationId)
      )
      .unique()
  },
})

export const getGitHubInstallStateByState = internalQuery({
  args: {
    state: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("githubInstallStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .unique()
  },
})

export const saveGitHubInstallState = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    initiatedByUserId: v.string(),
    state: v.string(),
    redirectUrl: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existingStates = await ctx.db
      .query("githubInstallStates")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()

    for (const state of existingStates) {
      await ctx.db.delete(state._id)
    }

    return await ctx.db.insert("githubInstallStates", args)
  },
})

export const markGitHubInstallStateCompleted = internalMutation({
  args: {
    stateId: v.id("githubInstallStates"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.stateId, {
      completedAt: Date.now(),
    })
  },
})

export const clearWorkspaceGitHubIntegration = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.db
      .query("githubWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()

    if (integration) {
      await ctx.db.delete(integration._id)
    }

    const links = await ctx.db
      .query("githubTaskLinks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()
    for (const link of links) {
      // Strip the now-defunct github source from the surviving task.
      const task = await ctx.db.get(link.taskId)
      if (task) {
        const cleaned = (task.sources ?? []).filter(
          (s) => s.platform !== "github"
        )
        await ctx.db.patch(task._id, {
          sources: cleaned.length > 0 ? cleaned : undefined,
        })
      }
      await ctx.db.delete(link._id)
    }

    const developmentRefs = await ctx.db
      .query("githubTaskDevelopmentRefs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()
    for (const developmentRef of developmentRefs) {
      await ctx.db.delete(developmentRef._id)
    }
  },
})

export const saveWorkspaceGitHubIntegration = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    installationId: v.string(),
    accountId: v.string(),
    accountLogin: v.string(),
    accountType: v.string(),
    repositories: v.array(githubRepositoryValidator),
    selectedRepoIds: v.array(v.string()),
    defaultRepoId: v.optional(v.string()),
    issueSyncEnabled: v.boolean(),
    prAutomationEnabled: v.boolean(),
    commitAutomationEnabled: v.boolean(),
    connectedByUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()
    const selection = normalizeRepositorySelection(
      args.repositories,
      args.selectedRepoIds,
      args.defaultRepoId
    )
    const payload = {
      workspaceId: args.workspaceId,
      installationId: args.installationId,
      accountId: args.accountId,
      accountLogin: args.accountLogin,
      accountType: args.accountType,
      repositories: args.repositories,
      selectedRepoIds: selection.selectedRepoIds,
      defaultRepoId: selection.defaultRepoId,
      issueSyncEnabled: existing?.issueSyncEnabled ?? args.issueSyncEnabled,
      prAutomationEnabled:
        existing?.prAutomationEnabled ?? args.prAutomationEnabled,
      commitAutomationEnabled:
        existing?.commitAutomationEnabled ?? args.commitAutomationEnabled,
      connectedAt: existing?.connectedAt ?? Date.now(),
      connectedByUserId: args.connectedByUserId,
      lastSyncedAt: existing?.lastSyncedAt,
    }

    if (existing) {
      await ctx.db.patch(existing._id, payload)
      return existing._id
    }

    return await ctx.db.insert("githubWorkspaceIntegrations", payload)
  },
})

export const saveWorkspaceGitHubRepositories = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    repositories: v.array(githubRepositoryValidator),
    selectedRepoIds: v.optional(v.array(v.string())),
    defaultRepoId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.db
      .query("githubWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()

    if (!integration) {
      throw new Error("GitHub integration not found")
    }

    const selection = normalizeRepositorySelection(
      args.repositories,
      args.selectedRepoIds ?? integration.selectedRepoIds,
      args.defaultRepoId ?? integration.defaultRepoId
    )

    await ctx.db.patch(integration._id, {
      repositories: args.repositories,
      selectedRepoIds: selection.selectedRepoIds,
      defaultRepoId: selection.defaultRepoId,
    })

    return selection
  },
})

export const markGitHubIntegrationSyncedAt = internalMutation({
  args: {
    integrationId: v.id("githubWorkspaceIntegrations"),
    syncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.integrationId, {
      lastSyncedAt: args.syncedAt,
    })
  },
})

export const saveGitHubTaskLink = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    taskId: v.id("tasks"),
    installationId: v.string(),
    githubRepositoryId: v.string(),
    githubRepositoryName: v.string(),
    githubRepositoryFullName: v.string(),
    githubIssueId: v.string(),
    githubIssueNumber: v.number(),
    githubIssueUrl: v.string(),
    lastGithubUpdatedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingByTask = await ctx.db
      .query("githubTaskLinks")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .unique()
    const existingByIssue = await ctx.db
      .query("githubTaskLinks")
      .withIndex("by_github_issue", (q) => q.eq("githubIssueId", args.githubIssueId))
      .unique()
    const payload = {
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      installationId: args.installationId,
      githubRepositoryId: args.githubRepositoryId,
      githubRepositoryName: args.githubRepositoryName,
      githubRepositoryFullName: args.githubRepositoryFullName,
      githubIssueId: args.githubIssueId,
      githubIssueNumber: args.githubIssueNumber,
      githubIssueUrl: args.githubIssueUrl,
      lastGithubUpdatedAt: args.lastGithubUpdatedAt,
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
      linkId = await ctx.db.insert("githubTaskLinks", payload)
    }

    // Denormalize: keep task.sources in sync so listByWorkspace
    // doesn't need to read the githubTaskLinks table at all.
    const task = await ctx.db.get(args.taskId)
    if (task) {
      const canonicalSource = {
        platform: "github" as const,
        url: args.githubIssueUrl,
        author: `${args.githubRepositoryFullName}#${args.githubIssueNumber}`,
      }
      const existing = task.sources ?? (task.source ? [task.source] : [])
      const filtered = existing.filter(
        (s) =>
          !(s.platform === "github" && s.url === canonicalSource.url)
      )
      const next = [...filtered, canonicalSource]
      await ctx.db.patch(task._id, { sources: next.length > 0 ? next : undefined })
    }

    return linkId
  },
})

export const deleteGitHubTaskLinkByTaskId = internalMutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("githubTaskLinks")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .unique()

    if (link) {
      await ctx.db.delete(link._id)
    }
  },
})

export const closeLinkedGitHubIssue = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    githubRepositoryFullName: v.string(),
    githubIssueNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(
      internal.github.getGitHubIntegrationForWorkspace,
      {
        workspaceId: args.workspaceId,
      }
    )

    if (!integration) {
      return { skipped: true as const, reason: "no_integration" as const }
    }

    const installationToken = await createInstallationAccessToken(
      integration.installationId
    )

    try {
      await updateRepositoryIssue(
        installationToken,
        args.githubRepositoryFullName,
        args.githubIssueNumber,
        {
          state: "closed",
        }
      )
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) {
        return { skipped: true as const, reason: "not_found" as const }
      }

      throw error
    }

    await ctx.runMutation(internal.github.markGitHubIntegrationSyncedAt, {
      integrationId: integration._id,
      syncedAt: Date.now(),
    })

    return { skipped: false as const }
  },
})

export const recordGitHubWebhookDelivery = internalMutation({
  args: {
    deliveryId: v.string(),
    workspaceId: v.id("workspaces"),
    installationId: v.string(),
    eventType: v.string(),
    action: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubWebhookDeliveries")
      .withIndex("by_delivery", (q) => q.eq("deliveryId", args.deliveryId))
      .unique()

    if (existing) {
      return false
    }

    await ctx.db.insert("githubWebhookDeliveries", {
      ...args,
      receivedAt: Date.now(),
    })
    await insertWorkspaceLog(ctx, {
      workspaceId: args.workspaceId,
      category: "webhooks",
      type: "webhook_received",
      message: args.action
        ? `GitHub webhook: ${args.eventType}.${args.action}`
        : `GitHub webhook: ${args.eventType}`,
      source: "github",
    })

    await ctx.scheduler.runAfter(
      0,
      internal.billingTracking.trackIntegrationEvent,
      {
        workspaceId: args.workspaceId,
        source: "github" as const,
        properties: {
          event_type: args.eventType,
          action: args.action ?? undefined,
          delivery_id: args.deliveryId,
        },
      }
    )

    return true
  },
})

export const recordGitHubDevelopmentRef = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    taskId: v.id("tasks"),
    refType: v.union(v.literal("commit"), v.literal("pull_request")),
    githubRepositoryId: v.string(),
    githubRepositoryFullName: v.string(),
    githubObjectId: v.string(),
    commitSha: v.optional(v.string()),
    pullRequestNumber: v.optional(v.number()),
    url: v.optional(v.string()),
    state: v.optional(v.string()),
    isOpen: v.optional(v.boolean()),
    isMerged: v.optional(v.boolean()),
    isDefaultBranch: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubTaskDevelopmentRefs")
      .withIndex("by_task_object", (q) =>
        q.eq("taskId", args.taskId).eq("githubObjectId", args.githubObjectId)
      )
      .unique()

    const payload = {
      ...args,
      firstSeenAt: existing?.firstSeenAt ?? Date.now(),
      lastSeenAt: Date.now(),
    }

    if (existing) {
      await ctx.db.patch(existing._id, payload)
      return existing._id
    }

    return await ctx.db.insert("githubTaskDevelopmentRefs", payload)
  },
})

export const listTasksByCodes = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    taskCodes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const taskCodes = new Set(args.taskCodes.map((taskCode) => taskCode.toUpperCase()))
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()

    return tasks.filter((task) => taskCodes.has(task.taskCode.toUpperCase()))
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
      .query("githubWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", task.workspaceId))
      .unique()

    if (!integration) return null

    const link = await ctx.db
      .query("githubTaskLinks")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .unique()

    return {
      task,
      integration,
      link,
    }
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
      .query("githubTaskLinks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()
    const linksByTaskId = new Map(links.map((link) => [link.taskId, link]))

    return tasks.map((task) => ({
      task,
      link: linksByTaskId.get(task._id) ?? null,
    }))
  },
})

export const applyGitHubDerivedTaskStatus = internalMutation({
  args: {
    taskId: v.id("tasks"),
    status: v.union(
      v.literal("in_progress"),
      v.literal("ready"),
      v.literal("shipped")
    ),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId)
    if (!task) return false

    if (STATUS_ORDER[args.status] <= STATUS_ORDER[task.status]) {
      return false
    }

    await ctx.db.patch(args.taskId, {
      status: args.status,
      updatedAt: Date.now(),
    })
    await ctx.scheduler.runAfter(0, internal.github.syncTaskToGitHubIssue, {
      taskId: args.taskId,
    })
    return true
  },
})

export const upsertTaskFromGitHubIssue = internalMutation({
  args: {
    integrationId: v.id("githubWorkspaceIntegrations"),
    issue: githubIssueValidator,
  },
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.integrationId)
    if (!integration) {
      throw new Error("GitHub integration not found")
    }

    const workspace = await ctx.db.get(integration.workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    const issue: GitHubIssueRecord = {
      id: args.issue.id,
      number: args.issue.number,
      htmlUrl: args.issue.htmlUrl,
      title: args.issue.title,
      body: args.issue.body,
      state: args.issue.state,
      createdAt: args.issue.createdAt,
      updatedAt: args.issue.updatedAt,
      repository: args.issue.repository,
    }
    const nextSource = {
      platform: "github" as const,
      url: issue.htmlUrl,
      author: `${issue.repository.fullName}#${issue.number}`,
    }
    const nextTitle = stripLeadingTaskCode(issue.title) || issue.title.trim()
    const nextDescription = normalizeOptionalText(issue.body)
    const githubUpdatedAt = parseTimestamp(issue.updatedAt)
    const existingLink = await ctx.db
      .query("githubTaskLinks")
      .withIndex("by_github_issue", (q) => q.eq("githubIssueId", issue.id))
      .unique()

    if (existingLink) {
      const linkedTask = await ctx.db.get(existingLink.taskId)

      if (!linkedTask) {
        await ctx.db.delete(existingLink._id)
      } else {
        const hasPendingLocalChanges =
          getTaskUpdatedAt(linkedTask) > existingLink.lastSyncedAt
        const nextStatus = deriveTaskStatusFromIssueState(
          linkedTask.status,
          issue.state
        )
        const shouldApplyGithubIssueContent = !hasPendingLocalChanges
        const shouldApplyGithubIssueStatus =
          nextStatus !== linkedTask.status &&
          (!hasPendingLocalChanges || issue.state === "closed")

        if (shouldApplyGithubIssueContent || shouldApplyGithubIssueStatus) {
          const updates: Partial<Doc<"tasks">> = shouldApplyGithubIssueContent
            ? {
            title: nextTitle,
            description: nextDescription,
            updatedAt: githubUpdatedAt,
          }
            : {
                updatedAt: Math.max(getTaskUpdatedAt(linkedTask), githubUpdatedAt),
              }

          if (shouldApplyGithubIssueStatus) {
            const workspaceTasks = await ctx.db
              .query("tasks")
              .withIndex("by_workspace", (q) =>
                q.eq("workspaceId", integration.workspaceId)
              )
              .collect()

            updates.status = nextStatus
            updates.order = workspaceTasks.filter(
              (task) => task._id !== linkedTask._id && task.status === nextStatus
            ).length
          }

          if (
            shouldApplyGithubIssueContent &&
            (!linkedTask.source || linkedTask.source.platform === "github")
          ) {
            updates.source = nextSource
          }
          {
            const existing = linkedTask.sources ?? (linkedTask.source ? [linkedTask.source] : [])
            const filtered = existing.filter(
              (s) => !(s.platform === nextSource.platform && s.url === nextSource.url)
            )
            updates.sources = [...filtered, nextSource]
          }

          await ctx.db.patch(linkedTask._id, updates)
        }

        await ctx.db.patch(existingLink._id, {
          githubRepositoryId: issue.repository.id,
          githubRepositoryName: issue.repository.name,
          githubRepositoryFullName: issue.repository.fullName,
          githubIssueNumber: issue.number,
          githubIssueUrl: issue.htmlUrl,
          lastGithubUpdatedAt: issue.updatedAt,
          lastSyncedAt: hasPendingLocalChanges
            ? existingLink.lastSyncedAt
            : Date.now(),
        })
        return linkedTask._id
      }
    }

    if (
      nextSource.url &&
      (await isDeletedGitHubTaskSource(
        ctx,
        integration.workspaceId,
        nextSource.url
      ))
    ) {
      return null
    }

    const workspaceTasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", integration.workspaceId))
      .collect()
    const workspaceLinks = await ctx.db
      .query("githubTaskLinks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", integration.workspaceId))
      .collect()
    const linkedTaskIds = new Set(workspaceLinks.map((link) => link.taskId))
    const mentionedCodes = new Set(
      extractTaskCodes(issue.title, issue.body).map((taskCode) =>
        taskCode.toUpperCase()
      )
    )

    const matchedTask =
      workspaceTasks.find(
        (task) =>
          !linkedTaskIds.has(task._id) &&
          mentionedCodes.has(task.taskCode.toUpperCase())
      ) ??
      workspaceTasks.find(
        (task) =>
          !linkedTaskIds.has(task._id) &&
          normalizeTitle(task.title) === normalizeTitle(nextTitle)
      )

    if (matchedTask) {
      const nextStatus = deriveTaskStatusFromIssueState(
        matchedTask.status,
        issue.state
      )
      const updates: Partial<Doc<"tasks">> = {
        title: nextTitle,
        description: nextDescription,
        updatedAt: githubUpdatedAt,
      }

      if (nextStatus !== matchedTask.status) {
        updates.status = nextStatus
        updates.order = workspaceTasks.filter(
          (task) => task._id !== matchedTask._id && task.status === nextStatus
        ).length
      }

      if (!matchedTask.source || matchedTask.source.platform === "github") {
        updates.source = nextSource
      }
      {
        const existing = matchedTask.sources ?? (matchedTask.source ? [matchedTask.source] : [])
        const filtered = existing.filter(
          (s) => !(s.platform === nextSource.platform && s.url === nextSource.url)
        )
        updates.sources = [...filtered, nextSource]
      }

      await ctx.db.patch(matchedTask._id, updates)
      await insertWorkspaceLog(ctx, {
        workspaceId: integration.workspaceId,
        category: "tasks",
        type: matchedTask.status !== nextStatus ? "task_moved" : "task_updated",
        message:
          matchedTask.status !== nextStatus
            ? `${matchedTask.taskCode} moved from "${matchedTask.status}" to "${nextStatus}"`
            : `${matchedTask.taskCode} updated`,
        source: "github",
      })
      await ctx.runMutation(internal.github.saveGitHubTaskLink, {
        workspaceId: integration.workspaceId,
        taskId: matchedTask._id,
        installationId: integration.installationId,
        githubRepositoryId: issue.repository.id,
        githubRepositoryName: issue.repository.name,
        githubRepositoryFullName: issue.repository.fullName,
        githubIssueId: issue.id,
        githubIssueNumber: issue.number,
        githubIssueUrl: issue.htmlUrl,
        lastGithubUpdatedAt: issue.updatedAt,
      })
      return matchedTask._id
    }

    if (issue.state === "closed") {
      return null
    }

    const nextTaskNumber =
      Math.max(
        workspace.taskCounter ?? 0,
        ...workspaceTasks.map((task) => task.taskNumber)
      ) + 1
    const taskStatus = mapIssueStateToNewTaskStatus(issue.state)
    const createdTaskId = await ctx.db.insert("tasks", {
      workspaceId: integration.workspaceId,
      taskCode: `${workspace.prefix || "MED"}-${nextTaskNumber}`,
      taskNumber: nextTaskNumber,
      title: nextTitle,
      description: nextDescription,
      status: taskStatus,
      priority: "none",
      labels: [],
      order: workspaceTasks.filter((task) => task.status === taskStatus).length,
      project: workspace.name,
      updatedAt: githubUpdatedAt,
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

    await ctx.runMutation(internal.github.saveGitHubTaskLink, {
      workspaceId: integration.workspaceId,
      taskId: createdTaskId,
      installationId: integration.installationId,
      githubRepositoryId: issue.repository.id,
      githubRepositoryName: issue.repository.name,
      githubRepositoryFullName: issue.repository.fullName,
      githubIssueId: issue.id,
      githubIssueNumber: issue.number,
      githubIssueUrl: issue.htmlUrl,
      lastGithubUpdatedAt: issue.updatedAt,
    })

    await insertWorkspaceLog(ctx, {
      workspaceId: integration.workspaceId,
      category: "tasks",
      type: "task_created",
      message: `Task ${workspace.prefix || "MED"}-${nextTaskNumber} "${nextTitle}" created`,
      source: "github",
    })

    return createdTaskId
  },
})

export const syncIssueFromWebhook = internalAction({
  args: {
    integrationId: v.id("githubWorkspaceIntegrations"),
    issue: githubIssueValidator,
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(
      internal.github.getGitHubIntegrationById,
      { integrationId: args.integrationId }
    )
    if (!integration || integration.issueSyncEnabled === false) {
      return { ok: false, skipped: true }
    }

    await ctx.runMutation(internal.github.upsertTaskFromGitHubIssue, {
      integrationId: args.integrationId,
      issue: args.issue,
    })
    return { ok: true }
  },
})

export const refreshWorkspaceGitHubRepositories = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args): Promise<RefreshRepositoriesResult> => {
    return await refreshRepositoriesForWorkspace(ctx, args.workspaceId)
  },
})

export const syncTaskToGitHubIssue = internalAction({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args): Promise<SyncTaskToGitHubIssueResult> => {
    const snapshot: {
      task: Doc<"tasks">
      integration: Doc<"githubWorkspaceIntegrations">
      link: Doc<"githubTaskLinks"> | null
    } | null = await ctx.runQuery(internal.github.getLinkedTaskSnapshot, {
      taskId: args.taskId,
    })

    if (!snapshot) {
      return { skipped: true }
    }

    if (snapshot.integration.issueSyncEnabled === false) {
      return { skipped: true }
    }

    if (
      snapshot.link &&
      (snapshot.task.updatedAt ?? snapshot.task._creationTime) <=
        snapshot.link.lastSyncedAt
    ) {
      return { skipped: true }
    }

    const integration = snapshot.integration
    const link = snapshot.link
    const installationToken = await createInstallationAccessToken(
      integration.installationId
    )
    const issueInput: {
      title: string
      body: string
      state: "open" | "closed"
    } = {
      title: buildManagedIssueTitle(snapshot.task),
      body: buildManagedIssueBody(snapshot.task),
      state: mapTaskStatusToIssueState(snapshot.task.status),
    }

    let repository: GitHubRepository | null =
      link
        ? integration.repositories.find(
            (item: GitHubRepository) => item.id === link.githubRepositoryId
          ) ?? null
        : null

    if (!repository) {
      repository =
        integration.repositories.find(
          (item: GitHubRepository) => item.id === integration.defaultRepoId
        ) ?? null
    }

    if (!repository) {
      return { skipped: true, reason: "no_repository" as const }
    }

    let issue: GitHubRestIssue

    if (link) {
      try {
        issue = await updateRepositoryIssue(
          installationToken,
          repository.fullName,
          link.githubIssueNumber,
          issueInput
        )
      } catch (error) {
        if (!(error instanceof GitHubApiError) || error.status !== 404) {
          throw error
        }

        issue = await createRepositoryIssue(
          installationToken,
          repository.fullName,
          issueInput
        )
      }
    } else {
      issue = await createRepositoryIssue(
        installationToken,
        repository.fullName,
        issueInput
      )
    }

    const normalizedIssue = normalizeIssue(issue, repository)
    if (!normalizedIssue) {
      throw new Error("GitHub returned an incomplete issue payload")
    }

    await ctx.runMutation(internal.github.saveGitHubTaskLink, {
      workspaceId: integration.workspaceId,
      taskId: snapshot.task._id,
      installationId: integration.installationId,
      githubRepositoryId: repository.id,
      githubRepositoryName: repository.name,
      githubRepositoryFullName: repository.fullName,
      githubIssueId: normalizedIssue.id,
      githubIssueNumber: normalizedIssue.number,
      githubIssueUrl: normalizedIssue.htmlUrl,
      lastGithubUpdatedAt: normalizedIssue.updatedAt,
    })
    await ctx.runMutation(internal.github.markGitHubIntegrationSyncedAt, {
      integrationId: integration._id,
      syncedAt: Date.now(),
    })

    return {
      skipped: false,
      repositoryFullName: repository.fullName,
      issueNumber: normalizedIssue.number,
    }
  },
})

export const performWorkspaceGitHubSync = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args): Promise<WorkspaceGitHubSyncResult> => {
    const { repositories }: RefreshRepositoriesResult =
      await refreshRepositoriesForWorkspace(
      ctx,
      args.workspaceId
    )
    const integration = await ctx.runQuery(
      internal.github.getGitHubIntegrationForWorkspace,
      {
        workspaceId: args.workspaceId,
      }
    )

    if (!integration) {
      throw new Error("No GitHub integration found for this workspace")
    }

    const installationToken = await createInstallationAccessToken(
      integration.installationId
    )
    const selectedRepoIds = new Set(integration.selectedRepoIds)
    const selectedRepositories: GitHubRepository[] = repositories.filter(
      (repository: GitHubRepository) => selectedRepoIds.has(repository.id)
    )
    const taskSyncStatesBeforeImport = await ctx.runQuery(
      internal.github.listWorkspaceTaskSyncStates,
      {
        workspaceId: args.workspaceId,
      }
    )
    const forcedPushTaskIds = new Set(
      taskSyncStatesBeforeImport
        .filter(
          (item: {
            link: { lastSyncedAt: number } | null
            task: Doc<"tasks">
          }) =>
            item.link === null ||
            getTaskUpdatedAt(item.task) > item.link.lastSyncedAt
        )
        .map((item: { task: Doc<"tasks"> }) => String(item.task._id))
    )
    const importedIssueStates = new Map<string, "open" | "closed">()

    let importedCount = 0
    for (const repository of selectedRepositories) {
      const issues = await listRepositoryIssues(installationToken, repository)
      for (const issue of issues) {
        importedIssueStates.set(issue.id, issue.state)
        const taskId = await ctx.runMutation(internal.github.upsertTaskFromGitHubIssue, {
          integrationId: integration._id,
          issue,
        })
        if (taskId) {
          importedCount += 1
        }
      }
    }

    const taskSyncStates = await ctx.runQuery(
      internal.github.listWorkspaceTaskSyncStates,
      {
        workspaceId: args.workspaceId,
      }
    )
    let pushedCount = 0

    for (const item of taskSyncStates) {
      const taskUpdatedAt = getTaskUpdatedAt(item.task)
      const importedIssueState = item.link
        ? importedIssueStates.get(item.link.githubIssueId)
        : undefined
      const hasImportedStateMismatch =
        importedIssueState !== undefined &&
        importedIssueState !== mapTaskStatusToIssueState(item.task.status)
      const needsPush =
        item.link === null ||
        forcedPushTaskIds.has(String(item.task._id)) ||
        taskUpdatedAt > item.link.lastSyncedAt ||
        hasImportedStateMismatch

      if (!needsPush) continue

      const result = await ctx.runAction(internal.github.syncTaskToGitHubIssue, {
        taskId: item.task._id,
      })
      if (!result.skipped) {
        pushedCount += 1
      }
    }

    await ctx.runMutation(internal.github.markGitHubIntegrationSyncedAt, {
      integrationId: integration._id,
      syncedAt: Date.now(),
    })

    return {
      importedCount,
      pushedCount,
      repositoryCount: selectedRepositories.length,
    }
  },
})

export const beginWorkspaceGitHubConnect = action({
  args: {
    workspaceId: v.id("workspaces"),
    redirectUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.github.assertWorkspaceAdminAccess, {
      workspaceId: args.workspaceId,
    })

    const redirectUrl = new URL(args.redirectUrl)
    if (!["http:", "https:"].includes(redirectUrl.protocol)) {
      throw new Error("Invalid redirect URL")
    }

    const identity = await ctx.runQuery(
      internal.github.getWorkspaceMembershipUserId,
      {
        workspaceId: args.workspaceId,
      }
    )
    const state = crypto.randomUUID().replace(/-/g, "")

    await ctx.runMutation(internal.github.saveGitHubInstallState, {
      workspaceId: args.workspaceId,
      initiatedByUserId: identity.userId,
      state,
      redirectUrl: redirectUrl.toString(),
      expiresAt: Date.now() + GITHUB_INSTALL_STATE_TTL_MS,
    })

    logInfo("Starting GitHub App installation flow", {
      workspaceId: args.workspaceId,
      callbackUrl: getGitHubCallbackUrl(),
      webhookUrl: getGitHubWebhookUrl(),
    })

    return {
      installUrl: buildInstallUrl(state),
    }
  },
})

export const updateWorkspaceGitHubFeatureToggles = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    issueSyncEnabled: v.boolean(),
    prAutomationEnabled: v.boolean(),
    commitAutomationEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAdminAccess(ctx, args.workspaceId)

    const integration = await ctx.db
      .query("githubWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()

    if (!integration) {
      throw new Error("GitHub integration not found")
    }

    await ctx.db.patch(integration._id, {
      issueSyncEnabled: args.issueSyncEnabled,
      prAutomationEnabled: args.prAutomationEnabled,
      commitAutomationEnabled: args.commitAutomationEnabled,
    })
  },
})

export const updateWorkspaceGitHubRepositories = action({
  args: {
    workspaceId: v.id("workspaces"),
    selectedRepoIds: v.array(v.string()),
    defaultRepoId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<RepositorySelection> => {
    await ctx.runMutation(internal.github.assertWorkspaceAdminAccess, {
      workspaceId: args.workspaceId,
    })

    const refreshed: RefreshRepositoriesResult = await ctx.runAction(
      internal.github.refreshWorkspaceGitHubRepositories,
      {
        workspaceId: args.workspaceId,
      }
    )
    const repositories: GitHubRepository[] = refreshed.repositories
    const repositoryIds = new Set(
      repositories.map((repository: GitHubRepository) => repository.id)
    )

    for (const repoId of args.selectedRepoIds) {
      if (!repositoryIds.has(repoId)) {
        throw new Error("One or more selected repositories are no longer installed")
      }
    }

    if (args.defaultRepoId && !args.selectedRepoIds.includes(args.defaultRepoId)) {
      throw new Error("Default repository must also be selected")
    }

    const selection: RepositorySelection = await ctx.runMutation(
      internal.github.saveWorkspaceGitHubRepositories,
      {
        workspaceId: args.workspaceId,
        repositories,
        selectedRepoIds: args.selectedRepoIds,
        defaultRepoId: args.defaultRepoId,
      }
    )

    return selection
  },
})

export const syncWorkspaceGitHubIntegration = action({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args): Promise<WorkspaceGitHubSyncResult> => {
    await ctx.runMutation(internal.github.assertWorkspaceAdminAccess, {
      workspaceId: args.workspaceId,
    })

    return await ctx.runAction(internal.github.performWorkspaceGitHubSync, {
      workspaceId: args.workspaceId,
    })
  },
})

export const disconnectWorkspaceGitHubIntegration = action({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.github.assertWorkspaceAdminAccess, {
      workspaceId: args.workspaceId,
    })

    await ctx.runMutation(internal.github.clearWorkspaceGitHubIntegration, {
      workspaceId: args.workspaceId,
    })

    await ctx.runMutation(internal.logs.recordWorkspaceLog, {
      workspaceId: args.workspaceId,
      category: "integrations",
      type: "integration_disconnected",
      message: "GitHub integration disconnected",
      source: "github",
    })

    return { success: true }
  },
})

export const processPullRequestWebhook = internalAction({
  args: {
    integrationId: v.id("githubWorkspaceIntegrations"),
    githubRepositoryId: v.string(),
    githubRepositoryFullName: v.string(),
    pullRequestNumber: v.number(),
    url: v.optional(v.string()),
    title: v.string(),
    body: v.optional(v.string()),
    state: v.string(),
    draft: v.boolean(),
    merged: v.boolean(),
  },
  handler: async (ctx, args): Promise<{ matchedTaskCount: number }> => {
    const linkedIntegration: Doc<"githubWorkspaceIntegrations"> | null =
      await ctx.runQuery(
      internal.github.getGitHubIntegrationById,
      {
        integrationId: args.integrationId,
      }
    )
    if (!linkedIntegration) {
      throw new Error("GitHub integration not found")
    }

    if (linkedIntegration.prAutomationEnabled === false) {
      return { matchedTaskCount: 0 }
    }

    const taskCodes = extractTaskCodes(args.title, args.body)
    if (taskCodes.length === 0) {
      return { matchedTaskCount: 0 }
    }

    const tasks: Doc<"tasks">[] = await ctx.runQuery(internal.github.listTasksByCodes, {
      workspaceId: linkedIntegration.workspaceId,
      taskCodes,
    })
    const nextStatus = args.merged
      ? "shipped"
      : args.state === "open" && args.draft
        ? "in_progress"
        : args.state === "open"
        ? "ready"
        : null

    for (const task of tasks) {
      await ctx.runMutation(internal.github.recordGitHubDevelopmentRef, {
        workspaceId: linkedIntegration.workspaceId,
        taskId: task._id,
        refType: "pull_request",
        githubRepositoryId: args.githubRepositoryId,
        githubRepositoryFullName: args.githubRepositoryFullName,
        githubObjectId: `pr:${args.githubRepositoryId}:${args.pullRequestNumber}`,
        pullRequestNumber: args.pullRequestNumber,
        url: args.url,
        state: args.merged ? "merged" : args.draft ? "draft" : args.state,
        isOpen: args.state === "open",
        isMerged: args.merged,
      })

      if (nextStatus) {
        await ctx.runMutation(internal.github.applyGitHubDerivedTaskStatus, {
          taskId: task._id,
          status: nextStatus,
        })
      }
    }

    return {
      matchedTaskCount: tasks.length,
    }
  },
})

export const getGitHubIntegrationById = internalQuery({
  args: {
    integrationId: v.id("githubWorkspaceIntegrations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.integrationId)
  },
})

export const processPushWebhook = internalAction({
  args: {
    integrationId: v.id("githubWorkspaceIntegrations"),
    githubRepositoryId: v.string(),
    githubRepositoryFullName: v.string(),
    isDefaultBranch: v.boolean(),
    commits: v.array(
      v.object({
        sha: v.string(),
        message: v.string(),
        url: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args): Promise<{ matchedTaskCount: number }> => {
    const integration: Doc<"githubWorkspaceIntegrations"> | null =
      await ctx.runQuery(internal.github.getGitHubIntegrationById, {
        integrationId: args.integrationId,
      })
    if (!integration) {
      throw new Error("GitHub integration not found")
    }

    if (integration.commitAutomationEnabled === false) {
      return { matchedTaskCount: 0 }
    }

    let matchedTaskCount = 0
    for (const commit of args.commits) {
      const taskCodes = extractTaskCodes(commit.message)
      if (taskCodes.length === 0) continue

      const tasks = await ctx.runQuery(internal.github.listTasksByCodes, {
        workspaceId: integration.workspaceId,
        taskCodes,
      })

      for (const task of tasks) {
        await ctx.runMutation(internal.github.recordGitHubDevelopmentRef, {
          workspaceId: integration.workspaceId,
          taskId: task._id,
          refType: "commit",
          githubRepositoryId: args.githubRepositoryId,
          githubRepositoryFullName: args.githubRepositoryFullName,
          githubObjectId: `commit:${commit.sha}`,
          commitSha: commit.sha,
          url: commit.url,
          state: args.isDefaultBranch ? "default_branch" : "branch_push",
          isDefaultBranch: args.isDefaultBranch,
        })

        await ctx.runMutation(internal.github.applyGitHubDerivedTaskStatus, {
          taskId: task._id,
          status: args.isDefaultBranch ? "shipped" : "in_progress",
        })
      }

      matchedTaskCount += tasks.length
    }

    return {
      matchedTaskCount,
    }
  },
})

export const githubInstallCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url)
  const stateToken = url.searchParams.get("state")
  const installationId = url.searchParams.get("installation_id")
  const setupAction = url.searchParams.get("setup_action")

  if (!stateToken) {
    return new Response("Missing installation state", { status: 400 })
  }

  const state = await ctx.runQuery(internal.github.getGitHubInstallStateByState, {
    state: stateToken,
  })

  if (!state) {
    return new Response("Unknown installation state", { status: 404 })
  }

  if (state.completedAt || state.expiresAt <= Date.now()) {
    return Response.redirect(
      formatStatusRedirect(
        state.redirectUrl,
        "error",
        "That GitHub connection link has expired."
      ),
      302
    )
  }

  if (setupAction === "cancelled") {
    return Response.redirect(
      formatStatusRedirect(
        state.redirectUrl,
        "error",
        "GitHub installation was cancelled."
      ),
      302
    )
  }

  if (!installationId) {
    return Response.redirect(
      formatStatusRedirect(
        state.redirectUrl,
        "error",
        "GitHub did not return an installation id."
      ),
      302
    )
  }

  try {
    const installation = await fetchInstallation(installationId)
    const installationToken = await createInstallationAccessToken(installationId)
    const repositories = await listInstallationRepositories(installationToken)
    const issueSyncEnabledByDefault = false

    await ctx.runMutation(internal.github.clearWorkspaceGitHubIntegration, {
      workspaceId: state.workspaceId,
    })
    const integrationId = await ctx.runMutation(
      internal.github.saveWorkspaceGitHubIntegration,
      {
        workspaceId: state.workspaceId,
        installationId,
        accountId: installation.accountId,
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        repositories,
        selectedRepoIds: repositories.map((repository) => repository.id),
        defaultRepoId: repositories[0]?.id,
        issueSyncEnabled: issueSyncEnabledByDefault,
        prAutomationEnabled: true,
        commitAutomationEnabled: true,
        connectedByUserId: state.initiatedByUserId,
      }
    )

    await ctx.runMutation(internal.github.markGitHubInstallStateCompleted, {
      stateId: state._id,
    })

    let syncResult: WorkspaceGitHubSyncResult | null = null
    if (issueSyncEnabledByDefault && repositories.length > 0) {
      syncResult = await ctx.runAction(internal.github.performWorkspaceGitHubSync, {
        workspaceId: state.workspaceId,
      })
    }

    logInfo("Completed GitHub installation callback", {
      workspaceId: state.workspaceId,
      installationId,
      integrationId,
      repositoryCount: repositories.length,
      syncResult,
    })

    await ctx.runMutation(internal.logs.recordWorkspaceLog, {
      workspaceId: state.workspaceId,
      category: "integrations",
      type: "integration_connected",
      message: `GitHub integration connected to ${installation.accountLogin}`,
      source: "github",
    })

    const message =
      syncResult === null
        ? `Connected ${installation.accountLogin}. Issue sync is off by default, so Median won't import GitHub issues until you enable it or run a manual sync.`
        : `Connected ${installation.accountLogin} and synced ${syncResult.importedCount} GitHub issue${syncResult.importedCount === 1 ? "" : "s"}.`

    return Response.redirect(
      formatStatusRedirect(
        state.redirectUrl,
        "connected",
        message
      ),
      302
    )
  } catch (error) {
    logError("Failed to complete GitHub installation callback", error, {
      workspaceId: state.workspaceId,
      installationId,
    })
    return Response.redirect(
      formatStatusRedirect(
        state.redirectUrl,
        "error",
        error instanceof Error
          ? error.message
          : "Failed to connect the GitHub installation."
      ),
      302
    )
  }
})

export const githubWebhook = httpAction(async (ctx, request) => {
  const signature = request.headers.get("x-hub-signature-256")
  if (!signature) {
    return new Response("Missing signature", { status: 401 })
  }

  const bodyText = await request.text()
  const expectedSignature = await signWebhookPayload(
    getGitHubWebhookSecret(),
    bodyText
  )

  if (!timingSafeEqualString(signature, expectedSignature)) {
    return new Response("Invalid signature", { status: 401 })
  }

  const deliveryId = request.headers.get("x-github-delivery")
  const eventType = request.headers.get("x-github-event") ?? "unknown"
  if (!deliveryId) {
    return new Response("Missing delivery id", { status: 400 })
  }

  const payload = JSON.parse(bodyText) as
    | GitHubIssueWebhookPayload
    | GitHubPullRequestWebhookPayload
    | GitHubPushWebhookPayload
    | GitHubInstallationRepositoriesPayload
    | GitHubInstallationPayload
  const installationId =
    payload.installation?.id !== undefined &&
    payload.installation.id !== null
      ? String(payload.installation.id)
      : null

  if (!installationId) {
    return new Response("Ignored", { status: 200 })
  }

  const integration = await ctx.runQuery(
    internal.github.getGitHubIntegrationByInstallationId,
    {
      installationId,
    }
  )

  if (!integration) {
    return new Response("Ignored", { status: 200 })
  }

  const action = "action" in payload ? payload.action : undefined
  const accepted = await ctx.runMutation(
    internal.github.recordGitHubWebhookDelivery,
    {
      deliveryId,
      workspaceId: integration.workspaceId,
      installationId,
      eventType,
      action,
    }
  )

  if (!accepted) {
    return new Response("Duplicate delivery", { status: 200 })
  }

  try {
    if (eventType === "issues") {
      const issuePayload = payload as GitHubIssueWebhookPayload
      const repository = issuePayload.repository
        ? normalizeRepository(issuePayload.repository)
        : null
      const issue =
        repository && issuePayload.issue
          ? normalizeIssue(issuePayload.issue, repository)
          : null

      if (!repository || !issue) {
        return new Response("Ignored", { status: 200 })
      }

      await ctx.runAction(internal.github.syncIssueFromWebhook, {
        integrationId: integration._id,
        issue,
      })

      return new Response("OK", { status: 200 })
    }

    if (eventType === "pull_request") {
      const prPayload = payload as GitHubPullRequestWebhookPayload
      const repository = prPayload.repository
        ? normalizeRepository(prPayload.repository)
        : null
      const pullRequest = prPayload.pull_request

      if (!repository || !pullRequest?.number || !pullRequest.title) {
        return new Response("Ignored", { status: 200 })
      }

      await ctx.runAction(internal.github.processPullRequestWebhook, {
        integrationId: integration._id,
        githubRepositoryId: repository.id,
        githubRepositoryFullName: repository.fullName,
        pullRequestNumber: pullRequest.number,
        url: normalizeOptionalText(pullRequest.html_url),
        title: pullRequest.title,
        body: normalizeOptionalText(pullRequest.body),
        state: pullRequest.state ?? "closed",
        draft: Boolean(pullRequest.draft),
        merged: Boolean(pullRequest.merged),
      })

      return new Response("OK", { status: 200 })
    }

    if (eventType === "push") {
      const pushPayload = payload as GitHubPushWebhookPayload
      const repository = pushPayload.repository
        ? normalizeRepository(pushPayload.repository)
        : null
      if (!repository) {
        return new Response("Ignored", { status: 200 })
      }

      const ref = normalizeOptionalText(pushPayload.ref)
      const isDefaultBranch =
        ref === `refs/heads/${repository.defaultBranch ?? ""}`
      const commits = (pushPayload.commits ?? [])
        .map((commit) => {
          const sha = commit.id?.trim()
          const message = commit.message?.trim()
          if (!sha || !message) return null
          return {
            sha,
            message,
            url: normalizeOptionalText(commit.url),
          }
        })
        .filter(Boolean) as Array<{
        sha: string
        message: string
        url?: string
      }>

      if (commits.length === 0) {
        return new Response("Ignored", { status: 200 })
      }

      await ctx.runAction(internal.github.processPushWebhook, {
        integrationId: integration._id,
        githubRepositoryId: repository.id,
        githubRepositoryFullName: repository.fullName,
        isDefaultBranch,
        commits,
      })

      return new Response("OK", { status: 200 })
    }

    if (eventType === "installation_repositories") {
      await ctx.runAction(internal.github.refreshWorkspaceGitHubRepositories, {
        workspaceId: integration.workspaceId,
      })
      return new Response("OK", { status: 200 })
    }

    if (eventType === "installation" && action === "deleted") {
      await ctx.runMutation(internal.github.clearWorkspaceGitHubIntegration, {
        workspaceId: integration.workspaceId,
      })
      return new Response("OK", { status: 200 })
    }

    return new Response("Ignored", { status: 200 })
  } catch (error) {
    logError("Failed to process GitHub webhook", error, {
      eventType,
      installationId,
      workspaceId: integration.workspaceId,
    })
    await ctx.runMutation(internal.logs.recordWorkspaceLog, {
      workspaceId: integration.workspaceId,
      category: "webhooks",
      type: "webhook_error",
      message: `GitHub webhook failed: ${eventType}`,
      source: "github",
    })
    return new Response("Webhook error", { status: 500 })
  }
})
