"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { motion } from "motion/react"
import { Logo } from "@/components/logo"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import { ArrowRight02Icon, Sun02Icon, Moon02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export default function Page() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <main className="flex min-h-svh">
      {/* Left — waitlist form */}
      <div className="flex w-full flex-col justify-between px-8 py-10 md:w-1/2 md:px-16 lg:px-24">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex items-center justify-between"
        >
          <Logo className="text-2xl" />
          <button
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Toggle theme"
            suppressHydrationWarning
          >
            {mounted ? (
              <HugeiconsIcon
                icon={resolvedTheme === "dark" ? Sun02Icon : Moon02Icon}
                className="size-4"
              />
            ) : (
              <span className="block size-4" />
            )}
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex max-w-sm flex-col"
        >
          <h1 className="text-3xl font-semibold tracking-tight">
            Join the waitlist
          </h1>

          <p className="text-muted-foreground mt-3 text-base">
            The feedback engine for modern teams.
          </p>

          <form
            className="mt-8 flex flex-col gap-3"
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
          </form>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-muted-foreground text-sm"
        >
          Already have access?{" "}
          <a href="/sign-in" className="text-foreground underline underline-offset-4">
            Sign in
          </a>
        </motion.p>
      </div>

      {/* Right — inverted panel with logo */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="bg-foreground hidden items-center justify-center md:flex md:w-1/2"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <Logo symbolOnly className="text-background text-[12rem]" />
        </motion.div>
      </motion.div>
    </main>
  )
}
