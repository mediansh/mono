/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"

const classifierMock = vi.fn()
const extractorMock = vi.fn()

// Mock the `ai` package so we never hit Anthropic. generateText is called twice
// per pipeline run: once as the classifier (plain text JSON) and once as the
// extractor (structured output via Output.object).
vi.mock("ai", () => ({
  generateText: vi.fn(async (args: { output?: unknown }) => {
    if (args.output) {
      return extractorMock(args)
    }
    return classifierMock(args)
  }),
  Output: {
    object: ({ schema }: { schema: unknown }) => ({ schema }),
  },
}))

// AI model instances — anthropic() tries to read env at call time, so swap to
// plain objects to avoid any side effects when feedbackPipeline imports.
vi.mock("../lib/ai", () => ({
  AI_MODEL_IDS: {
    feedbackClassifier: "anthropic/claude-haiku-4.5",
    feedbackExtractor: "anthropic/claude-sonnet-4.6",
    taskGeneration: "anthropic/claude-sonnet-4.6",
  },
  AI_MODELS: {
    feedbackClassifier: { provider: "test" },
    feedbackExtractor: { provider: "test" },
    taskGeneration: { provider: "test" },
  },
  hasAnthropicApiKey: () => true,
}))

const modules = import.meta.glob("./**/!(*.test).ts")

const ACTIONABLE_CLASSIFICATION = {
  isProductFeedback: true,
  needsTaskAction: true,
  confidence: 0.92,
  summary: "Export button broken",
  reason: "user reports specific bug with concrete repro",
  relevantMessageIds: [] as string[],
}

const CREATE_EXTRACTION = {
  actions: [
    {
      action: "create",
      title: "Fix export button",
      description: "Export in overview dashboard does nothing on click",
      priority: "high",
      labels: ["bug"],
    },
  ],
}

function primeClassifier(classification: Record<string, unknown>) {
  classifierMock.mockResolvedValueOnce({
    text: JSON.stringify(classification),
    usage: { inputTokens: 100, outputTokens: 50 },
  })
}

function primeExtractor(output: unknown) {
  extractorMock.mockResolvedValueOnce({
    output,
    usage: { inputTokens: 200, outputTokens: 80 },
  })
}

beforeEach(() => {
  classifierMock.mockReset()
  extractorMock.mockReset()
})

async function seedSlack(
  t: ReturnType<typeof convexTest>,
  messages: { messageTs: string; content: string; messageCreatedAt: number }[]
) {
  return t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", {
      name: "Acme",
      ownerId: "user_test",
      labels: [
        { name: "bug", color: "red" },
        { name: "feature", color: "blue" },
      ],
      taskCounter: 0,
    })
    const integrationId = await ctx.db.insert("slackWorkspaceIntegrations", {
      workspaceId,
      teamId: "T1",
      teamName: "acme",
      botUserId: "U_BOT",
      accessTokenEncrypted: "enc",
      connectedAt: Date.now(),
      connectedByUserId: "user_test",
      feedbackProcessingState: "idle",
    })
    const messageIds: Id<"slackMessages">[] = []
    for (const m of messages) {
      const id = await ctx.db.insert("slackMessages", {
        workspaceId,
        integrationId,
        teamId: "T1",
        channelId: "C1",
        channelName: "feedback",
        messageTs: m.messageTs,
        permalink: `https://slack.com/archives/C1/p${m.messageTs.replace(".", "")}`,
        authorId: "U1",
        authorUsername: "alice",
        content: m.content,
        messageCreatedAt: m.messageCreatedAt,
        receivedAt: m.messageCreatedAt,
      })
      messageIds.push(id)
    }
    return { workspaceId, integrationId, messageIds }
  })
}

async function seedX(
  t: ReturnType<typeof convexTest>,
  posts: { postId: string; content: string; postCreatedAt: number }[]
) {
  return t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", {
      name: "Acme",
      ownerId: "user_test",
      labels: [{ name: "bug", color: "red" }],
      taskCounter: 0,
    })
    const integrationId = await ctx.db.insert("xWorkspaceIntegrations", {
      workspaceId,
      xUserId: "x_owner",
      username: "acme",
      accessTokenEncrypted: "enc",
      accessTokenSecretEncrypted: "enc2",
      webhookId: "wh_1",
      connectedAt: Date.now(),
      connectedByUserId: "user_test",
      feedbackProcessingState: "idle",
    })
    for (const p of posts) {
      await ctx.db.insert("xPosts", {
        workspaceId,
        integrationId,
        forUserId: "x_owner",
        postId: p.postId,
        permalink: `https://x.com/alice/status/${p.postId}`,
        authorId: "x_alice",
        authorUsername: "alice",
        content: p.content,
        postCreatedAt: p.postCreatedAt,
        receivedAt: p.postCreatedAt,
      })
    }
    return { workspaceId, integrationId }
  })
}

