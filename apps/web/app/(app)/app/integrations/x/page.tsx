"use client"

import { motion } from "motion/react"

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const } },
}

export default function XIntegrationPage() {
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
          <h2 className="text-lg font-semibold tracking-tight">X (Twitter)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Turn tweets and mentions into request tasks automatically.
          </p>
        </motion.div>

        <motion.div variants={fadeUp} className="rounded-none border border-border bg-card p-6">
          <div className="flex items-center gap-4">
            <div className="flex size-10 items-center justify-center rounded-none bg-foreground/5">
              <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" className="text-foreground">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium">Not connected</h3>
              <p className="text-xs text-muted-foreground">
                Link your X account to capture feedback from tweets.
              </p>
            </div>
            <button className="rounded-none bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90">
              Connect
            </button>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="rounded-none border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Once connected, mentions and replies will appear as request tasks with a link back to the original tweet.
          </p>
        </motion.div>
      </div>
    </motion.div>
  )
}
