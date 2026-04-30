import { v } from "convex/values"
import { httpAction, internalAction } from "./_generated/server"
import { makeFunctionReference } from "convex/server"
import type { Doc, Id } from "./_generated/dataModel"

const getLastDeploymentFn = makeFunctionReference<
  "query",
  { repoFullName: string },
  Doc<"deployments"> | null
>("changelogDeploymentData:getLastDeployment")

const getDeploymentCountForDateFn = makeFunctionReference<
  "query",
  { repoFullName: string; datePrefix: string },
  number
>("changelogDeploymentData:getDeploymentCountForDate")

const recordDeploymentFn = makeFunctionReference<
  "mutation",
  { sha: string; version: string; repoFullName: string; deployedAt: number },
  Id<"deployments">
>("changelogDeploymentData:recordDeployment")

const internalCreateFn = makeFunctionReference<
  "mutation",
  {
    title: string
    slug?: string
    excerpt?: string
    content: string
    version?: string
    deploymentSha?: string
  },
  Id<"changelogEntries">
>("changelogEntries:internalCreate")

const processDeploymentFn = makeFunctionReference<
  "action",
  { sha: string; repoFullName: string; deployedAt?: number },
  null
>("changelogDeployments:processDeployment")

const GITHUB_API = "https://api.github.com"

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function getChangelogWebhookSecret() {
  return getRequiredEnv("CHANGELOG_GITHUB_WEBHOOK_SECRET")
}

function getChangelogGithubToken() {
  return process.env.CHANGELOG_GITHUB_TOKEN?.trim() || null
}

function getAnthropicApiKey() {
  return getRequiredEnv("ANTHROPIC_API_KEY")
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

async function signPayload(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))
  return `sha256=${bytesToHex(new Uint8Array(sig))}`
}

function timingSafeEqual(a: string, b: string) {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let mismatch = 0
  for (let i = 0; i < ab.length; i++) mismatch |= ab[i]! ^ bb[i]!
  return mismatch === 0
}

async function githubGet(path: string, token: string | null) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${GITHUB_API}${path}`, { headers })
  if (!res.ok) throw new Error(`GitHub API ${path} → ${res.status}`)
  return res.json()
}

// Returns the tag name if this SHA has a tag, otherwise null.
async function findTagForSha(
  repoFullName: string,
  sha: string,
  token: string | null
): Promise<string | null> {
  try {
    // Fetch last 30 tags
    const tags = (await githubGet(
      `/repos/${repoFullName}/tags?per_page=30`,
      token
    )) as Array<{ name: string; commit: { sha: string } }>
    const match = tags.find((t) => t.commit.sha === sha)
    return match?.name ?? null
  } catch {
    return null
  }
}

async function fetchCommits(
  repoFullName: string,
  headSha: string,
  baseSha: string | null,
  token: string | null
): Promise<Array<{ sha: string; message: string }>> {
  if (baseSha) {
    const data = (await githubGet(
      `/repos/${repoFullName}/compare/${baseSha}...${headSha}`,
      token
    )) as { commits: Array<{ sha: string; commit: { message: string } }> }
    return data.commits.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
    }))
  }

  const data = (await githubGet(
    `/repos/${repoFullName}/commits?sha=${headSha}&per_page=50`,
    token
  )) as Array<{ sha: string; commit: { message: string } }>
  return data.map((c) => ({ sha: c.sha, message: c.commit.message }))
}

// Versioning (looks like this: 2026.04.30-1)
function buildCalver(deployedAt: number, countToday: number): string {
  const d = new Date(deployedAt)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  const base = `${y}.${m}.${day}`
  return countToday <= 1 ? base : `${base}-${countToday}`
}

type ChangeGroup = { category: string; items: string[] }

function buildTipTapDoc(excerpt: string, changes: ChangeGroup[]): string {
  const content: unknown[] = []

  if (excerpt) {
    content.push({
      type: "paragraph",
      content: [{ type: "text", text: excerpt }],
    })
  }

  for (const group of changes) {
    if (group.items.length === 0) continue
    content.push({
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: group.category }],
    })
    content.push({
      type: "bulletList",
      content: group.items.map((item) => ({
        type: "listItem",
        content: [
          { type: "paragraph", content: [{ type: "text", text: item }] },
        ],
      })),
    })
  }

  return JSON.stringify({ type: "doc", content })
}

type ClaudeChangelog = {
  title: string
  excerpt: string
  changes: ChangeGroup[]
}

async function generateWithClaude(
  commits: Array<{ sha: string; message: string }>,
  apiKey: string
): Promise<ClaudeChangelog> {
  const commitList = commits
    .slice(0, 80) // cap to avoid token blow-up
    .map((c) => `- ${c.message.split("\n")[0]?.trim()}`)
    .join("\n")

  const prompt = `You are writing a user-facing changelog entry for an open-source project.

