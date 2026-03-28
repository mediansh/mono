import type { Crust } from "@crustjs/core"
import { spinner } from "@crustjs/prompts"
import { style } from "@crustjs/style"
import { MedianApi } from "../lib/api.ts"
import { getConfig } from "../lib/config.ts"
import { formatStatus } from "../lib/format.ts"
import { getAgentIcon } from "../lib/agents.ts"
import type { TaskStatus } from "../types.ts"
import { TASK_STATUSES } from "../types.ts"

const s = style

export function registerStatusCommand<T extends Crust<any, any, any>>(
  cmd: T
) {
  return cmd
    .meta({
      description: "Change the status of a task",
      usage: "mdn status <task-code> <new-status> [--agent <name>]",
    })
    .args([
      {
        name: "taskCode",
        type: "string",
        description: "Task code (e.g., MED-225)",
        required: true,
      },
      {
        name: "status",
        type: "string",
        description: "New status (requests, todo, in_progress, ready, shipped, archive)",
        required: true,
      },
    ])
    .flags({
      agent: {
        type: "string",
        description: "Agent name (e.g., claude-code)",
      },
    })
    .run(async ({ args, flags }) => {
      const config = await getConfig()
      const api = new MedianApi(config.convexUrl, config.apiKey)

      const newStatus = args.status as TaskStatus
      if (!TASK_STATUSES.includes(newStatus)) {
        console.error(
          s.red(
            `\n  Invalid status: ${args.status}\n  Valid: ${TASK_STATUSES.join(", ")}\n`
          )
        )
        process.exit(1)
      }

      const result = await spinner({
        message: `Updating ${args.taskCode}...`,
        task: async () => {
          return await api.updateTaskStatus(
            args.taskCode,
            newStatus,
            flags.agent
          )
        },
      })

      const agentStr = flags.agent
        ? ` ${getAgentIcon(flags.agent)} ${s.dim(flags.agent)}`
        : ""

      console.log(
        `\n  ${s.green("\u2713")} ${s.bold(result.taskCode)}: ${result.title}`
      )
      console.log(
        `     ${formatStatus(result.previousStatus)} \u2192 ${formatStatus(result.newStatus)}${agentStr}\n`
      )
    })
}
