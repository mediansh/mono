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
        <div className="overflow-hidden rounded-2xl border border-foreground/10 shadow-2xl">
          <img
            src="/demo.svg"
            alt="Median dashboard"
            className="w-full"
          />
        </div>
      </motion.div>
    </section>
  )
}
