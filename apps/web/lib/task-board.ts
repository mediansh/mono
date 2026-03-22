export const TASK_STATUSES = [
  "requests",
  "todo",
  "in_progress",
  "ready",
  "shipped",
  "archive",
] as const

export const TASK_PRIORITIES = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
] as const

export const TASK_LABELS = [
  "feature",
  "bug",
  "improvement",
  "design",
  "devops",
] as const

export const REQUEST_SOURCES = ["discord", "slack", "x"] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export type TaskLabel = (typeof TASK_LABELS)[number]
export type RequestSource = (typeof REQUEST_SOURCES)[number]

export type TaskSource = {
  platform: RequestSource
  url: string
  author: string
}

export type TaskSeed = {
  taskCode: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  labels: TaskLabel[]
  project: string
  createdAtLabel: string
  assignee?: {
    name: string
    avatar: string
  }
  source?: TaskSource
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  requests: "Requests",
  todo: "Todo",
  in_progress: "In Progress",
  ready: "Ready",
  shipped: "Shipped",
  archive: "Archive",
}

export const STATUS_ORDER: Record<TaskStatus, number> = {
  requests: 0,
  todo: 1,
  in_progress: 2,
  ready: 3,
  shipped: 4,
  archive: 5,
}

export const INITIAL_TASKS: TaskSeed[] = [
  {
    taskCode: "MED-225",
    title: "Preview Code Feature (Similar to Lovable - Image Attached)",
    status: "requests",
    priority: "medium",
    labels: ["feature"],
    project: "Median V1",
    createdAtLabel: "Mar 11",
    source: { platform: "discord", url: "https://discord.com/channels/1234/5678", author: "alex_dev" },
  },
  {
    taskCode: "MED-226",
    title: "Have the ability to view the generated file tree in real time as it builds",
    status: "requests",
    priority: "low",
    labels: ["feature"],
    project: "Median V1",
    createdAtLabel: "Mar 11",
    source: { platform: "slack", url: "https://workspace.slack.com/archives/C01234/p1234", author: "sarah.m" },
  },
  {
    taskCode: "MED-230",
    title: "Multi-language support for generated components",
    status: "requests",
    priority: "low",
    labels: ["feature"],
    project: "Median V1",
    createdAtLabel: "Mar 12",
    source: { platform: "x", url: "https://x.com/user/status/1234567890", author: "@jcole_ui" },
  },
  {
    taskCode: "MED-196",
    title: "Export with GitHub Repository Integration",
    status: "todo",
    priority: "medium",
    labels: ["feature"],
    project: "Median V1",
    createdAtLabel: "Mar 5",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    taskCode: "MED-219",
    title: "Add Style Selection for UI Generation",
    status: "todo",
    priority: "medium",
    labels: ["feature"],
    project: "Median V1",
    createdAtLabel: "Mar 10",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    taskCode: "MED-221",
    title: "Plan Feature",
    status: "todo",
    priority: "medium",
    labels: ["feature"],
    project: "Median V1",
    createdAtLabel: "Mar 10",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    taskCode: "MED-240",
    title: "Add keyboard shortcuts for common actions",
    status: "todo",
    priority: "low",
    labels: ["improvement"],
    project: "Median V1",
    createdAtLabel: "Mar 12",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    taskCode: "MED-262",
    title: "Add \"See Median in Action\" Demo Button to Landing",
    status: "in_progress",
    priority: "medium",
    labels: [],
    project: "Median V1",
    createdAtLabel: "Mar 14",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    taskCode: "MED-30",
    title: "Preview refreshes after theme change",
    status: "in_progress",
    priority: "high",
    labels: ["bug"],
    project: "Median V1",
    createdAtLabel: "Feb 1",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    taskCode: "MED-270",
    title: "CI/CD pipeline for staging environment",
    status: "in_progress",
    priority: "high",
    labels: ["devops"],
    project: "Median V1",
    createdAtLabel: "Mar 15",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    taskCode: "MED-54",
    title: "WAITLIST SECURITY",
    status: "ready",
    priority: "urgent",
    labels: ["bug"],
    project: "Median V1",
    createdAtLabel: "Feb 13",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    taskCode: "MED-217",
    title: "Issue: Sidebar Dragging (Videos Attached)",
    status: "ready",
    priority: "medium",
    labels: ["bug"],
    project: "Median V1",
    createdAtLabel: "Mar 10",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    taskCode: "MED-249",
    title: "Specific prompts sometimes generate full pages",
    status: "ready",
    priority: "medium",
    labels: ["bug"],
    project: "Median V1",
    createdAtLabel: "Mar 13",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    taskCode: "MED-40",
    title: "Landing page redesign",
    status: "shipped",
    priority: "high",
    labels: ["design"],
    project: "Median V1",
    createdAtLabel: "Jan 28",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    taskCode: "MED-35",
    title: "User authentication flow",
    status: "shipped",
    priority: "urgent",
    labels: ["feature"],
    project: "Median V1",
    createdAtLabel: "Jan 25",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    taskCode: "MED-52",
    title: "Create Waitlist",
    status: "shipped",
    priority: "medium",
    labels: [],
    project: "Median V1",
    createdAtLabel: "Feb 12",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    taskCode: "MED-222",
    title: "Further improve mic voice-to-text (Web Speech API)",
    status: "shipped",
    priority: "medium",
    labels: ["improvement"],
    project: "Median V1",
    createdAtLabel: "Mar 10",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    taskCode: "MED-29",
    title: "Theme changes save to globals.css",
    status: "shipped",
    priority: "high",
    labels: [],
    project: "Median V1",
    createdAtLabel: "Feb 1",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    taskCode: "MED-64",
    title: "Waitlist Spam Issue",
    status: "archive",
    priority: "low",
    labels: [],
    project: "Median V1",
    createdAtLabel: "Feb 14",
    assignee: { name: "Abdul", avatar: "" },
  },
  {
    taskCode: "MED-18",
    title: "Initial project scaffolding",
    status: "archive",
    priority: "medium",
    labels: ["devops"],
    project: "Median V1",
    createdAtLabel: "Jan 15",
    assignee: { name: "Abdul", avatar: "" },
  },
]

export function getTaskNumber(taskCode: string) {
  const match = taskCode.match(/(\d+)$/)
  return match ? Number(match[1]) : 0
}

export function formatTaskDate(createdAt: number, createdAtLabel?: string) {
  if (createdAtLabel) return createdAtLabel
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(createdAt))
}
