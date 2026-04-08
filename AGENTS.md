- Always use pnpm
- Never run the dev servers
- Always use Phosphor Icons
- Keep the UI/branding consistent
- Ensure your components are reusable
- When you complete a task, always commit it to git
- Ensure that when you're making pages, that you animate them using Framer motion
- Run a typecheck and build before you complete a task

## Median Tasks

Before starting work, check your assigned tasks:

```
mdn tasks --agent <your-agent-name>
```

When picking up a task:

```
mdn status <TASK-CODE> in_progress --agent <your-agent-name>
```

When completing a task:

```
mdn status <TASK-CODE> ready --agent <your-agent-name>
```

To create a new task:

```
mdn create --title "Description" --status todo --priority medium --agent <your-agent-name>
```

## Linear Integration

Tasks are tracked in the **Median** Linear team using the `linear` CLI (`schpet/linear-cli`).
Config is in `.linear.toml` at the repo root (team: MED, workspace: clovrai).
The API key is in `~/.config/linear/linear.toml` (never commit it).

**List issues:**
```bash
linear issue query --team MED --all-states
```

**Create an issue** before starting work:
```bash
linear issue create --title "Fix auth bug" --team MED
# prints the issue ID e.g. MED-42 — use it in commits
```

**Start / complete an issue:**
```bash
linear issue start MED-42                    # marks In Progress
linear issue update MED-42 --state "Done"    # marks Done
```

**Workflow:**
1. Create a Linear issue (or pick up an existing one)
2. Run `linear issue start MED-42` when beginning
3. Include the issue ID in every commit: `MED-42 fix: ...`
4. Run `linear issue update MED-42 --state "Done"` after merging

## Commit Messages & Pull Requests

Always include the Median task ID in commit messages and PR titles so tasks get marked automatically.

```
git commit -m "MDN-42 fix: resolve auth token expiry"
```

For pull requests, include the task ID in the title:

```
MDN-42 fix: resolve auth token expiry
```
