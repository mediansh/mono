// Suite runners + scoring for the admin benchmark. Each runner takes a
// fixture and a model, replays the production system prompt + schema, and
// returns the row payload to insert into the `benchmarkRuns` table.

import type { LanguageModel } from "ai"
import {
  buildDiscordClassifierSystemPrompt,
  buildDiscordExtractorSystemPrompt,
  buildTaskGenerationSystemPrompt,
} from "../../lib/ai-prompts"
import {
  feedbackClassificationSchema,
  extractedFeedbackTasksSchema,
  generatedTasksSchema,
} from "../../lib/ai-schemas"
import {
  parseStrictJson,
  runWithStreamMetrics,
  type StreamMetrics,
} from "./lib"
import type {
  DiscordScanFixture,
  FeedbackExtractFixture,
  TaskGenFixture,
} from "./fixtures"

// Composite-score weights. Speed dominates, with a smaller TPS bonus and a
// hard quality floor. Tweak these in one place.
export const SCORING_WEIGHTS = {
  speed: 0.55,
  tps: 0.15,
  quality: 0.3,
} as const

export type SuiteRunPayload = {
  rawOutput: string
  parsed?: unknown
  schemaValid: boolean
  parseError?: string
  ttftMs?: number
  totalMs: number
  inputTokens?: number
  outputTokens?: number
  tps?: number
  expected?: unknown
  correct?: boolean
  qualityScore: number
  scoreBreakdown: Record<string, number | boolean>
  status: "ok" | "error"
  errorMessage?: string
}

function emptyMetrics(): StreamMetrics {
  return { rawOutput: "", totalMs: 0 }
}

function errorPayload(
  metrics: StreamMetrics,
  error: unknown
): SuiteRunPayload {
  return {
    rawOutput: metrics.rawOutput,
    schemaValid: false,
    totalMs: metrics.totalMs,
    ttftMs: metrics.ttftMs,
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    tps: metrics.tps,
    qualityScore: 0,
    scoreBreakdown: {},
    status: "error",
    errorMessage: error instanceof Error ? error.message : String(error),
  }
}

// ---------- Discord scan suite ----------

export async function runDiscordScan(args: {
  model: LanguageModel
  fixture: DiscordScanFixture
}): Promise<{ payload: SuiteRunPayload; systemPrompt: string; userPrompt: string }> {
  const systemPrompt = buildDiscordClassifierSystemPrompt({
    workspaceName: args.fixture.workspaceName,
  })
  const userPrompt = [
    `Workspace name: ${args.fixture.workspaceName}`,
    `Guild: ${args.fixture.guildName}`,
    "Conversation transcript:",
    args.fixture.transcript,
  ].join("\n\n")

  let metrics = emptyMetrics()
  try {
    metrics = await runWithStreamMetrics({
      model: args.model,
      system: systemPrompt,
      prompt: userPrompt,
    })
  } catch (error) {
    return {
      payload: errorPayload(metrics, error),
      systemPrompt,
      userPrompt,
    }
  }

  const parsed = parseStrictJson(metrics.rawOutput, feedbackClassificationSchema)
  if (!parsed.ok) {
    return {
      payload: {
        rawOutput: metrics.rawOutput,
        schemaValid: false,
        parseError: parsed.error,
        ttftMs: metrics.ttftMs,
        totalMs: metrics.totalMs,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        tps: metrics.tps,
        expected: args.fixture.expected,
        correct: false,
        qualityScore: 0,
        scoreBreakdown: { schemaValid: false },
        status: "ok",
      },
      systemPrompt,
      userPrompt,
    }
  }

  const correct =
    parsed.value.isProductFeedback === args.fixture.expected.isProductFeedback &&
    parsed.value.needsTaskAction === args.fixture.expected.needsTaskAction

  return {
    payload: {
      rawOutput: metrics.rawOutput,
      parsed: parsed.value,
      schemaValid: true,
      ttftMs: metrics.ttftMs,
      totalMs: metrics.totalMs,
      inputTokens: metrics.inputTokens,
      outputTokens: metrics.outputTokens,
      tps: metrics.tps,
      expected: args.fixture.expected,
      correct,
      qualityScore: correct ? 1 : 0,
      scoreBreakdown: { schemaValid: true, correct },
      status: "ok",
    },
    systemPrompt,
    userPrompt,
  }
}

// ---------- Feedback extract suite ----------

