import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  runFeedbackPipeline,
  type ExistingTask,
  type FeedbackAIClient,
  type FeedbackMessage,
  type PipelineInput,
} from "./feedbackPipeline"

vi.mock("./posthog", () => ({
  trackLLMGeneration: vi.fn().mockResolvedValue(undefined),
  trackFeedbackProcessing: vi.fn().mockResolvedValue(undefined),
  captureEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../lib/billing/autumn", () => ({
  safeTrackAiUsage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../lib/billing/config", () => ({
  getAiCostForTokens: () => 0,
}))

vi.mock("../lib/ai", () => ({
  AI_MODEL_IDS: {
    feedbackClassifier: "test/haiku",
    feedbackExtractor: "test/sonnet",
    taskGeneration: "test/sonnet",
  },
  AI_MODELS: {
    feedbackClassifier: {} as unknown,
    feedbackExtractor: {} as unknown,
    taskGeneration: {} as unknown,
  },
  hasAnthropicApiKey: () => true,
}))

function makeMessage(
  id: string,
  content: string,
  overrides: Partial<FeedbackMessage> = {}
): FeedbackMessage {
  return {
    id,
    authorUsername: "alice",
    content,
    permalink: `https://example.com/${id}`,
    createdAt: 1_000_000 + Number(id),
    locationLabels: [],
    isAdmin: false,
    ...overrides,
  }
}

function baseInput(overrides: Partial<PipelineInput> = {}): PipelineInput {
  return {
    platform: "slack",
    workspaceId: "ws_123" as PipelineInput["workspaceId"],
    workspaceName: "Acme",
    integrationId: "int_123",
    availableLabels: ["bug", "feature"],
    additionalContext: null,
    workspaceContextLines: ["Slack team: acme"],
    pendingMessages: [makeMessage("1", "The export button never works")],
    contextMessages: [makeMessage("1", "The export button never works")],
    existingTasks: [],
    ...overrides,
  }
}

const defaultOutput = {
  actions: [
    {
      action: "create",
      title: "Fix export button",
      description: "Export button does nothing",
      priority: "high",
      labels: ["bug"],
    },
  ],
}

function mockClient(overrides: {
  classification?: Record<string, unknown>
  classifyImpl?: FeedbackAIClient["classify"]
  output?: unknown
  extractImpl?: FeedbackAIClient["extract"]
}): FeedbackAIClient {
  const extractOutput =
    "output" in overrides ? overrides.output : defaultOutput
  return {
    classify:
      overrides.classifyImpl ??
      vi.fn().mockResolvedValue({
        text: JSON.stringify(
          overrides.classification ?? {
            isProductFeedback: true,
            needsTaskAction: true,
            confidence: 0.9,
            summary: "bug",
            reason: "export broken",
            relevantMessageIds: ["1"],
          }
        ),
        inputTokens: 10,
        outputTokens: 10,
      }),
    extract:
      overrides.extractImpl ??
      vi.fn().mockResolvedValue({
        output: extractOutput,
        inputTokens: 20,
        outputTokens: 20,
      }),
  }
}

