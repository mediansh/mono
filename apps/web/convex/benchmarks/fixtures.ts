// Hand-curated fixtures for the admin benchmark suites. Each fixture is
// designed to exercise a specific decision point in the production prompt:
// borderline cases, schema-stress inputs, and clean true/false signals.
//
// Stable string ids let us reference a fixture across runs even after the
// list is reordered.

export type DiscordScanFixture = {
  id: string
  label: string
  workspaceName: string
  guildName: string
  transcript: string
  expected: { isProductFeedback: boolean; needsTaskAction: boolean }
}

export type FeedbackExtractFixture = {
  id: string
  label: string
  workspaceName: string
  classifierSummary: string
  existingTasksFormatted: string
  relevantMessagesFormatted: string
  allowedLabels: string[]
  expectedActionCount: { min: number; max: number }
  qualityKeywords: string[]
}

export type TaskGenFixture = {
  id: string
  label: string
  workspaceName: string
  availableLabels: string[]
  rawPrompt: string
  generationInstruction: string
  expectedTaskCount: { min: number; max: number }
  qualityKeywords: string[]
}

const SAMPLE_WORKSPACE = "Acme"
const SAMPLE_GUILD = "Acme Community"
const SAMPLE_LABELS = ["bug", "feature", "improvement"]

// Helper to keep the fixture file readable.
const t = (lines: string[]) => lines.join("\n")

export const DISCORD_SCAN_FIXTURES: DiscordScanFixture[] = [
  {
    id: "ds-clear-bug",
    label: "Clear bug report — should classify as actionable",
    workspaceName: SAMPLE_WORKSPACE,
    guildName: SAMPLE_GUILD,
    transcript: t([
      "[id:111000000000000001] (forum: 'Save button crash') alice: clicking Save throws a 500. happens on every project. console says 'TypeError: Cannot read properties of undefined (reading id)'.",
    ]),
    expected: { isProductFeedback: true, needsTaskAction: true },
  },
  {
    id: "ds-pure-praise",
    label: "Pure praise — should reject",
    workspaceName: SAMPLE_WORKSPACE,
    guildName: SAMPLE_GUILD,
    transcript: t([
      "[id:111000000000000002] (channel #general) bob: I love Acme so much, this is the best tool I've ever used 🔥",
    ]),
    expected: { isProductFeedback: false, needsTaskAction: false },
  },
  {
    id: "ds-introduction",
    label: "Server intro — should reject",
    workspaceName: SAMPLE_WORKSPACE,
    guildName: SAMPLE_GUILD,
    transcript: t([
      "[id:111000000000000003] (channel #intros) carol: hey everyone, just joined! excited to try this out",
    ]),
    expected: { isProductFeedback: false, needsTaskAction: false },
  },
  {
    id: "ds-plus-one-on-known-bug",
    label: "+1 reply with no new info — feedback but not actionable",
    workspaceName: SAMPLE_WORKSPACE,
    guildName: SAMPLE_GUILD,
    transcript: t([
      "[id:111000000000000004] (forum: 'Save button crash') alice: still seeing this btw",
      "[id:111000000000000005] (forum: 'Save button crash') dan: same here, +1",
    ]),
    expected: { isProductFeedback: true, needsTaskAction: false },
  },
  {
    id: "ds-perf-regression",
    label: "Severe slowness regression — actionable",
    workspaceName: SAMPLE_WORKSPACE,
    guildName: SAMPLE_GUILD,
    transcript: t([
      "[id:111000000000000006] (channel #help) eve: the dashboard takes 30+ seconds to load now, was instant last week. anyone else?",
    ]),
    expected: { isProductFeedback: true, needsTaskAction: true },
  },
  {
    id: "ds-meme-offtopic",
    label: "Off-topic meme — reject",
    workspaceName: SAMPLE_WORKSPACE,
    guildName: SAMPLE_GUILD,
    transcript: t([
      "[id:111000000000000007] (channel #random) frank: anyone watch the game last night? wild ending",
    ]),
    expected: { isProductFeedback: false, needsTaskAction: false },
  },
  {
    id: "ds-feature-request",
    label: "Feature request — actionable",
    workspaceName: SAMPLE_WORKSPACE,
    guildName: SAMPLE_GUILD,
    transcript: t([
      "[id:111000000000000008] (channel #feedback) gina: would be huge if we could bulk-archive completed tasks instead of one at a time",
    ]),
    expected: { isProductFeedback: true, needsTaskAction: true },
  },
  {
    id: "ds-forum-title-only",
    label: "Forum thread metadata only — actionable",
    workspaceName: SAMPLE_WORKSPACE,
    guildName: SAMPLE_GUILD,
    transcript: t([
      "[id:111000000000000009] (forum: 'OAuth login fails for Google Workspace users') hank: ",
    ]),
    expected: { isProductFeedback: true, needsTaskAction: true },
  },
  {
    id: "ds-hiring-talk",
    label: "Hiring talk — reject",
    workspaceName: SAMPLE_WORKSPACE,
    guildName: SAMPLE_GUILD,
    transcript: t([
      "[id:111000000000000010] (channel #jobs) ivy: my company is hiring senior react engineers, dm if interested",
    ]),
    expected: { isProductFeedback: false, needsTaskAction: false },
  },
  {
    id: "ds-thanks-only",
    label: "Thanks-only — reject",
    workspaceName: SAMPLE_WORKSPACE,
    guildName: SAMPLE_GUILD,
    transcript: t([
      "[id:111000000000000011] (channel #general) jack: thanks team, that fix worked!",
    ]),
    expected: { isProductFeedback: false, needsTaskAction: false },
  },
  {
    id: "ds-integration-blocked",
    label: "Integration setup friction — actionable",
    workspaceName: SAMPLE_WORKSPACE,
    guildName: SAMPLE_GUILD,
    transcript: t([
      "[id:111000000000000012] (channel #integrations) kim: tried connecting Linear three times now, oauth callback redirects to a blank page and never finishes",
    ]),
    expected: { isProductFeedback: true, needsTaskAction: true },
  },
  {
    id: "ds-unrelated-tool",
    label: "Feedback about a different product — reject",
    workspaceName: SAMPLE_WORKSPACE,
    guildName: SAMPLE_GUILD,
    transcript: t([
      "[id:111000000000000013] (channel #random) liam: anyone else hate how slow Notion has gotten lately",
    ]),
    expected: { isProductFeedback: false, needsTaskAction: false },
  },
]

