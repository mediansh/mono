"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { motion } from "motion/react"
import { ArrowRight } from "@phosphor-icons/react"

const ease = [0.25, 0.1, 0.25, 1] as const

const ctaStyles = {
  dark: {
    bg: "linear-gradient(to bottom, rgba(255,255,255,1), rgba(220,220,220,1))",
    border: "linear-gradient(to bottom, rgba(255,255,255,0.9), rgba(180,180,180,0.4))",
    shadow: "0 2px 12px -2px rgba(0,0,0,0.3)",
    text: "text-neutral-900",
  },
  light: {
    bg: "linear-gradient(to bottom, #1a1a1a, #2a2a2a)",
    border: "linear-gradient(to bottom, rgba(255,255,255,0.15), rgba(255,255,255,0.03))",
    shadow: "0 2px 12px -2px rgba(0,0,0,0.2)",
    text: "text-white",
  },
}

export function LandingCta() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = !mounted || resolvedTheme === "dark"
  const cta = isDark ? ctaStyles.dark : ctaStyles.light

  return (
    <section className="px-4 py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5, ease }}
        className="mx-auto max-w-2xl text-center"
      >
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Ready to close the feedback loop?
        </h2>
        <p className="mt-3 text-muted-foreground sm:text-lg">
          Get started in minutes with a 7-day free trial on Starter.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          {/* Primary CTA */}
          <Link
            href="/sign-up"
            className="relative flex h-11 items-center gap-2 overflow-hidden rounded-full px-6 text-sm font-medium"
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: cta.bg }}
            />
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                padding: "1px",
                background: cta.border,
                WebkitMask:
                  "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                WebkitMaskComposite: "xor",
                maskComposite: "exclude",
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ boxShadow: cta.shadow }}
            />
            <span className={`relative z-10 ${cta.text}`}>Get started free</span>
            <ArrowRight size={14} weight="bold" className={`relative z-10 ${cta.text}`} />
          </Link>

          {/* Secondary */}
          <Link
            href="/sign-in"
            className="px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
        </div>
      </motion.div>
    </section>
  )
}