async function seedDiscord(
  t: ReturnType<typeof convexTest>,
  messages: {
    messageId: string
    content: string
    messageCreatedAt: number
    authorHasAdminPrivileges?: boolean
  }[]
) {
  return t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", {
      name: "Acme",
      ownerId: "user_test",
      labels: [{ name: "bug", color: "red" }],
      taskCounter: 0,
    })
    const pairingCodeId = await ctx.db.insert("discordPairingCodes", {
      code: "XYZ",
      guildId: "G1",
      guildName: "acme-guild",
      issuedByDiscordUserId: "dc_alice",
      status: "paired",
      expiresAt: Date.now() + 60_000,
    })
    const integrationId = await ctx.db.insert("discordWorkspaceIntegrations", {
      workspaceId,
      guildId: "G1",
      guildName: "acme-guild",
      pairedByUserId: "user_test",
      pairedAt: Date.now(),
      pairingCodeId,
      feedbackProcessingState: "idle",
    })
    for (const m of messages) {
      await ctx.db.insert("discordMessages", {
        workspaceId,
        integrationId,
        guildId: "G1",
        channelId: "C1",
        channelName: "feedback",
        messageId: m.messageId,
        permalink: `https://discord.com/channels/G1/C1/${m.messageId}`,
        authorId: "dc_alice",
        authorUsername: "alice",
        authorHasAdminPrivileges: m.authorHasAdminPrivileges ?? false,
        content: m.content,
        messageCreatedAt: m.messageCreatedAt,
        receivedAt: m.messageCreatedAt,
      })
    }
    return { workspaceId, integrationId }
  })
}

describe("Slack feedback end-to-end", () => {
  test("actionable feedback creates a task and advances the cursor", async () => {
    const t = convexTest(schema, modules)
    const { workspaceId, integrationId } = await seedSlack(t, [
      {
        messageTs: "1700000001.000100",
        content: "Your export button is broken — clicking does nothing",
        messageCreatedAt: 1_700_000_000_000,
      },
    ])

    primeClassifier({
      ...ACTIONABLE_CLASSIFICATION,
      relevantMessageIds: ["1700000001.000100"],
    })
    primeExtractor(CREATE_EXTRACTION)

    const result = await t.action(
      internal.slackFeedback.processFeedbackWindow,
      { integrationId }
    )

    expect(classifierMock).toHaveBeenCalledOnce()
    expect(extractorMock).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      skipped: false,
      createdTaskCount: 1,
      updatedTaskCount: 0,
    })

    const tasks = await t.run(async (ctx) =>
      ctx.db
        .query("tasks")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect()
    )
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      title: "Fix export button",
      status: "requests",
      priority: "high",
      labels: ["bug"],
      source: {
        platform: "slack",
        url: expect.stringContaining("slack.com"),
        author: "alice",
      },
    })

    const integration = await t.run(async (ctx) => ctx.db.get(integrationId))
    expect(integration?.lastProcessedMessageId).toBe("1700000001.000100")
    expect(integration?.lastProcessedMessageCreatedAt).toBe(1_700_000_000_000)
  })

  test("the Slack/X regression — product feedback without action is gated by Haiku, Sonnet is never called", async () => {
    const t = convexTest(schema, modules)
    const { workspaceId, integrationId } = await seedSlack(t, [
      {
        messageTs: "1700000002.000200",
        content: "love the product, just saying thanks team",
        messageCreatedAt: 1_700_000_001_000,
      },
    ])

    primeClassifier({
      isProductFeedback: true,
      needsTaskAction: false,
      confidence: 0.75,
      summary: "thanks",
      reason: "appreciation, no actionable feedback",
      relevantMessageIds: ["1700000002.000200"],
    })

    const result = await t.action(
      internal.slackFeedback.processFeedbackWindow,
      { integrationId }
    )

    expect(classifierMock).toHaveBeenCalledOnce()
    expect(extractorMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({ skipped: false, createdTaskCount: 0 })

    const tasks = await t.run(async (ctx) =>
      ctx.db
        .query("tasks")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect()
    )
    expect(tasks).toHaveLength(0)

    // Cursor still advances so we don't re-classify the same message forever
    const integration = await t.run(async (ctx) => ctx.db.get(integrationId))
    expect(integration?.lastProcessedMessageId).toBe("1700000002.000200")
  })

  test("non-product chatter is rejected at the classifier", async () => {
    const t = convexTest(schema, modules)
    const { workspaceId, integrationId } = await seedSlack(t, [
      {
        messageTs: "1700000003.000300",
        content: "anyone watching the game tonight?",
        messageCreatedAt: 1_700_000_002_000,
      },
    ])

    primeClassifier({
      isProductFeedback: false,
      needsTaskAction: false,
      confidence: 0.95,
      summary: null,
      reason: "off-topic chat",
      relevantMessageIds: [],
    })

    const result = await t.action(
      internal.slackFeedback.processFeedbackWindow,
      { integrationId }
    )

    expect(extractorMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({ skipped: false, createdTaskCount: 0 })

    const tasks = await t.run(async (ctx) =>
      ctx.db
        .query("tasks")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect()
    )
    expect(tasks).toHaveLength(0)
  })
})

