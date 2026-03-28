import type { Crust } from "@crustjs/core"
import { skillPlugin, annotate } from "@crustjs/skills"

export function registerSkillPlugin<T extends Crust<any, any, any>>(
  cmd: T
) {
  return cmd.use(
    skillPlugin({
      version: "0.1.0",
      instructions: [
        "The Median CLI (`mdn`) is used to manage tasks in a Median workspace.",
        "",
        "## Setup",
        "Run `mdn setup` to authenticate with a Median workspace using an API key.",
        "API keys are generated from the Median web dashboard at Settings > API Keys.",
        "",
        "## Task Workflow for Agents",
        "",
        "Before starting work, always check assigned tasks:",
        "```",
        "mdn tasks --agent <your-agent-name>",
        "```",
        "",
        "When picking up a task, move it to in_progress:",
        "```",
        "mdn status <TASK-CODE> in_progress --agent <your-agent-name>",
        "```",
        "",
        "When a task is complete, move it to ready:",
        "```",
        "mdn status <TASK-CODE> ready --agent <your-agent-name>",
        "```",
        "",
        "To create a new task:",
        "```",
        "mdn create --title \"Task description\" --status todo --priority medium --agent <your-agent-name>",
        "```",
        "",
        "## Available Commands",
        "",
        "- `mdn setup` \u2014 Connect CLI to a Median workspace",
        "- `mdn tasks` \u2014 List tasks (flags: --status, --priority, --label, --agent, --json)",
        "- `mdn create` \u2014 Create a task (interactive or via flags: --title, --description, --status, --priority, --label, --agent)",
        "- `mdn status <code> <status>` \u2014 Change task status (flag: --agent)",
        "- `mdn skill` \u2014 Manage agent skill installations",
        "",
        "## Statuses",
        "requests, todo, in_progress, ready, shipped, archive",
        "",
        "## Priorities",
        "urgent, high, medium, low, none",
        "",
        "## Agent Identification",
        "Always pass `--agent <your-agent-name>` to identify yourself. This tracks which agent created or is working on a task.",
      ],
    })
  )
}
