"use client"

import { useState, useRef, useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTheme } from "next-themes"
import Link from "next/link"
import { CaretDown } from "@phosphor-icons/react"
import { Logo } from "@/components/logo"
import { motion, AnimatePresence } from "motion/react"

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Integrations", href: "#" },
  { label: "Pricing", href: "#" },
]

const resourceLinks = [
  { label: "Docs", href: "#" },
  { label: "News", href: "#" },
  { label: "Changelog", href: "#" },
]

const glassStyles = {
  dark: {
    bg: "linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
    border:
      "linear-gradient(to bottom, rgba(255,255,255,0.18), rgba(255,255,255,0.05))",
    shadow: "0 4px 24px -4px rgba(0,0,0,0.4)",
  },
  light: {
    bg: "linear-gradient(to bottom, rgba(255,255,255,0.85), rgba(255,255,255,0.65))",
    border:
      "linear-gradient(to bottom, rgba(0,0,0,0.08), rgba(0,0,0,0.03))",
    shadow: "0 4px 24px -4px rgba(0,0,0,0.08)",
  },
}

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

export function LandingNavbar() {
  const { isSignedIn, isLoaded } = useAuth()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => setMounted(true), [])

  const isDark = !mounted || resolvedTheme === "dark"
  const glass = isDark ? glassStyles.dark : glassStyles.light
  const cta = isDark ? ctaStyles.dark : ctaStyles.light

  function handleMouseEnter() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setResourcesOpen(true)
  }

  function handleMouseLeave() {
    closeTimerRef.current = setTimeout(() => setResourcesOpen(false), 150)
  }

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
      className="fixed top-5 right-0 left-0 z-50 flex justify-center px-4"
    >
      <nav className="relative flex items-center gap-1 rounded-full px-2 py-1.5">
        {/* Glass backdrop + gradient background */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full backdrop-blur-xl"
          style={{ background: glass.bg }}
        />
        {/* Gradient border */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            padding: "1px",
            background: glass.border,
            WebkitMask:
              "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          }}
        />
        {/* Shadow */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: glass.shadow }}
        />

        {/* Logo */}
        <Link href="/" className="relative z-10 flex items-center p-2">
          <Logo symbolOnly className="size-5" />
        </Link>

        {/* Separator */}
        <div className="relative z-10 mx-1 h-5 w-px bg-foreground/10" />

        {/* Nav links */}
        {navLinks.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="relative z-10 px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}

        {/* Resources dropdown */}
        <div
          className="relative z-10"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <button
            type="button"
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Resources
            <motion.span
              animate={{ rotate: resourcesOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <CaretDown size={12} weight="bold" />
            </motion.span>
          </button>

          <AnimatePresence>
            {resourcesOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                className="absolute top-full right-0 mt-2 min-w-[140px] overflow-hidden rounded-xl border border-foreground/10 bg-background/80 p-1 shadow-lg backdrop-blur-xl"
              >
                {resourceLinks.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={() => setResourcesOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Separator */}
        <div className="relative z-10 mx-1 h-5 w-px bg-foreground/10" />

        {/* Get started / Dashboard button */}
        <Link
          href={isSignedIn ? "/app" : "/sign-up"}
          className="relative z-10 flex h-8 w-[106px] items-center justify-center overflow-hidden rounded-full text-sm font-medium"
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
          <AnimatePresence mode="wait" initial={false}>
            {isLoaded && isSignedIn ? (
              <motion.span
                key="dashboard"
                className={`relative z-10 ${cta.text}`}
                initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              >
                Dashboard
              </motion.span>
            ) : (
              <motion.span
                key="get-started"
                className={`relative z-10 ${cta.text}`}
                initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              >
                Get started
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
      </nav>
    </motion.header>
  )
}
