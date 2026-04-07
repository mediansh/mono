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

Tasks and issues are tracked in Linear. A helper script is at `scripts/linear.sh`.

**Setup** (one-time): Add your Linear API key to `.env.local`:

```
LINEAR_API_KEY=lin_api_xxxxxxxxxxxx
```

Get a key at: Linear → Settings → API → Personal API keys

**Create a Linear issue** when starting new work:

```bash
./scripts/linear.sh create "Fix auth bug" "Description here" 3
# priorities: 0=none 1=urgent 2=high 3=medium 4=low
# prints the issue ID (e.g. ENG-42) — use it in commits
```

**Update issue status** as work progresses:

```bash
./scripts/linear.sh update ENG-42 in_progress   # when starting
./scripts/linear.sh update ENG-42 done          # when complete
```

**List recent issues:**

```bash
./scripts/linear.sh list
```

**Workflow:**

1. Before starting: create a Linear issue or pick up an existing one
2. While working: update to `in_progress`
3. After committing: update to `done`
4. Include the Linear issue ID in commit messages (e.g. `ENG-42 fix: ...`)

## Commit Messages & Pull Requests

Always include the Median task ID in commit messages and PR titles so tasks get marked automatically.

```
git commit -m "MDN-42 fix: resolve auth token expiry"
```

For pull requests, include the task ID in the title:

```
MDN-42 fix: resolve auth token expiry
```