export const FEEDBACK_EXTRACT_FIXTURES: FeedbackExtractFixture[] = [
  {
    id: "fe-single-bug",
    label: "Single bug report — expect 1 create",
    workspaceName: SAMPLE_WORKSPACE,
    classifierSummary: "User reports a 500 error when clicking Save",
    existingTasksFormatted: "(no closely matching existing tasks)",
    relevantMessagesFormatted: t([
      "- 2026-05-09T12:00:00Z | forum=Save button crash | channel=help | alice: clicking Save throws a 500. happens on every project. console says 'TypeError: Cannot read properties of undefined (reading id)'.",
    ]),
    allowedLabels: SAMPLE_LABELS,
    expectedActionCount: { min: 1, max: 1 },
    qualityKeywords: ["save", "500"],
  },
  {
    id: "fe-multi-bug-thread",
    label: "Multi-bug thread — expect 2-3 distinct creates",
    workspaceName: SAMPLE_WORKSPACE,
    classifierSummary:
      "Two distinct issues raised: OAuth callback failure and dashboard performance regression",
    existingTasksFormatted: "(no closely matching existing tasks)",
    relevantMessagesFormatted: t([
      "- 2026-05-09T12:00:00Z | channel=integrations | kim: tried connecting Linear three times now, oauth callback redirects to a blank page and never finishes",
      "- 2026-05-09T12:01:00Z | channel=help | eve: the dashboard takes 30+ seconds to load now, was instant last week",
    ]),
    allowedLabels: SAMPLE_LABELS,
    expectedActionCount: { min: 2, max: 3 },
    qualityKeywords: ["oauth", "dashboard"],
  },
  {
    id: "fe-feature-request",
    label: "Pure feature request — expect 1 create with feature label",
    workspaceName: SAMPLE_WORKSPACE,
    classifierSummary: "User requests bulk archive for completed tasks",
    existingTasksFormatted: "(no closely matching existing tasks)",
    relevantMessagesFormatted: t([
      "- 2026-05-09T12:00:00Z | channel=feedback | gina: would be huge if we could bulk-archive completed tasks instead of one at a time",
    ]),
    allowedLabels: SAMPLE_LABELS,
    expectedActionCount: { min: 1, max: 1 },
    qualityKeywords: ["bulk", "archive"],
  },
  {
    id: "fe-exact-duplicate",
    label: "Exact duplicate of existing task — expect 0 actions",
    workspaceName: SAMPLE_WORKSPACE,
    classifierSummary: "User reports a 500 error when clicking Save",
    existingTasksFormatted: t([
      "MDN-12 (status=todo, priority=high, labels=bug) — Save button throws 500 on click — Users report Save returning 500 with TypeError on every project; reproduces consistently.",
    ]),
    relevantMessagesFormatted: t([
      "- 2026-05-09T12:05:00Z | forum=Save button crash | channel=help | alice: clicking Save throws a 500. exact same as MDN-12.",
    ]),
    allowedLabels: SAMPLE_LABELS,
    expectedActionCount: { min: 0, max: 0 },
    qualityKeywords: [],
  },
  {
    id: "fe-update-with-new-detail",
    label: "Existing task plus material new repro detail — expect 1 update",
    workspaceName: SAMPLE_WORKSPACE,
    classifierSummary:
      "User adds reproduction step to existing OAuth integration bug",
    existingTasksFormatted: t([
      "MDN-22 (status=in_progress, priority=high, labels=bug) — Linear OAuth callback fails — Users cannot complete the Linear OAuth flow.",
    ]),
    relevantMessagesFormatted: t([
      "- 2026-05-09T12:00:00Z | channel=integrations | kim: figured out the Linear oauth thing — only happens when the redirect URL has a trailing slash, server returns 400 with 'invalid_request' in the response body",
    ]),
    allowedLabels: SAMPLE_LABELS,
    expectedActionCount: { min: 1, max: 1 },
    qualityKeywords: ["trailing slash", "400"],
  },
]

