import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { streamText, type LanguageModel } from "ai"
import type { ZodType } from "zod"

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

export function buildOpenRouterModel(
  slug: string,
  provider?: string | null
): LanguageModel {
  if (!provider) {
    return openrouter(slug)
  }
  // @openrouter/ai-sdk-provider passes `extraBody` through to the request,
  // letting us pin a specific upstream provider when one is set.
  return openrouter(slug, {
    extraBody: { provider: { only: [provider] } },
  })
}

export type StreamMetrics = {
  rawOutput: string
  totalMs: number
  ttftMs?: number
  tps?: number
  inputTokens?: number
  outputTokens?: number
}

export async function runWithStreamMetrics(args: {
  model: LanguageModel
  system: string
  prompt: string
}): Promise<StreamMetrics> {
  const start = Date.now()
  const result = streamText({
    model: args.model,
    system: args.system,
    prompt: args.prompt,
  })

  let firstChunkAt: number | undefined
  let rawOutput = ""
  for await (const chunk of result.textStream) {
    if (firstChunkAt === undefined) {
      firstChunkAt = Date.now()
    }
    rawOutput += chunk
  }
  const totalMs = Date.now() - start
  const usage = await result.usage
  const inputTokens = usage?.inputTokens
  const outputTokens = usage?.outputTokens

  let ttftMs: number | undefined
  if (firstChunkAt !== undefined) {
    ttftMs = firstChunkAt - start
  }

  let tps: number | undefined
  if (
    outputTokens !== undefined &&
    outputTokens > 0 &&
    ttftMs !== undefined &&
    totalMs > ttftMs
  ) {
    tps = (outputTokens / (totalMs - ttftMs)) * 1000
  }

  return { rawOutput, totalMs, ttftMs, tps, inputTokens, outputTokens }
}

// Pull the first JSON value out of a model response, ignoring any
// markdown fences or chatter the model added despite our instructions.
export function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{")
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === "\\") {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; raw?: unknown }

export function parseStrictJson<T>(
  raw: string,
  schema: ZodType<T>
): ParseResult<T> {
  const objectText = extractFirstJsonObject(raw)
  if (!objectText) {
    return { ok: false, error: "No JSON object found in model output" }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(objectText)
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "JSON parse failed",
    }
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; "),
      raw: parsed,
    }
  }
  return { ok: true, value: result.data }
}