describe("runFeedbackPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("classifies with Haiku then extracts with Sonnet when feedback is actionable", async () => {
    const client = mockClient({})
    const result = await runFeedbackPipeline(baseInput(), client)

    expect(client.classify).toHaveBeenCalledOnce()
    expect(client.extract).toHaveBeenCalledOnce()
    expect(result.kind).toBe("processed")
    if (result.kind !== "processed") throw new Error("unreachable")

    expect(result.operations).toHaveLength(1)
    expect(result.operations[0]).toMatchObject({
      action: "create",
      title: "Fix export button",
      priority: "high",
      labels: ["bug"],
    })
  })

  it("skips and never calls Sonnet when classification rejects as non-feedback", async () => {
    const client = mockClient({
      classification: {
        isProductFeedback: false,
        needsTaskAction: false,
        confidence: 0.2,
        summary: null,
        reason: "chitchat",
        relevantMessageIds: [],
      },
    })

    const result = await runFeedbackPipeline(baseInput(), client)

    expect(client.classify).toHaveBeenCalledOnce()
    expect(client.extract).not.toHaveBeenCalled()
    expect(result.kind).toBe("skip")
    if (result.kind !== "skip") throw new Error("unreachable")
    expect(result.reason).toBe("not_product_feedback")
  })

  it("skips when feedback is product-related but not actionable (the Slack/X bug)", async () => {
    // This is the regression test: before the rewrite, Slack and X lacked the
    // needsTaskAction gate entirely, so product-feedback-but-not-actionable
    // messages silently fell through. Now all platforms enforce the same gate.
    const client = mockClient({
      classification: {
        isProductFeedback: true,
        needsTaskAction: false,
        confidence: 0.8,
        summary: "thanks",
        reason: "user just said thanks",
        relevantMessageIds: ["1"],
      },
    })

    const result = await runFeedbackPipeline(
      baseInput({ platform: "slack" }),
      client
    )

    expect(client.extract).not.toHaveBeenCalled()
    expect(result.kind).toBe("skip")
    if (result.kind !== "skip") throw new Error("unreachable")
    expect(result.reason).toBe("not_actionable")
  })

  it("works identically across all three platforms", async () => {
    for (const platform of ["discord", "slack", "x"] as const) {
      const client = mockClient({})
      const result = await runFeedbackPipeline(
        baseInput({ platform }),
        client
      )
      expect(result.kind, `platform=${platform}`).toBe("processed")
    }
  })

  it("requires Haiku to return the needsTaskAction field", async () => {
    const client = mockClient({
      classification: {
        isProductFeedback: true,
        // needsTaskAction intentionally missing
        confidence: 0.9,
        summary: "bug",
        reason: "export broken",
        relevantMessageIds: ["1"],
      },
    })

    await expect(runFeedbackPipeline(baseInput(), client)).rejects.toThrow()
  })

  it("returns no_structured_output when Sonnet returns null output", async () => {
    const client = mockClient({ output: null })
    const result = await runFeedbackPipeline(baseInput(), client)

    expect(result.kind).toBe("no_structured_output")
  })

  it("skips when classifier returns empty relevantMessageIds", async () => {
    const client = mockClient({
      classification: {
        isProductFeedback: true,
        needsTaskAction: true,
        confidence: 0.6,
        summary: null,
        reason: "unclear",
        relevantMessageIds: [],
      },
    })

    const result = await runFeedbackPipeline(baseInput(), client)

    expect(client.extract).not.toHaveBeenCalled()
    expect(result.kind).toBe("skip")
    if (result.kind !== "skip") throw new Error("unreachable")
    expect(result.reason).toBe("no_relevant_messages")
  })

  it("filters out labels not in the workspace allowlist", async () => {
    const client = mockClient({
      output: {
        actions: [
          {
            action: "create",
            title: "Fix thing",
            description: null,
            priority: null,
            labels: ["bug", "unknown-label", "feature"],
          },
        ],
      },
    })

    const result = await runFeedbackPipeline(
      baseInput({ availableLabels: ["bug"] }),
      client
    )
    expect(result.kind).toBe("processed")
    if (result.kind !== "processed") throw new Error("unreachable")
    expect(result.operations[0]).toMatchObject({ labels: ["bug"] })
  })

  it("passes existing tasks into the extractor prompt so it can emit update actions", async () => {
    const extractSpy = vi.fn().mockResolvedValue({
      output: {
        actions: [
          {
            action: "update",
            taskCode: "MDN-42",
            title: "Fix export button (now with steps)",
            description: "Click export in overview → nothing happens",
            priority: "high",
            labels: ["bug"],
          },
        ],
      },
      inputTokens: 10,
      outputTokens: 10,
    })
    const client = mockClient({ extractImpl: extractSpy })

    const existingTasks: ExistingTask[] = [
      {
        taskCode: "MDN-42",
        title: "Export button broken",
        description: "something goes wrong",
        status: "todo",
        priority: "medium",
        labels: ["bug"],
        sourceUrl: null,
      },
    ]

    const result = await runFeedbackPipeline(
      baseInput({ existingTasks }),
      client
    )

    expect(result.kind).toBe("processed")
    if (result.kind !== "processed") throw new Error("unreachable")
    expect(result.operations[0]).toMatchObject({
      action: "update",
      taskCode: "MDN-42",
    })

    const extractCall = extractSpy.mock.calls[0]?.[0]
    expect(extractCall?.prompt).toContain("MDN-42")
    expect(extractCall?.prompt).toContain("Export button broken")
  })

  it("includes the classifier system prompt asking for both product-feedback and actionable gates", async () => {
    const classifySpy = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        isProductFeedback: true,
        needsTaskAction: true,
        confidence: 0.9,
        summary: "bug",
        reason: "x",
        relevantMessageIds: ["1"],
      }),
      inputTokens: 5,
      outputTokens: 5,
    })
    const client: FeedbackAIClient = {
      classify: classifySpy,
      extract: mockClient({}).extract,
    }

    await runFeedbackPipeline(baseInput(), client)

    const system = classifySpy.mock.calls[0]?.[0]?.system as string
    expect(system).toContain("isProductFeedback")
    expect(system).toContain("needsTaskAction")
    expect(system).toContain("relevantMessageIds")
  })

  it("throws if Haiku returns non-JSON garbage (surfaces error instead of silent success)", async () => {
    const client: FeedbackAIClient = {
      classify: vi.fn().mockResolvedValue({
        text: "lol I'm not json",
        inputTokens: 1,
        outputTokens: 1,
      }),
      extract: vi.fn(),
    }

    await expect(runFeedbackPipeline(baseInput(), client)).rejects.toThrow()
    expect(client.extract).not.toHaveBeenCalled()
  })

  it("falls back to all pending messages when classifier's relevantMessageIds match nothing", async () => {
    const client = mockClient({
      classification: {
        isProductFeedback: true,
        needsTaskAction: true,
        confidence: 0.7,
        summary: null,
        reason: "ok",
        relevantMessageIds: ["does-not-match"],
      },
    })

    const result = await runFeedbackPipeline(baseInput(), client)

    expect(result.kind).toBe("processed")
    if (result.kind !== "processed") throw new Error("unreachable")
    expect(result.relevantMessages).toHaveLength(1)
    expect(result.relevantMessages[0]?.id).toBe("1")
  })

  it("picks subset when classifier's relevantMessageIds match a subset of pending messages", async () => {
    const pending = [
      makeMessage("1", "The export button never works"),
      makeMessage("2", "Also the auth loop is a mess"),
      makeMessage("3", "random meme"),
    ]
    const client = mockClient({
      classification: {
        isProductFeedback: true,
        needsTaskAction: true,
        confidence: 0.9,
        summary: null,
        reason: "two real issues",
        relevantMessageIds: ["1", "2"],
      },
    })

    const result = await runFeedbackPipeline(
      baseInput({ pendingMessages: pending, contextMessages: pending }),
      client
    )

    expect(result.kind).toBe("processed")
    if (result.kind !== "processed") throw new Error("unreachable")
    expect(result.relevantMessages.map((m) => m.id).sort()).toEqual([
      "1",
      "2",
    ])
  })
})