describe("X feedback end-to-end", () => {
  test("actionable feedback creates a task with x source and advances cursor", async () => {
    const t = convexTest(schema, modules)
    const { workspaceId, integrationId } = await seedX(t, [
      {
        postId: "1850000000000000001",
        content: "@acme the dark mode is broken on mobile after the update",
        postCreatedAt: 1_700_000_003_000,
      },
    ])

    primeClassifier({
      ...ACTIONABLE_CLASSIFICATION,
      relevantMessageIds: ["1850000000000000001"],
      summary: "dark mode broken",
    })
    primeExtractor({
      actions: [
        {
          action: "create",
          title: "Fix mobile dark mode",
          description: "Dark mode regression after latest update, mobile only",
          priority: "high",
          labels: ["bug"],
        },
      ],
    })

    const result = await t.action(
      internal.xFeedback.processFeedbackWindow,
      { integrationId }
    )

    expect(result).toMatchObject({
      skipped: false,
      createdTaskCount: 1,
    })

    const tasks = await t.run(async (ctx) =>
      ctx.db
        .query("tasks")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect()
    )
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      title: "Fix mobile dark mode",
      status: "requests",
      source: {
        platform: "x",
        url: expect.stringContaining("x.com"),
        author: "alice",
      },
    })

    const integration = await t.run(async (ctx) => ctx.db.get(integrationId))
    expect(integration?.lastProcessedPostId).toBe("1850000000000000001")
  })

  test("no-pending-posts short-circuits without calling AI", async () => {
    const t = convexTest(schema, modules)
    const { integrationId } = await seedX(t, [])

    const result = await t.action(
      internal.xFeedback.processFeedbackWindow,
      { integrationId }
    )

    expect(result).toMatchObject({
      skipped: true,
      reason: "no_pending_posts",
    })
    expect(classifierMock).not.toHaveBeenCalled()
    expect(extractorMock).not.toHaveBeenCalled()
  })
})

describe("Discord feedback end-to-end", () => {
  test("admin-only messages skip AI and just advance the cursor", async () => {
    const t = convexTest(schema, modules)
    const { integrationId } = await seedDiscord(t, [
      {
        messageId: "1400000000000000001",
        content: "heads up team, shipping change tomorrow",
        messageCreatedAt: 1_700_000_004_000,
        authorHasAdminPrivileges: true,
      },
    ])

    const result = await t.action(
      internal.discordFeedback.processFeedbackWindow,
      { integrationId }
    )

    expect(result).toMatchObject({
      skipped: true,
      reason: "admin_only_messages",
    })
    expect(classifierMock).not.toHaveBeenCalled()

    const integration = await t.run(async (ctx) => ctx.db.get(integrationId))
    expect(integration?.lastProcessedMessageId).toBe("1400000000000000001")
  })

  test("actionable non-admin message creates a task", async () => {
    const t = convexTest(schema, modules)
    const { workspaceId, integrationId } = await seedDiscord(t, [
      {
        messageId: "1400000000000000010",
        content: "the onboarding flow crashes when you click skip",
        messageCreatedAt: 1_700_000_005_000,
      },
    ])

    primeClassifier({
      ...ACTIONABLE_CLASSIFICATION,
      relevantMessageIds: ["1400000000000000010"],
      summary: "onboarding crash",
    })
    primeExtractor({
      actions: [
        {
          action: "create",
          title: "Fix onboarding skip crash",
          description: "Clicking 'Skip' in onboarding throws an error",
          priority: "urgent",
          labels: ["bug"],
        },
      ],
    })

    const result = await t.action(
      internal.discordFeedback.processFeedbackWindow,
      { integrationId }
    )

    expect(result).toMatchObject({ skipped: false, createdTaskCount: 1 })

    const tasks = await t.run(async (ctx) =>
      ctx.db
        .query("tasks")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect()
    )
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      title: "Fix onboarding skip crash",
      priority: "urgent",
      source: { platform: "discord", author: "alice" },
    })
  })
})