export async function runFeedbackExtract(args: {
  model: LanguageModel
  fixture: FeedbackExtractFixture
}): Promise<{ payload: SuiteRunPayload; systemPrompt: string; userPrompt: string }> {
  const labelsText =
    args.fixture.allowedLabels.length > 0
      ? args.fixture.allowedLabels.join(", ")
      : "No predefined labels."
  const systemPrompt = buildDiscordExtractorSystemPrompt({
    workspaceName: args.fixture.workspaceName,
    labelsText,
  })
  const userPrompt = [
    `Classifier summary: ${args.fixture.classifierSummary}`,
    "Likely matching existing tasks:",
    args.fixture.existingTasksFormatted,
    "Relevant feedback messages:",
    args.fixture.relevantMessagesFormatted,
  ].join("\n\n")

  let metrics = emptyMetrics()
  try {
    metrics = await runWithStreamMetrics({
      model: args.model,
      system: systemPrompt,
      prompt: userPrompt,
    })
  } catch (error) {
    return {
      payload: errorPayload(metrics, error),
      systemPrompt,
      userPrompt,
    }
  }

  const parsed = parseStrictJson(metrics.rawOutput, extractedFeedbackTasksSchema)
  if (!parsed.ok) {
    return {
      payload: {
        rawOutput: metrics.rawOutput,
        schemaValid: false,
        parseError: parsed.error,
        ttftMs: metrics.ttftMs,
        totalMs: metrics.totalMs,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        tps: metrics.tps,
        qualityScore: 0,
        scoreBreakdown: { schemaValid: false },
        status: "ok",
      },
      systemPrompt,
      userPrompt,
    }
  }

  const actions = parsed.value.actions
  const inRange =
    actions.length >= args.fixture.expectedActionCount.min &&
    actions.length <= args.fixture.expectedActionCount.max

  const haystack = actions
    .map((a) => `${a.title} ${a.description ?? ""}`.toLowerCase())
    .join(" | ")
  const keywords = args.fixture.qualityKeywords
  const matchedKeywords = keywords.filter((kw) =>
    haystack.includes(kw.toLowerCase())
  ).length
  const keywordRatio =
    keywords.length === 0 ? 1 : matchedKeywords / keywords.length

  // Each create action should have a non-null priority and at least one
  // label drawn from the allowed set, when any actions are returned.
  const wellFormed =
    actions.length === 0 ||
    actions.every(
      (a) => a.priority !== null && a.labels.length >= 0 // labels may be empty
    )

  const score =
    0.3 * 1 + // schema valid
    0.2 * (inRange ? 1 : 0) +
    0.3 * keywordRatio +
    0.2 * (wellFormed ? 1 : 0)

  return {
    payload: {
      rawOutput: metrics.rawOutput,
      parsed: parsed.value,
      schemaValid: true,
      ttftMs: metrics.ttftMs,
      totalMs: metrics.totalMs,
      inputTokens: metrics.inputTokens,
      outputTokens: metrics.outputTokens,
      tps: metrics.tps,
      expected: {
        actionCount: args.fixture.expectedActionCount,
        keywords,
      },
      qualityScore: score,
      scoreBreakdown: {
        schemaValid: true,
        countInRange: inRange,
        keywordRatio,
        wellFormed,
        actionCount: actions.length,
      },
      status: "ok",
    },
    systemPrompt,
    userPrompt,
  }
}

// ---------- Task generation suite ----------

export async function runTaskGen(args: {
  model: LanguageModel
  fixture: TaskGenFixture
}): Promise<{ payload: SuiteRunPayload; systemPrompt: string; userPrompt: string }> {
  const labelsText =
    args.fixture.availableLabels.length > 0
      ? args.fixture.availableLabels.join(", ")
      : "No predefined labels available."
  const systemPrompt = buildTaskGenerationSystemPrompt({
    workspaceName: args.fixture.workspaceName,
    labelsText,
    generationInstruction: args.fixture.generationInstruction,
  })
  const userPrompt = args.fixture.rawPrompt

  let metrics = emptyMetrics()
  try {
    metrics = await runWithStreamMetrics({
      model: args.model,
      system: systemPrompt,
      prompt: userPrompt,
    })
  } catch (error) {
    return {
      payload: errorPayload(metrics, error),
      systemPrompt,
      userPrompt,
    }
  }

  const parsed = parseStrictJson(metrics.rawOutput, generatedTasksSchema)
  if (!parsed.ok) {
    return {
      payload: {
        rawOutput: metrics.rawOutput,
        schemaValid: false,
        parseError: parsed.error,
        ttftMs: metrics.ttftMs,
        totalMs: metrics.totalMs,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        tps: metrics.tps,
        qualityScore: 0,
        scoreBreakdown: { schemaValid: false },
        status: "ok",
      },
      systemPrompt,
      userPrompt,
    }
  }

  const tasks = parsed.value.tasks
  const inRange =
    tasks.length >= args.fixture.expectedTaskCount.min &&
    tasks.length <= args.fixture.expectedTaskCount.max
  const haystack = tasks
    .map((t) => `${t.title} ${t.description ?? ""}`.toLowerCase())
    .join(" | ")
  const keywords = args.fixture.qualityKeywords
  const matchedKeywords = keywords.filter((kw) =>
    haystack.includes(kw.toLowerCase())
  ).length
  const keywordRatio =
    keywords.length === 0 ? 1 : matchedKeywords / keywords.length

  const score = 0.4 * 1 + 0.2 * (inRange ? 1 : 0) + 0.4 * keywordRatio

  return {
    payload: {
      rawOutput: metrics.rawOutput,
      parsed: parsed.value,
      schemaValid: true,
      ttftMs: metrics.ttftMs,
      totalMs: metrics.totalMs,
      inputTokens: metrics.inputTokens,
      outputTokens: metrics.outputTokens,
      tps: metrics.tps,
      expected: {
        taskCount: args.fixture.expectedTaskCount,
        keywords,
      },
      qualityScore: score,
      scoreBreakdown: {
        schemaValid: true,
        countInRange: inRange,
        keywordRatio,
        taskCount: tasks.length,
      },
      status: "ok",
    },
    systemPrompt,
    userPrompt,
  }
}
