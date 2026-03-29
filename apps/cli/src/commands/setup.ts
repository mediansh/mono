import type { Crust } from "@crustjs/core"
import { input, confirm, spinner } from "@crustjs/prompts"
import { style } from "@crustjs/style"
import { MedianApi } from "../lib/api.ts"
import { saveConfig, isConfigured, parseConvexUrlFromKey } from "../lib/config.ts"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const s = style

const AGENT_INSTRUCTIONS = `
## Median Tasks

Before starting work, check your assigned tasks:

\`\`\`
mdn tasks --agent <your-agent-name>
\`\`\`

When picking up a task:

\`\`\`
mdn status <TASK-CODE> in_progress --agent <your-agent-name>
\`\`\`

When completing a task:

\`\`\`
mdn status <TASK-CODE> ready --agent <your-agent-name>
\`\`\`

To create a new task:

\`\`\`
mdn create --title "Description" --status todo --priority medium --agent <your-agent-name>
\`\`\`

## Commit Messages & Pull Requests

Always include the Median task ID in commit messages and PR titles so tasks get marked automatically.

\`\`\`
git commit -m "MDN-42 fix: resolve auth token expiry"
\`\`\`

For pull requests, include the task ID in the title:

\`\`\`
MDN-42 fix: resolve auth token expiry
\`\`\`
`.trim()

export function registerSetupCommand<T extends Crust<any, any, any>>(
  cmd: T
) {
  return cmd
    .meta({ description: "Connect the CLI to your Median workspace" })
    .run(async () => {
      console.log(s.bold("\n  Median CLI Setup\n"))

      // Check if already configured
      if (await isConfigured()) {
        const overwrite = await confirm({
          message: "Already configured. Overwrite existing setup?",
          default: false,
        })
        if (!overwrite) {
          console.log(s.dim("  Setup cancelled.\n"))
          return
        }
      }

      const apiKey = await input({
        message: "API key (from Settings > API Keys)",
        placeholder: "mdn_...",
        validate: (value) => {
          if (!value.startsWith("mdn_")) return "API key must start with mdn_"
          if (value.length < 20) return "API key is too short"
          if (!parseConvexUrlFromKey(value))
            return "Invalid API key format"
          return true
        },
      })

      // Extract the Convex URL from the key
      const convexUrl = parseConvexUrlFromKey(apiKey)!
      console.log(`  ${s.dim("Endpoint:")} ${s.dim(convexUrl)}`)

      // Validate the key
      const api = new MedianApi(convexUrl, apiKey)

      const result = await spinner({
        message: "Validating API key...",
        task: async () => {
          return await api.validateKey()
        },
      })

      // Save config
      await saveConfig({
        apiKey,
        convexUrl,
        workspaceId: result.workspaceId,
        workspaceName: result.workspaceName,
        workspacePrefix: result.workspacePrefix,
      })

      console.log(
        `\n  ${s.green("\u2713")} Connected to workspace ${s.bold(result.workspaceName)} (${result.workspacePrefix})\n`
      )

      // Offer to append to CLAUDE.md / AGENTS.md
      const appendInstructions = await confirm({
        message:
          "Append agent instructions to CLAUDE.md and AGENTS.md in this directory?",
        default: true,
      })

      if (appendInstructions) {
        const cwd = process.cwd()

        for (const filename of ["CLAUDE.md", "AGENTS.md"]) {
          const filePath = resolve(cwd, filename)
          const existing = existsSync(filePath)
            ? readFileSync(filePath, "utf-8")
            : ""

          if (existing.includes("## Median Tasks")) {
            console.log(
              s.dim(`  ${filename} already has Median instructions, skipping.`)
            )
            continue
          }

          const content = existing
            ? `${existing}\n\n${AGENT_INSTRUCTIONS}\n`
            : `${AGENT_INSTRUCTIONS}\n`

          writeFileSync(filePath, content)
          console.log(
            `  ${s.green("\u2713")} ${existing ? "Updated" : "Created"} ${filename}`
          )
        }
      }

      console.log(
        `\n  ${s.dim("Run")} ${s.bold("mdn tasks")} ${s.dim("to see your tasks.")}\n`
      )
    })
}
