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

// Pull the first JSON value (object or array) out of a model response,
// ignoring any markdown fences or chatter the model added despite our
// instructions. Mirrors `extractFirstJsonValue` in production discordFeedback.
export function extractFirstJsonValue(text: string): unknown | null {
  for (let start = 0; start < text.length; start += 1) {
    const opening = text[start]
    if (opening !== "{" && opening !== "[") continue

    const closing = opening === "{" ? "}" : "]"
    const stack: string[] = [closing]
    let inString = false
    let escaped = false

    for (let i = start + 1; i < text.length; i += 1) {
      const ch = text[i]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === "\\") escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') {
        inString = true
        continue
      }
      if (ch === "{" || ch === "[") {
        stack.push(ch === "{" ? "}" : "]")
        continue
      }
      if (ch === "}" || ch === "]") {
        if (stack[stack.length - 1] !== ch) break
        stack.pop()
        if (stack.length === 0) {
          const candidate = text.slice(start, i + 1)
          try {
            return JSON.parse(candidate)
          } catch {
            break
          }
        }
      }
    }
  }
  return null
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; raw?: unknown }

export function parseStrictJson<T>(
  raw: string,
  schema: ZodType<T>,
  options?: { normalize?: (value: unknown) => unknown }
): ParseResult<T> {
  const value = extractFirstJsonValue(raw)
  if (value === null || value === undefined) {
    return { ok: false, error: "No JSON value found in model output" }
  }
  const normalized = options?.normalize ? options.normalize(value) : value
  const result = schema.safeParse(normalized)
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; "),
      raw: normalized,
    }
  }
  return { ok: true, value: result.data }
}
