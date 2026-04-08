import type { Crust } from "@crustjs/core"
import { spinner } from "@crustjs/prompts"
import { style } from "@crustjs/style"
import { MedianApi } from "../lib/api.ts"
import { getConfig } from "../lib/config.ts"
import { formatTaskList } from "../lib/format.ts"
import type { TaskStatus, TaskPriority } from "../types.ts"
import { TASK_STATUSES, TASK_PRIORITIES } from "../types.ts"

const s = style

export function registerTasksCommand<T extends Crust<any, any, any>>(
  cmd: T
) {
  return cmd
    .meta({ description: "List tasks in your workspace" })
    .flags({
      status: {
        type: "string",
        description: "Filter by status (requests, backlog, todo, in_progress, ready, shipped, archive)",
        short: "s",
      },
      priority: {
        type: "string",
        description: "Filter by priority (urgent, high, medium, low, none)",
        short: "p",
      },
      label: {
        type: "string",
        description: "Filter by label",
        short: "l",
      },
      agent: {
        type: "string",
        description: "Identify the calling agent (e.g., claude-code)",
      },
      json: {
        type: "boolean",
        description: "Output raw JSON",
      },
    })
    .run(async ({ flags }) => {
      const config = await getConfig()
      const api = new MedianApi(config.convexUrl, config.apiKey)

      // Validate filter values
      if (flags.status && !TASK_STATUSES.includes(flags.status as TaskStatus)) {
        console.error(
          s.red(`  Invalid status: ${flags.status}. Valid: ${TASK_STATUSES.join(", ")}`)
        )
        process.exit(1)
      }
      if (flags.priority && !TASK_PRIORITIES.includes(flags.priority as TaskPriority)) {
        console.error(
          s.red(`  Invalid priority: ${flags.priority}. Valid: ${TASK_PRIORITIES.join(", ")}`)
        )
        process.exit(1)
      }

      const tasks = await spinner({
        message: "Fetching tasks...",
        task: async () => {
          return await api.listTasks({
            status: flags.status as TaskStatus | undefined,
            priority: flags.priority as TaskPriority | undefined,
            label: flags.label,
          })
        },
      })

      if (flags.json) {
        console.log(JSON.stringify(tasks, null, 2))
        return
      }

      console.log(`\n  ${s.bold(config.workspaceName)} Tasks\n`)
      console.log(formatTaskList(tasks))
      console.log()
    })
}
