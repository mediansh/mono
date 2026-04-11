"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { ArrowUpRight } from "@phosphor-icons/react"
import { LandingFooter } from "@/components/landing-footer"
import { LandingNavbar } from "@/components/landing-navbar"

type LegalPageProps = {
  title: string
  lastUpdated: string
  summary: string
  children: ReactNode
}

type LegalSectionProps = {
  title: string
  children: ReactNode
}

const ease = [0.25, 0.1, 0.25, 1] as const

export function LegalPage({
  title,
  lastUpdated,
  summary,
  children,
}: LegalPageProps) {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease }}
      className="min-h-svh"
    >
      <LandingNavbar />
      <div className="mx-auto max-w-2xl px-4 pt-36 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05, ease }}
        >
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated {lastUpdated}
          </p>
          <p className="mt-6 text-sm leading-7 text-muted-foreground">
            {summary}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12, ease }}
          className="mt-10 space-y-10"
        >
          {children}
        </motion.div>
      </div>
      <LandingFooter />
    </motion.main>
  )
}

export function LegalSection({ title, children }: LegalSectionProps) {
  return (
    <section>
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/25" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export function LegalLink({
  href,
  children,
  external = false,
}: {
  href: string
  children: ReactNode
  external?: boolean
}) {
  return (
    <Link
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="inline-flex items-center gap-1 text-foreground transition-colors hover:text-foreground/70"
    >
      {children}
      {external ? <ArrowUpRight size={14} /> : null}
    </Link>
  )
}
