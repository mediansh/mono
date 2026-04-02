"use client"

import dynamic from "next/dynamic"
import { motion } from "motion/react"
import { Logo } from "@/components/logo"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import { ArrowRight02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

const Beams = dynamic(() => import("@/components/Beams"), { ssr: false })

export default function Page() {
  return (
    <main className="flex min-h-svh">
      {/* Left — waitlist form */}
      <div className="flex w-full flex-col justify-between px-8 py-10 md:w-1/2 md:px-16 lg:px-24">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <Logo className="text-2xl" />
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

      {/* Right — Beams background */}
      <div className="relative hidden overflow-hidden md:block md:w-1/2">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="absolute inset-0"
        >
          <Beams
            beamWidth={2.5}
            beamHeight={13}
            beamNumber={11}
            lightColor="#ffffff"
            speed={1.8}
            noiseIntensity={1.25}
            scale={0.15}
            rotation={0}
          />
        </motion.div>
      </div>
    </main>
  )
}
