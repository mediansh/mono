"use client"

import { type ReactNode } from "react"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  InformationCircleIcon,
  Copy01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"

function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const } },
}

function CodeBlock({ children }: { children: string }) {
  function handleCopy() {
    navigator.clipboard.writeText(children)
    toast.success("Copied to clipboard")
  }

  return (
    <div className="group relative flex items-center gap-2 rounded-[4px] bg-muted/50 px-3 py-2 font-mono text-[12px] text-foreground ring-1 ring-border">
      <code className="flex-1 select-all">{children}</code>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        aria-label="Copy to clipboard"
      >
        <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={1.8} />
      </button>
    </div>
  )
}

export function CliIntegrationPanel() {
  return (
    <Stagger className="mx-auto w-full max-w-lg px-6 py-6">
      <div className="flex flex-col gap-3">
        <motion.div variants={fadeUp}>
          <h2 className="text-[14px] font-semibold tracking-tight">CLI</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            The Median CLI lets AI agents manage tasks, update statuses, and interact with your workspace from the terminal.
          </p>
        </motion.div>

        {/* Install */}
        <motion.div variants={fadeUp} className="rounded-[4px] ring-1 ring-border bg-card">
          <div className="border-b border-border px-3.5 py-2.5">
            <h3 className="text-[13px] font-medium">Install</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Install the CLI globally with npm.
            </p>
          </div>
          <div className="px-3.5 py-3">
            <CodeBlock>npm install -g @anthropic/median</CodeBlock>
          </div>
        </motion.div>

        {/* Authentication */}
        <motion.div variants={fadeUp} className="rounded-[4px] ring-1 ring-border bg-card">
          <div className="border-b border-border px-3.5 py-2.5">
            <h3 className="text-[13px] font-medium">Authenticate</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Log in to connect the CLI to your workspace.
            </p>
          </div>
          <div className="px-3.5 py-3">
            <CodeBlock>mdn login</CodeBlock>
          </div>
        </motion.div>

        {/* Common commands */}
        <motion.div variants={fadeUp} className="rounded-[4px] ring-1 ring-border bg-card">
          <div className="border-b border-border px-3.5 py-2.5">
            <h3 className="text-[13px] font-medium">Commands</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Common commands for AI agents working with Median.
            </p>
          </div>
          <div className="flex flex-col gap-3 px-3.5 py-3">
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">List assigned tasks</p>
              <CodeBlock>mdn tasks --agent &lt;agent-name&gt;</CodeBlock>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Pick up a task</p>
              <CodeBlock>mdn status &lt;TASK-CODE&gt; in_progress --agent &lt;agent-name&gt;</CodeBlock>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Mark a task as ready</p>
              <CodeBlock>mdn status &lt;TASK-CODE&gt; ready --agent &lt;agent-name&gt;</CodeBlock>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Create a new task</p>
              <CodeBlock>mdn create --title &quot;Description&quot; --status todo --priority medium --agent &lt;agent-name&gt;</CodeBlock>
            </div>
          </div>
        </motion.div>

        {/* How it works */}
        <motion.div variants={fadeUp} className="rounded-[4px] ring-1 ring-border ring-dashed p-3.5">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <HugeiconsIcon icon={InformationCircleIcon} size={14} strokeWidth={1.8} />
            Designed for AI agents
          </div>
          <div className="grid gap-2.5 text-[12px] text-muted-foreground">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-[10px] font-semibold text-muted-foreground/60">1</span>
              <span>Add the CLI instructions to your agent&apos;s system prompt or <span className="font-mono text-foreground/70">CLAUDE.md</span> file.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-[10px] font-semibold text-muted-foreground/60">2</span>
              <span>The agent checks for assigned tasks, picks them up, and updates status as it works.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-[10px] font-semibold text-muted-foreground/60">3</span>
              <span>Include task codes like <span className="font-mono text-foreground/70">MDN-42</span> in commit messages to auto-link work.</span>
            </div>
          </div>
        </motion.div>

        {/* Tip: commit convention */}
        <motion.div variants={fadeUp} className="rounded-[4px] ring-1 ring-border ring-dashed p-3.5">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Commit convention
          </div>
          <p className="mb-2 text-[12px] text-muted-foreground">
            Include the task ID in commit messages and PR titles so tasks are updated automatically.
          </p>
          <CodeBlock>git commit -m &quot;MDN-42 fix: resolve auth token expiry&quot;</CodeBlock>
        </motion.div>
      </div>
    </Stagger>
  )
}
