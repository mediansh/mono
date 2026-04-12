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
        {/* Desktop: full image */}
        <div className="hidden overflow-hidden rounded-2xl border border-foreground/10 shadow-2xl sm:block">
          <img
            src="/demo.svg"
            alt="Median dashboard"
            className="w-full"
          />
        </div>

        {/* Mobile: cropped to top half, zoomed in, with bottom fade */}
        <div className="relative aspect-[16/7] overflow-hidden rounded-2xl border border-foreground/10 shadow-2xl sm:hidden">
          <img
            src="/demo.svg"
            alt="Median dashboard"
            className="absolute inset-x-0 top-0 w-full origin-top scale-[1.15]"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-background" />
        </div>
      </motion.div>
    </section>
  )
}
