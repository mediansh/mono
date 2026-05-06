"use client"

import { useState, useEffect, useRef, createContext, useContext } from "react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { motion, AnimatePresence } from "motion/react"
import { CreditCard, Check, Info, ArrowRight, Warning } from "@phosphor-icons/react"
import {
  AUTUMN_BILLING_PLANS,
  EVENT_CREDIT_COST,
  FREE_PLAN_ID,
  getPlanCopy,
} from "@/lib/billing/config"

const ease = [0.25, 0.1, 0.25, 1] as const

const planCardStyles = {
  dark: {
    bg: "linear-gradient(to bottom, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
    bgPopular: "linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
    border: "linear-gradient(to bottom, rgba(255,255,255,0.1), rgba(255,255,255,0.03))",
    borderPopular: "linear-gradient(to bottom, rgba(255,255,255,0.15), rgba(255,255,255,0.05))",
    shadow: "0 4px 24px -4px rgba(0,0,0,0.3)",
    ctaBg: "linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
    ctaBorder: "linear-gradient(to bottom, rgba(255,255,255,0.12), rgba(255,255,255,0.04))",
    ctaPopularBg: "linear-gradient(to bottom, rgba(255,255,255,1), rgba(220,220,220,1))",
    ctaPopularBorder: "linear-gradient(to bottom, rgba(255,255,255,0.9), rgba(180,180,180,0.4))",
    ctaPopularText: "text-neutral-900",
  },
  light: {
    bg: "linear-gradient(to bottom, rgba(255,255,255,0.85), rgba(255,255,255,0.65))",
    bgPopular: "linear-gradient(to bottom, rgba(255,255,255,0.9), rgba(255,255,255,0.7))",
    border: "linear-gradient(to bottom, rgba(0,0,0,0.08), rgba(0,0,0,0.03))",
    borderPopular: "linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.04))",
    shadow: "0 4px 24px -4px rgba(0,0,0,0.06)",
    ctaBg: "linear-gradient(to bottom, rgba(0,0,0,0.03), rgba(0,0,0,0.01))",
    ctaBorder: "linear-gradient(to bottom, rgba(0,0,0,0.08), rgba(0,0,0,0.03))",
    ctaPopularBg: "linear-gradient(to bottom, #1a1a1a, #2a2a2a)",
    ctaPopularBorder: "linear-gradient(to bottom, rgba(255,255,255,0.15), rgba(255,255,255,0.03))",
    ctaPopularText: "text-white",
  },
}

const PricingThemeContext = createContext<{ styles: typeof planCardStyles.dark }>({ styles: planCardStyles.dark })

export function LandingPricing() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = !mounted || resolvedTheme === "dark"
  const styles = isDark ? planCardStyles.dark : planCardStyles.light

  return (
    <PricingThemeContext.Provider value={{ styles }}>
    <section id="pricing" className="scroll-mt-24 px-4 py-24">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5, ease }}
          className="mb-12 text-center"
        >
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            <CreditCard size="1em" weight="duotone" className="mr-2 inline-block align-middle text-foreground/40 sm:mr-3" />
            Simple, transparent pricing
          </h2>
          <p className="mt-3 text-muted-foreground sm:text-lg">
            Pay-as-you-go credits. Every dollar you spend becomes a dollar of
            credits — every plan unlocks all features.
          </p>
        </motion.div>

        {/* Paid plan cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {AUTUMN_BILLING_PLANS.filter((plan) => plan.id !== FREE_PLAN_ID).map(
            (plan, i) => (
              <PlanCard key={plan.id} plan={plan} index={i} />
            )
          )}
        </div>

        {/* Free plan — wide card with caveats */}
        {(() => {
          const freePlan = AUTUMN_BILLING_PLANS.find(
            (plan) => plan.id === FREE_PLAN_ID
          )
          return freePlan ? <FreePlanCard plan={freePlan} /> : null
        })()}

        {/* Event pricing footer */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.4, ease }}
          className="mt-6 text-center"
        >
          <p className="text-sm text-muted-foreground">
            Free includes $0.50 in credits and the standard AI model. Paid plans
            grant $1 of credits per $1 paid and unlock the advanced AI model.
            Events cost ${EVENT_CREDIT_COST.toFixed(3)} each. Overages on paid
            plans are auto-charged; Free is hard-capped.
          </p>
        </motion.div>
      </div>
    </section>
    </PricingThemeContext.Provider>
  )
}

