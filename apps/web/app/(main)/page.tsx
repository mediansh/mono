"use client"

import { motion } from "motion/react"
import { Logo } from "@/components/logo"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import { ArrowRight02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export default function Page() {
  return (
    <main className="flex min-h-svh items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="flex w-full max-w-xs flex-col items-center text-center"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <Logo className="text-4xl" />
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-muted-foreground mt-6 text-base"
        >
          The feedback engine for modern teams.
        </motion.p>

        <motion.form
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          className="mt-8 flex w-full flex-col items-center gap-3"
          onSubmit={(e) => e.preventDefault()}
        >
          <Input
            type="email"
            placeholder="you@company.com"
            className="h-10 px-4"
            style={{ borderRadius: 16 }}
            required
          />
          <Button
            size="lg"
            className="h-10 w-fit gap-2 px-6"
            style={{ borderRadius: 16 }}
          >
            Join waitlist
            <HugeiconsIcon icon={ArrowRight02Icon} className="size-4" />
          </Button>
        </motion.form>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-muted-foreground mt-8 text-sm"
        >
          Already have access?{" "}
          <a href="/sign-in" className="text-foreground underline underline-offset-4">
            Sign in
          </a>
        </motion.p>
      </motion.div>
    </main>
  )
}
