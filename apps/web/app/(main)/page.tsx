"use client"

import { motion } from "motion/react"
import { LandingNavbar } from "@/components/landing-navbar"
import { LandingHero } from "@/components/landing-hero"

export default function Page() {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="min-h-svh"
    >
      <LandingNavbar />
      <LandingHero />
    </motion.main>
  )
}
