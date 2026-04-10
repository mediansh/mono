"use client"

import { useEffect, type ReactNode } from "react"
import { motion } from "motion/react"
import { ShieldCheck } from "@phosphor-icons/react"

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

export default function AdminPage() {
  useEffect(() => {
    document.title = "Admin — Median"
  }, [])

  return (
    <div className="min-h-screen overflow-y-auto">
      <Stagger className="mx-auto max-w-3xl px-8 py-10">
        <motion.div variants={fadeUp} className="mb-8 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-sidebar-accent ring-1 ring-sidebar-border">
            <ShieldCheck size={16} weight="fill" className="text-foreground" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold leading-tight">Admin</h1>
            <p className="text-[12px] text-muted-foreground leading-tight">
              Internal tools. Visible only to global admins.
            </p>
          </div>
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="rounded-[6px] border border-sidebar-border bg-sidebar/30 p-5"
        >
          <h2 className="mb-1 text-[13px] font-semibold">Welcome</h2>
          <p className="text-[12px] text-muted-foreground">
            This area is reserved for Median staff. Add admin tooling here as needed.
          </p>
        </motion.div>
      </Stagger>
    </div>
  )
}
