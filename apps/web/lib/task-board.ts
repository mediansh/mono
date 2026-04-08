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

export const TASK_LABELS = [
  "feature",
  "bug",
  "improvement",
] as const

export const ASSIGNEE_ROLES = [
  "owner",
  "admin",
  "member",
  "guest",
] as const

export const DEFAULT_WORKSPACE_LABELS: { name: string; color: string }[] = [
  { name: "feature", color: "#a855f7" },
  { name: "bug", color: "#ef4444" },
  { name: "improvement", color: "#06b6d4" },
]

export const REQUEST_SOURCES = [
  "discord",
  "slack",
  "x",
  "linear",
  "github",
  "cli",
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export type TaskLabel = string
export type RequestSource = (typeof REQUEST_SOURCES)[number]
export type AssigneeRole = (typeof ASSIGNEE_ROLES)[number]

export type TaskSource = {
  platform: RequestSource
  url: string
  author: string
}

export type WorkspaceAssignee = {
  id: string
  name: string
  avatar: string
  role: AssigneeRole
  email?: string
  linearUserId?: string
}

export type TaskAssignee = WorkspaceAssignee

export type WorkspaceMemberAssigneeSource = {
  userId: string
  role: AssigneeRole | "owner"
  name?: string | null
  email?: string | null
  imageUrl?: string | null
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

export function normalizeAssigneeName(value: string) {
  return normalizeWhitespace(value)
}

export function normalizeAssigneeRole(
  value?: AssigneeRole | string | null
): AssigneeRole {
  if (value === "owner" || value === "admin" || value === "guest") {
    return value
  }

  return "member"
}

export function normalizeAssigneeEmail(value?: string | null) {
  const normalized = value?.trim().toLowerCase()
  return normalized ? normalized : undefined
}

function getAssigneeIdentityKeys(assignee: Partial<WorkspaceAssignee>) {
  const keys: string[] = []

  if (assignee.linearUserId?.trim()) {
    keys.push(`linear:${assignee.linearUserId.trim()}`)
  }

  const normalizedEmail = normalizeAssigneeEmail(assignee.email)
  if (normalizedEmail) {
    keys.push(`email:${normalizedEmail}`)
  }

  const normalizedId = assignee.id?.trim()
  if (normalizedId) {
    keys.push(`id:${normalizedId}`)
  }

  const normalizedName = normalizeAssigneeName(assignee.name ?? "").toLowerCase()
  if (normalizedName) {
    keys.push(`name:${normalizedName}`)
  }

  return keys
}

export function doAssigneesMatch(
  left?: Partial<WorkspaceAssignee> | null,
  right?: Partial<WorkspaceAssignee> | null
) {
  if (!left || !right) {
    return false
  }

  const leftKeys = new Set(getAssigneeIdentityKeys(left))
  if (leftKeys.size === 0) {
    return false
  }

  return getAssigneeIdentityKeys(right).some((key) => leftKeys.has(key))
}

export function findMatchingAssignee<T extends Partial<WorkspaceAssignee>>(
  assignee: Partial<WorkspaceAssignee> | null | undefined,
  assignees: T[] | undefined
) {
  if (!assignee || !assignees?.length) {
    return undefined
  }

  return assignees.find((candidate) => doAssigneesMatch(assignee, candidate))
}

export function formatAssigneeRole(role?: AssigneeRole | string | null) {
  switch (normalizeAssigneeRole(role)) {
    case "owner":
      return "Owner"
    case "admin":
      return "Admin"
    case "guest":
      return "Guest"
    case "member":
      return "Member"
  }
}

export function buildWorkspaceMemberAssignee(
  member: WorkspaceMemberAssigneeSource
): WorkspaceAssignee {
  const email = normalizeAssigneeEmail(member.email)
  const name =
    normalizeAssigneeName(member.name ?? "") ||
    email ||
    member.userId

  return {
    id: member.userId,
    name,
    avatar: member.imageUrl?.trim() ?? "",
    role: normalizeAssigneeRole(member.role),
    email,
  }
}

export function buildTaskAssignee(
  assignee?: Partial<WorkspaceAssignee> | null
): TaskAssignee | undefined {
  if (!assignee) {
    return undefined
  }

  const name = normalizeAssigneeName(assignee.name ?? "")
  if (!name) {
    return undefined
  }

  const linearUserId = assignee.linearUserId?.trim() || undefined
  const email = normalizeAssigneeEmail(assignee.email)

  return {
    id:
      assignee.id?.trim() ||
      linearUserId ||
      email ||
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    avatar: assignee.avatar?.trim() ?? "",
    role: normalizeAssigneeRole(assignee.role),
    email,
    linearUserId,
  }
}

export function normalizeWorkspaceAssignees(
  assignees: Array<Partial<WorkspaceAssignee>> | undefined
) {
  if (!assignees?.length) {
    return []
  }

  const deduped: WorkspaceAssignee[] = []

  for (const assignee of assignees) {
    const normalized = buildTaskAssignee(assignee)
    if (!normalized) {
      continue
    }

    const matchIndex = deduped.findIndex((existing) =>
      doAssigneesMatch(existing, normalized)
    )

    if (matchIndex === -1) {
      deduped.push({
        ...normalized,
        id: normalized.id || crypto.randomUUID(),
      })
      continue
    }

    const existing = deduped[matchIndex]!
    deduped[matchIndex] = {
      ...existing,
      ...normalized,
      id: existing.id || normalized.id || crypto.randomUUID(),
      avatar: normalized.avatar || existing.avatar || "",
      role: normalizeAssigneeRole(normalized.role ?? existing.role),
      email: normalized.email ?? existing.email,
      linearUserId: normalized.linearUserId ?? existing.linearUserId,
    }
  }

  return deduped.sort((a, b) => {
    const aName = a.name.toLowerCase()
    const bName = b.name.toLowerCase()
    if (aName !== bName) {
      return aName.localeCompare(bName)
    }

    const aRole = formatAssigneeRole(a.role)
    const bRole = formatAssigneeRole(b.role)
    if (aRole !== bRole) {
      return aRole.localeCompare(bRole)
    }

    return (a.email ?? "").localeCompare(b.email ?? "")
  })
}

export function mergeWorkspaceAssignableAssignees(args: {
  members?: WorkspaceMemberAssigneeSource[]
  storedAssignees?: Array<Partial<WorkspaceAssignee>>
}) {
  const memberAssignees = (args.members ?? []).map(buildWorkspaceMemberAssignee)
  const normalizedStoredAssignees = normalizeWorkspaceAssignees(
    args.storedAssignees
  )
  return normalizeWorkspaceAssignees([
    ...normalizedStoredAssignees,
    ...memberAssignees,
  ])
}

export function getAssigneeInitials(assignee?: {
  name?: string
  email?: string
}) {
  const source = normalizeAssigneeName(
    assignee?.name || assignee?.email?.split("@")[0] || ""
  )
  if (!source) {
    return "?"
  }

  const parts = source.split(" ").filter(Boolean)
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase()
  }

  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
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
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  ready: "Ready",
  shipped: "Shipped",
  archive: "Archive",
}

export const STATUS_ORDER: Record<TaskStatus, number> = {
  requests: 0,
  todo: 1,
  backlog: 2,
  in_progress: 3,
  ready: 4,
  shipped: 5,
  archive: 6,
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
    labels: ["improvement"],
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
    labels: ["improvement"],
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
    labels: ["improvement"],
    project: "Median V1",
    createdAtLabel: "Jan 15",
    assignee: { name: "Abdul", avatar: "" },
  },
]

