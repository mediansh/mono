import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const testDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(testDir, "..")

function load(relativePath: string) {
  return readFileSync(path.join(appRoot, relativePath), "utf8")
}

test("Slack feedback processing stays inside Convex", () => {
  const source = load("convex/slackFeedback.ts")

  assert.ok(source.includes("ctx.runQuery("))
  assert.ok(source.includes("ctx.runAction("))
  assert.ok(source.includes("ctx.runMutation("))
  assert.ok(!source.includes("/api/internal/feedback/slack/process"))
  assert.ok(!source.includes('reason: "delegated"'))
})

test("X feedback processing stays inside Convex", () => {
  const source = load("convex/xFeedback.ts")

  assert.ok(source.includes("ctx.runQuery("))
  assert.ok(source.includes("ctx.runAction("))
  assert.ok(source.includes("ctx.runMutation("))
  assert.ok(!source.includes("/api/internal/feedback/x/process"))
  assert.ok(!source.includes('reason: "delegated"'))
})
