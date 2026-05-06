import { STATUS_ORDER, TASK_STATUSES, type TaskStatus } from "@/lib/task-board"
import type { LocalTaskDoc as TaskDoc } from "@/lib/local-first-store"

export function isDevTask(id: string) {
  return id.startsWith("dev_task_")
}

export function sortTaskDocs(tasks: TaskDoc[]) {
  return [...tasks].sort((a, b) => {
    const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if (statusDiff !== 0) return statusDiff
    return a.order - b.order
  })
}

export function normalizeTaskOrders(tasks: TaskDoc[]) {
  const orderByStatus = new Map<TaskStatus, number>()
  return tasks.map((task) => {
    const order = orderByStatus.get(task.status) ?? 0
    orderByStatus.set(task.status, order + 1)
    return task.order === order ? task : { ...task, order }
  })
}

export function moveTaskDocs(
  tasks: TaskDoc[],
  taskId: string,
  toStatus: TaskStatus,
  toIndex: number
) {
  const task = tasks.find((item) => item._id === taskId)
  if (!task) return tasks

  const withoutTask = tasks.filter((item) => item._id !== taskId)
  const targetTasks = withoutTask.filter((item) => item.status === toStatus)
  const clampedIndex = Math.min(toIndex, targetTasks.length)

  const targetIds = targetTasks.map((item) => item._id)
  targetIds.splice(clampedIndex, 0, task._id)

  const updated = withoutTask.map((item) => item)
  const insertedTask = { ...task, status: toStatus }

  const result: TaskDoc[] = []
  for (const status of TASK_STATUSES) {
    if (status === toStatus) {
      for (const id of targetIds) {
        result.push(
          id === task._id
            ? insertedTask
            : updated.find((item) => item._id === id)!
        )
      }
      continue
    }

    for (const item of updated) {
      if (item.status === status) {
        result.push(item)
      }
    }
  }

  return normalizeTaskOrders(result)
}
