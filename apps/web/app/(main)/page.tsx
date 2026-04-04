"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { motion, AnimatePresence } from "motion/react"
import { useMutation, useQuery } from "convex/react"
import { Logo } from "@/components/logo"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import { ArrowRight02Icon, Sun02Icon, Moon02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { api } from "@/convex/_generated/api"

export default function Page() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const joinWaitlist = useMutation(api.waitlist.join)
  const waitlistCount = useQuery(api.waitlist.getCount)

  useEffect(() => setMounted(true), [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || submitting) return

    setSubmitting(true)
    setError("")

    try {
      const result = await joinWaitlist({ email })

      if (!result.alreadyJoined) {
        fetch("/api/waitlist/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }).catch(() => {})
      }

      setSubmitted(true)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

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

          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                className="mt-8 flex items-center gap-2.5 text-[14px] font-medium"
              >
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-5 text-emerald-500" />
                You&apos;re on the list. We&apos;ll be in touch.
              </motion.div>
            ) : (
              <motion.form
                key="form"
                className="mt-8 flex flex-col gap-3"
                onSubmit={handleSubmit}
              >
                <Input
                  type="email"
                  placeholder="you@company.com"
                  className="h-10 px-4"
                  style={{ borderRadius: 16 }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Button
                  type="submit"
                  size="lg"
                  className="h-10 w-fit gap-2 px-6"
                  style={{ borderRadius: 16 }}
                  disabled={submitting}
                >
                  {submitting ? "Joining..." : "Join waitlist"}
                  {!submitting && <HugeiconsIcon icon={ArrowRight02Icon} className="size-4" />}
                </Button>
                {error && (
                  <p className="text-[13px] text-destructive">{error}</p>
                )}
              </motion.form>
            )}
          </AnimatePresence>

          <div className="mt-4 h-5">
            {typeof waitlistCount === "number" && waitlistCount > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="text-muted-foreground text-[13px]"
              >
                {waitlistCount.toLocaleString()} {waitlistCount === 1 ? "person has" : "people have"} joined so far.
              </motion.p>
            )}
          </div>
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
        className="relative hidden items-center justify-center overflow-hidden md:flex md:w-1/2"
      >
        <img
          src="/waitlistbg.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover brightness-[0.35]"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          className="relative mix-blend-difference"
        >
          <Logo symbolOnly className="text-white text-[12rem]" />
        </motion.div>
      </motion.div>
    </main>
  )
}
