import { Crust } from "@crustjs/core"
import { helpPlugin, versionPlugin } from "@crustjs/plugins"
import pkg from "../package.json"
import { registerSetupCommand } from "./commands/setup.ts"
import { registerTasksCommand } from "./commands/tasks.ts"
import { registerCreateCommand } from "./commands/create.ts"
import { registerStatusCommand } from "./commands/status.ts"
import { registerSkillPlugin } from "./commands/skill.ts"

let cli = new Crust("mdn")
  .meta({ description: "Median task management CLI for developers and AI agents" })
  .use(versionPlugin(pkg.version))
  .use(helpPlugin())

// Register the skill plugin for agent skill generation
cli = registerSkillPlugin(cli)

// Register commands
cli = cli
  .command("login", (cmd) => registerSetupCommand(cmd))
  .command("setup", (cmd) => registerSetupCommand(cmd))
  .command("tasks", (cmd) => registerTasksCommand(cmd))
  .command("create", (cmd) => registerCreateCommand(cmd))
  .command("status", (cmd) => registerStatusCommand(cmd))

await cli.execute()
