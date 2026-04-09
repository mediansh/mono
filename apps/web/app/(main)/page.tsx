"use client"

import { motion } from "motion/react"
import { LandingNavbar } from "@/components/landing-navbar"
import { LandingHero } from "@/components/landing-hero"
import { LandingDemo } from "@/components/landing-demo"
import { LandingFeatures } from "@/components/landing-features"

export default function Page() {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="relative min-h-svh overflow-hidden"
    >
      {/* Top gradient bleed */}
      <div
        className="pointer-events-none absolute top-0 right-0 left-0 h-[600px]"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(255,255,255,0.08), transparent)",
        }}
      />
      <LandingNavbar />
      <LandingHero />
      <LandingDemo />
      <LandingFeatures />
    </motion.main>
  )
}
