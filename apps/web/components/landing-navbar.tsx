"use client"

import { useState, useRef, useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTheme } from "next-themes"
import Link from "next/link"
import { CaretDown, List, X } from "@phosphor-icons/react"
import { Logo } from "@/components/logo"
import { motion, AnimatePresence } from "motion/react"

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Integrations", href: "#integrations" },
  { label: "Pricing", href: "#pricing" },
]

const resourceLinks = [
  { label: "Docs", href: "https://docs.median.sh" },
  { label: "News", href: "/news" },
  { label: "Changelog", href: "/changelog" },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileResourcesOpen, setMobileResourcesOpen] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [mobileMenuOpen])

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

  function closeMobileMenu() {
    setMobileMenuOpen(false)
    setMobileResourcesOpen(false)
  }

  return (
    <>
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
          <button
            onClick={() => window.scrollTo({ top: 0 })}
            className="relative z-10 flex cursor-pointer items-center p-2"
          >
            <Logo symbolOnly className="size-5" />
          </button>

          {/* Separator */}
          <div className="relative z-10 mx-1 h-5 w-px bg-foreground/10" />

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="relative z-10 flex items-center justify-center p-2 text-foreground/70 transition-colors hover:text-foreground sm:hidden"
            aria-label="Open menu"
          >
            <List size={20} weight="bold" />
          </button>

          {/* Desktop nav links */}
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="relative z-10 hidden px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              {link.label}
            </Link>
          ))}

          {/* Desktop resources dropdown */}
          <div
            className="relative z-10 hidden sm:block"
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
                      {...(link.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
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

          {/* Desktop separator */}
          <div className="relative z-10 mx-1 hidden h-5 w-px bg-foreground/10 sm:block" />

          {/* Desktop CTA button */}
          <Link
            href={isSignedIn ? "/app" : "/sign-up"}
            className="relative z-10 hidden h-8 w-[106px] items-center justify-center overflow-hidden rounded-full text-sm font-medium sm:flex"
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

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-xl sm:hidden"
          >
            {/* Close button */}
            <button
              type="button"
              onClick={closeMobileMenu}
              className="absolute top-6 right-6 flex items-center justify-center p-2 text-foreground/70 transition-colors hover:text-foreground"
              aria-label="Close menu"
            >
              <X size={24} weight="bold" />
            </button>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.25, delay: 0.05 }}
              className="flex h-full flex-col px-8 pt-20 pb-8"
            >
              <div className="flex flex-col gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={closeMobileMenu}
                    className="rounded-xl px-4 py-3 text-lg font-medium text-foreground/80 transition-colors hover:bg-foreground/5 hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                ))}

                {/* Resources with nested dropdown */}
                <button
                  type="button"
                  onClick={() => setMobileResourcesOpen(!mobileResourcesOpen)}
                  className="flex items-center justify-between rounded-xl px-4 py-3 text-lg font-medium text-foreground/80 transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                  Resources
                  <motion.span
                    animate={{ rotate: mobileResourcesOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <CaretDown size={16} weight="bold" />
                  </motion.span>
                </button>

                <AnimatePresence>
                  {mobileResourcesOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-col gap-1 pl-4">
                        {resourceLinks.map((link) => (
                          <Link
                            key={link.label}
                            href={link.href}
                            {...(link.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                            onClick={closeMobileMenu}
                            className="rounded-xl px-4 py-2.5 text-base font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                          >
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Dashboard / Get started CTA */}
              <div className="mt-6">
                <Link
                  href={isSignedIn ? "/app" : "/sign-up"}
                  onClick={closeMobileMenu}
                  className="relative flex h-12 items-center justify-center overflow-hidden rounded-full text-sm font-medium"
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
                  <span className={`relative z-10 ${cta.text}`}>
                    {isLoaded && isSignedIn ? "Dashboard" : "Get started"}
                  </span>
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