const SMART_TASK_INSTRUCTION =
  "Return between 1 and 5 tasks. Prefer 1 task for a single cohesive request. Return multiple tasks only when the prompt clearly contains multiple distinct deliverables or asks for a breakdown. Follow the user's wording instead of refusing valid multi-task requests."

const MULTI_TASK_INSTRUCTION =
  "Return between 2 and 12 tasks. The user asked for multiple tasks or a clear breakdown. Use the fewest tasks that still matches the request."

export const TASK_GEN_FIXTURES: TaskGenFixture[] = [
  {
    id: "tg-fix-login-bug",
    label: "Concrete bug fix — expect 1 task",
    workspaceName: SAMPLE_WORKSPACE,
    availableLabels: SAMPLE_LABELS,
    rawPrompt:
      "fix the login bug where users get logged out after refreshing the page",
    generationInstruction: SMART_TASK_INSTRUCTION,
    expectedTaskCount: { min: 1, max: 1 },
    qualityKeywords: ["login", "refresh"],
  },
  {
    id: "tg-billing-page",
    label: "Single feature shipment — expect 1 task",
    workspaceName: SAMPLE_WORKSPACE,
    availableLabels: SAMPLE_LABELS,
    rawPrompt:
      "ship a billing page that shows current plan, usage, and an upgrade button",
    generationInstruction: SMART_TASK_INSTRUCTION,
    expectedTaskCount: { min: 1, max: 2 },
    qualityKeywords: ["billing", "plan", "upgrade"],
  },
  {
    id: "tg-multi-deliverable",
    label: "Brain-dump with three distinct items — expect 3 tasks",
    workspaceName: SAMPLE_WORKSPACE,
    availableLabels: SAMPLE_LABELS,
    rawPrompt: t([
      "we need to:",
      "1. fix the save button 500 error",
      "2. add CSV export to the reports page",
      "3. write a migration for the new audit_log table",
    ]),
    generationInstruction: MULTI_TASK_INSTRUCTION,
    expectedTaskCount: { min: 3, max: 4 },
    qualityKeywords: ["save", "csv", "audit_log"],
  },
  {
    id: "tg-one-liner",
    label: "Terse one-liner — expect 1 task",
    workspaceName: SAMPLE_WORKSPACE,
    availableLabels: SAMPLE_LABELS,
    rawPrompt: "dark mode",
    generationInstruction: SMART_TASK_INSTRUCTION,
    expectedTaskCount: { min: 1, max: 1 },
    qualityKeywords: ["dark"],
  },
  {
    id: "tg-ambiguous",
    label: "Ambiguous prompt — expect 1-3 tasks",
    workspaceName: SAMPLE_WORKSPACE,
    availableLabels: SAMPLE_LABELS,
    rawPrompt: "improve onboarding",
    generationInstruction: SMART_TASK_INSTRUCTION,
    expectedTaskCount: { min: 1, max: 3 },
    qualityKeywords: ["onboarding"],
  },
]

export const ALL_SUITES = ["discordScan", "feedbackExtract", "taskGen"] as const
export type Suite = (typeof ALL_SUITES)[number]

export function fixtureCountForSuite(suite: Suite): number {
  switch (suite) {
    case "discordScan":
      return DISCORD_SCAN_FIXTURES.length
    case "feedbackExtract":
      return FEEDBACK_EXTRACT_FIXTURES.length
    case "taskGen":
      return TASK_GEN_FIXTURES.length
  }
}
