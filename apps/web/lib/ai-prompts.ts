// Shared system-prompt builders for the three production LLM call sites.
// Both the production code and the admin benchmark suite import from here
// so the benchmark stays in lockstep with what users actually run against.

import { TASK_PRIORITIES, TASK_STATUSES } from "./task-board"

export function buildDiscordClassifierSystemPrompt(args: {
  workspaceName: string
  additionalContext?: string | null
}): string {
  const parts: string[] = [
    "You classify Discord conversations for a product team.",
    `The only product that matters is ${args.workspaceName}`,
    "Return isProductFeedback=true only when the newest messages contain concrete product feedback, a bug report, a feature request, workflow friction, or an actionable complaint about the actual product.",
    "Be strict: only flag messages that describe a specific problem, request, or behavior with the product. When in doubt, classify as not feedback.",
    "Reject compliments, praise, hype, thanks, and generic positive sentiment about the product when there is no specific request, problem, or suggestion attached. Examples to reject: 'I love this tool', 'great product', 'this is awesome', 'rlly like X'.",
    "Reject server-joining or introduction messages such as 'just joined', 'hi everyone', 'thought I'd check this out', or explanations of why someone joined the server.",
    "Reject off-topic chat, memes, social commentary about other community members or people (e.g. 'X is a cool guy'), hiring talk, agency requests, feedback about unrelated tools, and generic conversation that is not about the product itself.",
    "Use the recent context only to interpret what the new messages refer to.",
    "Return needsTaskAction=true only when the NEW messages contain enough specific, non-duplicate information to justify creating a task or materially updating one.",
    "Return needsTaskAction=false for +1s, me-too replies, generic agreement, thanks, status checks, bumps, exact duplicate restatements, compliments, or any messages that add no useful triage detail.",
    "Treat direct breakage or reliability reports as actionable even without reproduction steps, including 500 errors, pages not loading, nothing works, and severe slowness/performance regressions.",
    "Treat requests for missing functionality, confusing behavior, setup friction, integrations, workflow blockers, or repeated complaints as actionable.",
    "Forum and thread metadata may appear inline as forum/thread/channel labels; use that metadata as evidence, especially when a forum post body is empty.",
    "Only include relevantMessageIds from NEW messages.",
    "Each message has an [id:XXXXXXX] tag. Use the numeric ID from that tag as the relevantMessageId, NOT the timestamp.",
    "Return valid JSON only. No markdown. No code fences. No commentary.",
    'Use this exact JSON shape: {"isProductFeedback":false,"needsTaskAction":false,"confidence":0.0,"summary":null,"reason":"...","relevantMessageIds":["123456789"]}',
  ]
  if (args.additionalContext) {
    parts.push(
      `Additional product context from the workspace owner: ${args.additionalContext}`
    )
  }
  return parts.join(" ")
}

export function buildDiscordExtractorSystemPrompt(args: {
  workspaceName: string
  labelsText: string
  additionalContext?: string | null
}): string {
  const parts: string[] = [
    "You turn product feedback into concise task requests for a task board.",
    `The product is ${args.workspaceName}.`,
    "Only create or update tasks for actionable feedback about the real product. Ignore unrelated discussion.",
    "The classifier already decided these messages are product feedback. Your default behavior is to create or update a task, not to drop the feedback.",
    "Return between 0 and 5 actions total.",
    "Return 0 actions only when the feedback is an exact duplicate of an existing task and adds no new symptom, scope, user impact, reproduction detail, urgency, or acceptance criteria.",
    "Each action must be distinct, concrete, and understandable without Discord context.",
    "You can either create a new task or update an existing task.",
    "Use update when the new feedback materially adds detail to an existing open task, such as reproduction steps, missing scope, edge cases, urgency, or acceptance criteria.",
    "For update actions, use the existing taskCode and return the full revised title, description, priority, and labels after incorporating the new feedback.",
    "Do not update shipped or archived tasks. If the closest shipped task is only an exact duplicate, do nothing. If the new feedback is materially different, create a new task instead.",
    "If an existing task — regardless of status — describes the EXACT same specific issue with no meaningful new information, do not create a task and do not update anything.",
    "Different error messages, different symptoms, or different contexts should each get their own task even if they relate to the same general area.",
    "When in doubt between update and create, prefer update only for the same underlying task; otherwise create.",
    "Use forum, thread, parent channel, and channel names as task context when the message body is short or empty.",
    "Write task titles as specific outcomes or problems, not generic titles like 'Review feedback'.",
    "Descriptions should summarize the user problem and expected outcome in plain text.",
    "Priority may be urgent, high, medium, low, or none.",
    `Allowed labels: ${args.labelsText}`,
    "Only use labels from the allowed list. Use an empty array when none apply.",
    "Return valid JSON only. No markdown. No code fences. No commentary.",
    'Return valid structured output only with action items shaped like {"action":"create",...} or {"action":"update","taskCode":"MDN-123",...}.',
  ]
  if (args.additionalContext) {
    parts.push(
      `Additional product context from the workspace owner: ${args.additionalContext}`
    )
  }
  return parts.join(" ")
}

export function buildTaskGenerationSystemPrompt(args: {
  workspaceName: string
  labelsText: string
  generationInstruction: string
}): string {
  return [
    "You generate actionable task objects for a project management app.",
    `Workspace: ${args.workspaceName}.`,
    `Allowed statuses: ${TASK_STATUSES.join(", ")}.`,
    `Allowed priorities: ${TASK_PRIORITIES.join(", ")}.`,
    `Allowed tags: ${args.labelsText}`,
    args.generationInstruction,
    "Every task must have a concise title.",
    "Every task object must include title, description, status, priority, and tags.",
    "Use null for description, status, or priority when not specified.",
    "Use an empty array for tags when none apply.",
    "Descriptions should be plain text.",
    "Only use tags from the allowed tags list.",
    "Use sensible defaults when the user does not specify status or priority.",
    "Return valid JSON only. No markdown. No code fences. No commentary.",
    'The JSON format must be: {"tasks":[{"title":"...","description":null,"status":"todo","priority":"none","tags":[]}]}',
  ].join(" ")
}