Here are the commits that went into this deployment:
${commitList}

Write a changelog entry. Respond with ONLY valid JSON in this exact shape:
{
  "title": "short title describing the release (max 60 chars)",
  "excerpt": "one paragraph summary for users (2-3 sentences)",
  "changes": [
    { "category": "Features", "items": ["...", "..."] },
    { "category": "Improvements", "items": ["..."] },
    { "category": "Fixes", "items": ["..."] }
  ]
}

Rules:
- Only include categories that have real items. Omit empty categories.
- Skip purely internal/infra commits (dependency bumps, CI changes, lock files) unless they affect users.
- Write items in plain language for users, not developers.
- If all commits are internal with no user impact, return an empty changes array and note it in the excerpt.`

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${text}`)
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text: string }>
  }
  const text = data.content.find((b) => b.type === "text")?.text ?? ""

  // Extract JSON if returned as markdown
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error("Claude returned no JSON")
  return JSON.parse(jsonMatch[0]) as ClaudeChangelog
}

export const processDeployment = internalAction({
  args: {
    sha: v.string(),
    repoFullName: v.string(),
    deployedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const deployedAt = args.deployedAt ?? Date.now()
    const token = getChangelogGithubToken()
    const apiKey = getAnthropicApiKey()

    // 1. Find tag
    const tag = await findTagForSha(args.repoFullName, args.sha, token)

    // 2. Get prior deployment
    const lastDeployment = await ctx.runQuery(getLastDeploymentFn, {
      repoFullName: args.repoFullName,
    })

    // 3. Determine version
    let version: string
    if (tag) {
      version = tag
    } else {
      const d = new Date(deployedAt)
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, "0")
      const day = String(d.getUTCDate()).padStart(2, "0")
      const datePrefix = `${y}.${m}.${day}`
      const countToday = await ctx.runQuery(getDeploymentCountForDateFn, {
        repoFullName: args.repoFullName,
        datePrefix,
      })
      version = buildCalver(deployedAt, countToday + 1)
    }

    // 4. Fetch commits
    const commits = await fetchCommits(
      args.repoFullName,
      args.sha,
      lastDeployment?.sha ?? null,
      token
    )

    // 5. Record this deployment
    await ctx.runMutation(recordDeploymentFn, {
      sha: args.sha,
      version,
      repoFullName: args.repoFullName,
      deployedAt: deployedAt,
    })

    if (commits.length === 0) {
      console.info("[changelog] No commits found for deployment, skipping draft", {
        sha: args.sha,
        version,
      })
      return
    }

    // 6. Generate changelog
    const changelog = await generateWithClaude(commits, apiKey)

    // 7. Build TipTap
    const content = buildTipTapDoc(changelog.excerpt, changelog.changes)

    // 8. Create draft
    await ctx.runMutation(internalCreateFn, {
      title: changelog.title,
      slug: version.replace(/\./g, "-"),
      excerpt: changelog.excerpt,
      content,
      version,
      deploymentSha: args.sha,
    })

    console.info("[changelog] Draft created", { version, sha: args.sha })
  },
})

type DeploymentStatusPayload = {
  action?: string
  deployment_status?: {
    state?: string
    environment?: string
  }
  deployment?: {
    sha?: string
    environment?: string
  }
  repository?: {
    full_name?: string
  }
}

export const deploymentWebhook = httpAction(async (ctx, request) => {
  const signature = request.headers.get("x-hub-signature-256")
  if (!signature) {
    return new Response("Missing signature", { status: 401 })
  }

  const bodyText = await request.text()

  let secret: string
  try {
    secret = getChangelogWebhookSecret()
  } catch {
    return new Response("Webhook not configured", { status: 503 })
  }

  const expected = await signPayload(secret, bodyText)
  if (!timingSafeEqual(signature, expected)) {
    return new Response("Invalid signature", { status: 401 })
  }

  const eventType = request.headers.get("x-github-event") ?? "unknown"
  if (eventType !== "deployment_status") {
    return new Response("Ignored", { status: 200 })
  }

  const payload = JSON.parse(bodyText) as DeploymentStatusPayload

  const state = payload.deployment_status?.state
  const environment =
    payload.deployment_status?.environment ?? payload.deployment?.environment
  const sha = payload.deployment?.sha
  const repoFullName = payload.repository?.full_name

  if (
    state !== "success" ||
    environment !== "production" ||
    !sha ||
    !repoFullName
  ) {
    return new Response("Ignored", { status: 200 })
  }

  await ctx.runAction(processDeploymentFn, {
    sha,
    repoFullName,
    deployedAt: Date.now(),
  })

  return new Response("OK", { status: 200 })
})
