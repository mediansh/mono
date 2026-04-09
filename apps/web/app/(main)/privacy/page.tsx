"use client"

import { motion } from "motion/react"
import { LandingNavbar } from "@/components/landing-navbar"
import { LandingFooter } from "@/components/landing-footer"

export default function PrivacyPage() {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="min-h-svh"
    >
      <LandingNavbar />
      <div className="mx-auto max-w-2xl px-4 pt-36 pb-24">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-4 text-muted-foreground">
          This page is under construction. Our privacy policy will be published here soon.
        </p>
      </div>
      <LandingFooter />
    </motion.main>
  )
}
