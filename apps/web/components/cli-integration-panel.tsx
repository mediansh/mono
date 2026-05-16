"use client"

import { type ReactNode } from "react"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, ArrowRight01Icon, Key01Icon } from "@hugeicons/core-free-icons"
import Link from "next/link"
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
    <div className="group relative flex items-center gap-2 rounded-[8px] bg-muted/50 px-3 py-2 font-mono text-[13px] text-foreground ring-1 ring-border">
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
          <h2 className="text-[15px] font-semibold tracking-tight">CLI</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            A command-line tool for AI agents to manage tasks in your workspace.
          </p>
        </motion.div>

        {/* Quick start */}
        <motion.div variants={fadeUp} className="rounded-[8px] ring-1 ring-border gradient-border gradient-border-to-tl gradient-border-from-neutral-700 gradient-border-via-neutral-800 gradient-border-to-neutral-600 bg-card">
          <div className="border-b border-border px-3.5 py-2.5">
            <h3 className="text-[14px] font-medium">Quick start</h3>
          </div>
          <div className="flex flex-col gap-2.5 px-3.5 py-3">
            <CodeBlock>npm install -g @mediansh/cli</CodeBlock>
            <CodeBlock>mdn login</CodeBlock>
          </div>
        </motion.div>

        {/* Links */}
        <motion.div variants={fadeUp} className="flex flex-col gap-2">
          <Link href="/app/settings/api-keys">
            <Button variant="outline" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <HugeiconsIcon icon={Key01Icon} size={14} strokeWidth={1.8} />
                Create an API key
              </span>
              <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.8} />
            </Button>
          </Link>
          <a
            href="https://median.mintlify.app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" className="w-full justify-between">
              <span>View full documentation</span>
              <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.8} />
            </Button>
          </a>
        </motion.div>
      </div>
    </Stagger>
  )
}
