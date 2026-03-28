import type { Crust } from "@crustjs/core"
import { input, select, multiselect, spinner } from "@crustjs/prompts"
import { style } from "@crustjs/style"
import { MedianApi } from "../lib/api.ts"
import { getConfig } from "../lib/config.ts"
import { getAgentIcon } from "../lib/agents.ts"
import type { TaskStatus, TaskPriority } from "../types.ts"
import { TASK_STATUSES, TASK_PRIORITIES } from "../types.ts"

const s = style

const STATUS_LABELS: Record<TaskStatus, string> = {
  requests: "Requests",
  todo: "Todo",
  in_progress: "In Progress",
  ready: "Ready",
  shipped: "Shipped",
  archive: "Archive",
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: "\u203C Urgent",
  high: "\u2191 High",
  medium: "\u2500 Medium",
  low: "\u2193 Low",
  none: "  None",
}

export function registerCreateCommand<T extends Crust<any, any, any>>(
  cmd: T
) {
  return cmd
    .meta({ description: "Create a new task" })
    .flags({
      title: {
        type: "string",
        description: "Task title",
        short: "t",
      },
      description: {
        type: "string",
        description: "Task description",
        short: "d",
      },
      status: {
        type: "string",
        description: "Task status (default: todo)",
        short: "s",
        default: "todo",
      },
      priority: {
        type: "string",
        description: "Task priority (default: medium)",
        short: "p",
        default: "medium",
      },
      label: {
        type: "string",
        description: "Task label (can be repeated)",
        multiple: true,
      },
      agent: {
        type: "string",
        description: "Agent name (e.g., claude-code)",
      },
    })
    .run(async ({ flags }) => {
      const config = await getConfig()
      const api = new MedianApi(config.convexUrl, config.apiKey)

      let title = flags.title
      let description = flags.description
      let status = flags.status as TaskStatus
      let priority = flags.priority as TaskPriority
      let labels: string[] = flags.label ?? []

      // Interactive mode if title not provided
      if (!title) {
        title = await input({
          message: "Task title",
          validate: (v) => (v.trim() ? true : "Title is required"),
        })

        description = await input({
          message: "Description (optional)",
          placeholder: "Press enter to skip",
        })

        status = (await select({
          message: "Status",
          choices: TASK_STATUSES.map((s) => ({
            label: STATUS_LABELS[s],
            value: s,
          })),
          default: "todo",
        })) as TaskStatus

        priority = (await select({
          message: "Priority",
          choices: TASK_PRIORITIES.map((p) => ({
            label: PRIORITY_LABELS[p],
            value: p,
          })),
          default: "medium",
        })) as TaskPriority

        const labelChoices = ["feature", "bug", "improvement"]
        labels = (await multiselect({
          message: "Labels (space to toggle, enter to confirm)",
          choices: labelChoices,
        })) as string[]
      }

      // Validate
      if (!TASK_STATUSES.includes(status)) {
        console.error(
          s.red(`  Invalid status: ${status}. Valid: ${TASK_STATUSES.join(", ")}`)
        )
        process.exit(1)
      }
      if (!TASK_PRIORITIES.includes(priority)) {
        console.error(
          s.red(`  Invalid priority: ${priority}. Valid: ${TASK_PRIORITIES.join(", ")}`)
        )
        process.exit(1)
      }

      const result = await spinner({
        message: "Creating task...",
        task: async () => {
          return await api.createTask({
            title: title!,
            description: description || undefined,
            status,
            priority,
            labels,
            agentName: flags.agent,
          })
        },
      })

      if (result) {
        const agentStr = flags.agent
          ? ` ${getAgentIcon(flags.agent)} ${s.dim(flags.agent)}`
          : ""
        console.log(
          `\n  ${s.green("\u2713")} Created ${s.bold(result.taskCode)}: ${result.title}${agentStr}\n`
        )
      }
    })
}
