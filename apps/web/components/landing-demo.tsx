"use client"

import { motion } from "motion/react"

export function LandingDemo() {
  return (
    <section className="px-4 pb-24">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
        className="mx-auto max-w-6xl"
      >
        <div className="relative overflow-hidden rounded-2xl border border-foreground/10 shadow-2xl">
          <div className="max-h-[220px] sm:max-h-none">
            <img
              src="/demo.svg"
              alt="Median dashboard"
              className="w-full"
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-background sm:hidden" />
        </div>
      </motion.div>
    </section>
  )
}
