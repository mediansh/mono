"use client"

import { motion } from "motion/react"

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const } },
}

export default function GitHubIntegrationPage() {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      className="mx-auto w-full max-w-2xl px-10 py-10"
    >
      <div
        className="flex flex-col gap-6"
      >
        <motion.div variants={fadeUp}>
          <h2 className="text-lg font-semibold tracking-tight">GitHub</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Link repositories to sync issues and pull requests with your task board.
          </p>
        </motion.div>

        <motion.div variants={fadeUp} className="rounded-none border border-border bg-card p-6">
          <div className="flex items-center gap-4">
            <div className="flex size-10 items-center justify-center rounded-none bg-foreground/5">
              <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" className="text-foreground">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium">Not connected</h3>
              <p className="text-xs text-muted-foreground">
                Link a GitHub repository to sync issues and PRs.
              </p>
            </div>
            <button className="rounded-none bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90">
              Connect
            </button>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="rounded-none border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Once connected, GitHub issues can be imported as tasks and PR status updates will sync automatically.
          </p>
        </motion.div>
      </div>
    </motion.div>
  )
}
