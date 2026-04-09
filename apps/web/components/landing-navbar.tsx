"use client"

import { useState, useRef, useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import Link from "next/link"
import { CaretDown } from "@phosphor-icons/react"
import { Logo } from "@/components/logo"
import { motion, AnimatePresence } from "motion/react"

const navLinks = [
  { label: "Features", href: "#" },
  { label: "Integrations", href: "#" },
  { label: "Pricing", href: "#" },
]

const resourceLinks = [
  { label: "Docs", href: "#" },
  { label: "News", href: "#" },
  { label: "Changelog", href: "#" },
]

export function LandingNavbar() {
  const { isSignedIn, isLoaded } = useAuth()
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setResourcesOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

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
          style={{
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
          }}
        />
        {/* Gradient border: brighter on top, duller on bottom */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            padding: "1px",
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0.18), rgba(255,255,255,0.05))",
            WebkitMask:
              "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          }}
        />
        {/* Subtle bottom shadow */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            boxShadow: "0 4px 24px -4px rgba(0,0,0,0.4)",
          }}
        />

        {/* Logo */}
        <Link
          href="/"
          className="relative z-10 flex items-center rounded-full bg-foreground/10 p-2"
        >
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
        <div ref={dropdownRef} className="relative z-10">
          <button
            type="button"
            onClick={() => setResourcesOpen((o) => !o)}
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
          className="relative z-10 flex h-8 w-[106px] items-center justify-center rounded-full bg-foreground text-sm font-medium text-background transition-colors hover:bg-foreground/90"
        >
          <AnimatePresence mode="wait" initial={false}>
            {isLoaded && isSignedIn ? (
              <motion.span
                key="dashboard"
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
