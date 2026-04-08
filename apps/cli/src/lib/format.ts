import { style } from "@crustjs/style"
import type { Task, TaskStatus, TaskPriority } from "../types.ts"
import { getAgentIcon, isAgentTask, getAgentName } from "./agents.ts"

const s = style

const STATUS_COLORS: Record<TaskStatus, (text: string) => string> = {
  requests: (t) => s.magenta(t),
  backlog: (t) => s.blue(t),
  todo: (t) => s.blue(t),
  in_progress: (t) => s.yellow(t),
  ready: (t) => s.cyan(t),
  shipped: (t) => s.green(t),
  archive: (t) => s.dim(t),
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  requests: "Requests",
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  ready: "Ready",
  shipped: "Shipped",
  archive: "Archive",
}

const PRIORITY_COLORS: Record<TaskPriority, (text: string) => string> = {
  urgent: (t) => s.red(t),
  high: (t) => s.yellow(t),
  medium: (t) => s.blue(t),
  low: (t) => s.dim(t),
  none: (t) => s.dim(t),
}

const PRIORITY_ICONS: Record<TaskPriority, string> = {
  urgent: "\u203C",
  high: "\u2191",
  medium: "\u2500",
  low: "\u2193",
  none: " ",
}

export function formatStatus(status: TaskStatus): string {
  return STATUS_COLORS[status](STATUS_LABELS[status])
}

export function formatPriority(priority: TaskPriority): string {
  const icon = PRIORITY_ICONS[priority]
  const label = priority.charAt(0).toUpperCase() + priority.slice(1)
  return PRIORITY_COLORS[priority](`${icon} ${label}`)
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 1) + "\u2026"
}

export function formatTaskList(tasks: Task[]): string {
  if (tasks.length === 0) {
    return s.dim("  No tasks found.")
  }

  const lines: string[] = []

  // Header
  lines.push(
    s.dim(
      `  ${"Code".padEnd(12)} ${"Title".padEnd(42)} ${"Status".padEnd(14)} ${"Priority".padEnd(12)} Agent`
    )
  )
  lines.push(s.dim("  " + "\u2500".repeat(90)))

  for (const task of tasks) {
    const code = s.bold(task.taskCode.padEnd(12))
    const title = truncate(task.title, 40).padEnd(42)
    const status = formatStatus(task.status).padEnd(14 + 10) // +10 for ANSI codes
    const priority = formatPriority(task.priority).padEnd(12 + 10)

    let agentCol = ""
    if (isAgentTask(task.source)) {
      const name = getAgentName(task.source)!
      const icon = getAgentIcon(name)
      agentCol = `${icon} ${s.dim(name)}`
    }

    lines.push(`  ${code} ${title} ${status} ${priority} ${agentCol}`)
  }

  lines.push("")
  lines.push(s.dim(`  ${tasks.length} task${tasks.length === 1 ? "" : "s"}`))

  return lines.join("\n")
}

export function formatTaskDetail(task: Task): string {
  const lines: string[] = []

  lines.push(s.bold(`${task.taskCode}: ${task.title}`))
  lines.push("")
  lines.push(`  Status:   ${formatStatus(task.status)}`)
  lines.push(`  Priority: ${formatPriority(task.priority)}`)

  if (task.labels.length > 0) {
    lines.push(`  Labels:   ${task.labels.map((l) => s.cyan(l)).join(", ")}`)
  }

  if (task.assignee) {
    lines.push(`  Assignee: ${task.assignee.name}`)
  }

  if (isAgentTask(task.source)) {
    const name = getAgentName(task.source)!
    lines.push(`  Agent:    ${getAgentIcon(name)} ${name}`)
  }

  if (task.description) {
    lines.push("")
    lines.push(s.dim("  Description:"))
    lines.push(`  ${task.description}`)
  }

  return lines.join("\n")
}
