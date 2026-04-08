export const TASK_STATUSES = [
  "requests",
  "todo",
  "backlog",
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

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export type Task = {
  _id: string
  taskCode: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  labels: string[]
  project: string
  assignee: { name: string; avatar: string } | null
  source: { platform: string; url: string; author: string } | null
  updatedAt: number | null
  _creationTime: number
}

export type MdnConfig = {
  apiKey: string
  convexUrl: string
  workspaceId: string
  workspaceName: string
  workspacePrefix: string
}