export function getTaskNumber(taskCode: string) {
  const match = taskCode.match(/(\d+)$/)
  return match ? Number(match[1]) : 0
}

export const DEMO_TASK_SIGNATURE = new Map(
  INITIAL_TASKS.map((task) => [task.taskCode, task.title])
)

export function isDemoTaskSet(
  tasks: Array<{ taskCode: string; title: string }>
) {
  if (tasks.length !== INITIAL_TASKS.length) return false

  return tasks.every(
    (task) => DEMO_TASK_SIGNATURE.get(task.taskCode) === task.title
  )
}

export function formatTaskDate(createdAt: number, createdAtLabel?: string) {
  if (createdAtLabel) return createdAtLabel
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(createdAt))
}

type TaskSortFields = {
  status: TaskStatus
  createdAtLabel?: string
  sourceCreatedAt?: number
  _creationTime?: number
  taskNumber?: number
  order?: number
}

function parseTaskCreatedAtLabel(
  createdAtLabel: string | undefined,
  referenceTimestamp = Date.now()
) {
  const trimmed = createdAtLabel?.trim()
  if (!trimmed) return null

  const referenceDate = new Date(referenceTimestamp)
  const referenceYear = referenceDate.getFullYear()
  const parsed = new Date(`${trimmed}, ${referenceYear}`)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  // Handle labels like "Dec 31" while the current date is in early January.
  if (parsed.getTime() - referenceTimestamp > 31 * 24 * 60 * 60 * 1000) {
    parsed.setFullYear(referenceYear - 1)
  }

  return parsed.getTime()
}

export function getTaskSortTimestamp(
  task: TaskSortFields,
  referenceTimestamp = Date.now()
) {
  if (typeof task.sourceCreatedAt === "number" && Number.isFinite(task.sourceCreatedAt)) {
    return task.sourceCreatedAt
  }

  const parsedLabel = parseTaskCreatedAtLabel(
    task.createdAtLabel,
    referenceTimestamp
  )
  if (parsedLabel !== null) {
    return parsedLabel
  }

  if (typeof task._creationTime === "number" && Number.isFinite(task._creationTime)) {
    return task._creationTime
  }

  return 0
}

export function compareTasksByStatusAndRecency(
  a: TaskSortFields,
  b: TaskSortFields
) {
  const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  if (statusDiff !== 0) return statusDiff

  const createdDiff = getTaskSortTimestamp(b) - getTaskSortTimestamp(a)
  if (createdDiff !== 0) return createdDiff

  const taskNumberDiff = (b.taskNumber ?? 0) - (a.taskNumber ?? 0)
  if (taskNumberDiff !== 0) return taskNumberDiff

  return (a.order ?? 0) - (b.order ?? 0)
}

export function sortTasksByStatusAndRecency<T extends TaskSortFields>(
  tasks: T[]
) {
  return [...tasks].sort(compareTasksByStatusAndRecency)
}

export function normalizeTaskOrdersByStatus<T extends TaskSortFields & { order: number }>(
  tasks: T[]
) {
  const orderByStatus = new Map<TaskStatus, number>()

  return sortTasksByStatusAndRecency(tasks).map((task) => {
    const nextOrder = orderByStatus.get(task.status) ?? 0
    orderByStatus.set(task.status, nextOrder + 1)
    return task.order === nextOrder
      ? task
      : ({ ...task, order: nextOrder } as T)
  })
}
