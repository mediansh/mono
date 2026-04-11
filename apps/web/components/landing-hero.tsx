"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { motion } from "motion/react"
import { ChatCircleDots, Lightning, Atom, ArrowRight } from "@phosphor-icons/react"

const ease = [0.25, 0.1, 0.25, 1] as const

const ctaStyles = {
  dark: {
    bg: "linear-gradient(to bottom, rgba(255,255,255,1), rgba(220,220,220,1))",
    border:
      "linear-gradient(to bottom, rgba(255,255,255,0.9), rgba(180,180,180,0.4))",
    shadow: "0 2px 12px -2px rgba(0,0,0,0.3)",
    text: "text-neutral-900",
  },
  light: {
    bg: "linear-gradient(to bottom, #1a1a1a, #2a2a2a)",
    border:
      "linear-gradient(to bottom, rgba(255,255,255,0.15), rgba(255,255,255,0.03))",
    shadow: "0 2px 12px -2px rgba(0,0,0,0.2)",
    text: "text-white",
  },
}

const outlineStyles = {
  dark: {
    bg: "linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
    border:
      "linear-gradient(to bottom, rgba(255,255,255,0.18), rgba(255,255,255,0.05))",
    shadow: "0 2px 12px -2px rgba(0,0,0,0.2)",
  },
  light: {
    bg: "linear-gradient(to bottom, rgba(255,255,255,0.85), rgba(255,255,255,0.65))",
    border:
      "linear-gradient(to bottom, rgba(0,0,0,0.08), rgba(0,0,0,0.03))",
    shadow: "0 2px 12px -2px rgba(0,0,0,0.06)",
  },
}

function InlineIcon({
  children,
  delay,
}: {
  children: React.ReactNode
  delay: number
}) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.5, filter: "blur(4px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.5, delay, ease }}
      className="mx-1 inline-flex translate-y-[0.1em] items-center"
    >
      {children}
    </motion.span>
  )
}

export function LandingHero() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = !mounted || resolvedTheme === "dark"
  const cta = isDark ? ctaStyles.dark : ctaStyles.light
  const outline = isDark ? outlineStyles.dark : outlineStyles.light

  return (
    <section className="flex flex-col items-center px-4 pt-36 pb-16">
      {/* Heading */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease }}
        className="max-w-3xl text-center text-4xl leading-tight font-semibold tracking-tight sm:text-5xl sm:leading-tight"
      >
        The
        <InlineIcon delay={0.4}>
          <ChatCircleDots size="1em" weight="fill" className="text-foreground/60" />
        </InlineIcon>
        feedback
        <InlineIcon delay={0.55}>
          <Lightning size="1em" weight="fill" className="text-foreground/60" />
        </InlineIcon>
        engine for
        <br className="hidden sm:block" />
        <InlineIcon delay={0.7}>
          <Atom size="1em" weight="fill" className="text-foreground/60" />
        </InlineIcon>
        modern teams.
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.45, ease }}
        className="mt-5 max-w-lg text-center text-base text-muted-foreground sm:text-lg"
      >
        Collect, triage, and act on feedback from every
        channel&nbsp;&mdash;&nbsp;all in one place.
      </motion.p>

      {/* CTA buttons */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.6, ease }}
        className="mt-8 flex items-center gap-3"
      >
        {/* Get started button */}
        <Link
          href="/sign-up"
          className="relative flex h-10 items-center gap-2 overflow-hidden rounded-full px-5 text-sm font-medium"
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
          <span className={`relative z-10 ${cta.text}`}>Get started</span>
          <ArrowRight size={14} weight="bold" className={`relative z-10 ${cta.text}`} />
        </Link>

        {/* Learn more button */}
        <Link
          href="#"
          className="relative flex h-10 items-center overflow-hidden rounded-full px-5 text-sm font-medium"
        >
          <div
            className="pointer-events-none absolute inset-0 rounded-full backdrop-blur-xl"
            style={{ background: outline.bg }}
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              padding: "1px",
              background: outline.border,
              WebkitMask:
                "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ boxShadow: outline.shadow }}
          />
          <span className="relative z-10 text-foreground">Learn more</span>
        </Link>
      </motion.div>
    </section>
  )
}
