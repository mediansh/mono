- Always use pnpm
- Never run the dev servers
- Always use Hugeicons
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
