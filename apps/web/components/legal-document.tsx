"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { ArrowUpRight, FileText, ShieldCheck } from "@phosphor-icons/react"
import { LandingFooter } from "@/components/landing-footer"
import { LandingNavbar } from "@/components/landing-navbar"

type LegalPageProps = {
  title: string
  eyebrow: string
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
  eyebrow,
  lastUpdated,
  summary,
  children,
}: LegalPageProps) {
  const Icon = title.toLowerCase().includes("privacy") ? ShieldCheck : FileText

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease }}
      className="min-h-svh"
    >
      <LandingNavbar />
      <div className="mx-auto max-w-4xl px-4 pt-32 pb-24 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05, ease }}
          className="rounded-[28px] border border-foreground/10 bg-background/80 p-8 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:p-10"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
            <Icon size={14} weight="duotone" />
            {eyebrow}
          </div>
          <h1 className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Last updated {lastUpdated}
          </p>
          <p className="mt-6 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-[15px]">
            {summary}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12, ease }}
          className="mt-8 space-y-6"
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
    <section className="rounded-[24px] border border-foreground/10 bg-background/70 p-6 shadow-[0_20px_60px_-48px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:p-8">
      <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-muted-foreground sm:text-[15px]">
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
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/35" />
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