function PlanCard({
  plan,
  index,
}: {
  plan: (typeof AUTUMN_BILLING_PLANS)[number]
  index: number
}) {
  const { styles } = useContext(PricingThemeContext)
  const copy = getPlanCopy(plan.id)
  const isPopular = plan.id === "plus"

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: index * 0.1, ease }}
      className="relative rounded-2xl"
    >
      {/* Gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: isPopular ? styles.bgPopular : styles.bg,
        }}
      />
      {/* Gradient border */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          padding: "1px",
          background: isPopular ? styles.borderPopular : styles.border,
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
      {/* Shadow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{ boxShadow: styles.shadow }}
      />

      <div className="relative flex flex-col p-6">
        {/* Plan name */}
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">{copy.name}</h3>
          {copy.trialDays > 0 && (
            <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground/70">
              {copy.trialDays}-day free trial
            </span>
          )}
        </div>

        {/* Price */}
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-4xl font-bold tracking-tight">
            ${copy.price}
          </span>
          <span className="text-sm text-muted-foreground">/month</span>
        </div>
        {copy.trialDays > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Free for {copy.trialDays} days, then ${copy.price}/month
          </p>
        )}

        {/* CTA */}
        <Link
          href="/sign-up"
          className="relative mt-6 flex h-10 items-center justify-center gap-2 overflow-hidden rounded-full text-sm font-medium"
        >
          {isPopular ? (
            <>
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: styles.ctaPopularBg }}
              />
              <div
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  padding: "1px",
                  background: styles.ctaPopularBorder,
                  WebkitMask:
                    "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                  WebkitMaskComposite: "xor",
                  maskComposite: "exclude",
                }}
              />
              <span className={`relative z-10 ${styles.ctaPopularText}`}>Get started</span>
              <ArrowRight size={14} weight="bold" className={`relative z-10 ${styles.ctaPopularText}`} />
            </>
          ) : (
            <>
              <div
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{ background: styles.ctaBg }}
              />
              <div
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  padding: "1px",
                  background: styles.ctaBorder,
                  WebkitMask:
                    "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                  WebkitMaskComposite: "xor",
                  maskComposite: "exclude",
                }}
              />
              <span className="relative z-10 text-foreground">Get started</span>
              <ArrowRight size={14} weight="bold" className="relative z-10 text-foreground" />
            </>
          )}
        </Link>

        {/* Divider */}
        <div className="my-6 h-px bg-foreground/[0.06]" />

        {/* Features */}
        <ul className="flex flex-col gap-3">
          {copy.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <Check size={16} weight="bold" className="mt-0.5 shrink-0 text-foreground/40" />
              <span className="flex items-center gap-1.5">
                {feature}
                {feature.includes("credits") && (
                  <CreditsTooltip credits={plan.credits} />
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  )
}

function FreePlanCard({
  plan,
}: {
  plan: (typeof AUTUMN_BILLING_PLANS)[number]
}) {
  const { styles } = useContext(PricingThemeContext)
  const copy = getPlanCopy(plan.id)
  const creditsLabel =
    plan.credits < 1 ? plan.credits.toFixed(2) : String(plan.credits)

  const caveats = [
    "Standard AI model only — no advanced model access",
    "Hard-capped at $0.50 of credits monthly",
    "No paid overages — ingest pauses when credits run out",
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: 0.3, ease }}
      className="relative mt-4 rounded-2xl"
    >
      {/* Background */}
      <div
        className="absolute inset-0 rounded-2xl"
        style={{ background: styles.bg }}
      />
      {/* Border */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          padding: "1px",
          background: styles.border,
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
      {/* Shadow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{ boxShadow: styles.shadow }}
      />

      <div className="relative flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between md:gap-8">
        {/* Left: name, price, blurb */}
        <div className="md:max-w-xs">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{copy.name}</h3>
            <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground/70">
              No card required
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight">$0</span>
            <span className="text-sm text-muted-foreground">/month</span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            ${creditsLabel} in monthly credits to try Median end-to-end.
          </p>
        </div>

        {/* Middle: caveats */}
        <ul className="flex flex-1 flex-col gap-2 md:px-4">
          {caveats.map((caveat) => (
            <li
              key={caveat}
              className="flex items-start gap-2 text-xs text-muted-foreground"
            >
              <Warning
                size={13}
                weight="fill"
                className="mt-0.5 shrink-0 text-amber-500/80"
              />
              <span>{caveat}</span>
            </li>
          ))}
        </ul>

        {/* Right: CTA */}
        <div className="shrink-0">
          <Link
            href="/sign-up"
            className="relative flex h-10 items-center justify-center gap-2 overflow-hidden rounded-full px-5 text-sm font-medium md:px-6"
          >
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ background: styles.ctaBg }}
            />
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                padding: "1px",
                background: styles.ctaBorder,
                WebkitMask:
                  "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                WebkitMaskComposite: "xor",
                maskComposite: "exclude",
              }}
            />
            <span className="relative z-10 text-foreground">
              Start free
            </span>
            <ArrowRight
              size={14}
              weight="bold"
              className="relative z-10 text-foreground"
            />
          </Link>
        </div>
      </div>
    </motion.div>
  )
}

function CreditsTooltip({ credits }: { credits: number }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => {
      document.addEventListener("mousedown", handleClickOutside)
      document.addEventListener("touchstart", handleClickOutside)
    })
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("touchstart", handleClickOutside)
    }
  }, [open])

  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Info
        size={14}
        weight="fill"
        className="cursor-help text-foreground/30 transition-colors hover:text-foreground/50"
        onTouchEnd={(e) => {
          e.preventDefault()
          setOpen((prev) => !prev)
        }}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15, ease }}
            className="absolute bottom-full right-0 z-50 mb-2 w-56 rounded-xl border border-foreground/10 bg-background/95 p-3 shadow-lg backdrop-blur-xl sm:right-auto sm:left-1/2 sm:-translate-x-1/2"
          >
            <p className="text-xs font-medium text-foreground">How credits work</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Your plan includes ${credits < 1 ? credits.toFixed(2) : credits} of
              credits each month. Integration events cost ${EVENT_CREDIT_COST.toFixed(3)} each,
              AI is charged at cost. Usage beyond your credits is auto-charged
              at the end of the cycle (Free plan is hard-capped).
            </p>
            {/* Arrow */}
            <div className="absolute -bottom-1 right-[3px] h-2 w-2 rotate-45 border-r border-b border-foreground/10 bg-background/95 sm:right-auto sm:left-1/2 sm:-translate-x-1/2" />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}
