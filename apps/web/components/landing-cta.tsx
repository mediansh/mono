"use client"

import Link from "next/link"
import { motion } from "motion/react"
import { ArrowRight } from "@phosphor-icons/react"

const ease = [0.25, 0.1, 0.25, 1] as const

export function LandingCta() {
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
          Get started in minutes. No credit card required.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          {/* Primary CTA */}
          <Link
            href="/sign-up"
            className="relative flex h-11 items-center gap-2 overflow-hidden rounded-full px-6 text-sm font-medium"
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(255,255,255,1), rgba(220,220,220,1))",
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                padding: "1px",
                background:
                  "linear-gradient(to bottom, rgba(255,255,255,0.9), rgba(180,180,180,0.4))",
                WebkitMask:
                  "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                WebkitMaskComposite: "xor",
                maskComposite: "exclude",
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ boxShadow: "0 2px 12px -2px rgba(0,0,0,0.3)" }}
            />
            <span className="relative z-10 text-neutral-900">Get started free</span>
            <ArrowRight size={14} weight="bold" className="relative z-10 text-neutral-900" />
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
