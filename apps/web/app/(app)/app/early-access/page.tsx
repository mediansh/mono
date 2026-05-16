"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import { motion } from "motion/react"
import { useClerk } from "@clerk/nextjs"
import { api } from "@/convex/_generated/api"
import { Logo } from "@/components/logo"
import { useInstantNavigation } from "@/hooks/use-instant-navigation"
import { clearLocalFirstStore } from "@/lib/local-first-store"

const CODE_LENGTH = 8

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export default function EarlyAccessPage() {
  const { navigate, replace } = useInstantNavigation()
  const { signOut } = useClerk()
  const enabled = useQuery(api.earlyAccess.isEnabled)
  const redemption = useQuery(api.earlyAccess.currentUserRedemption)
  const isAdmin = useQuery(api.admins.isCurrentUserAdmin)
  const redeem = useMutation(api.earlyAccess.redeemCode)

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""))
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const inputsRef = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    if (enabled === false) {
      replace("/app")
      return
    }

    if (redemption || isAdmin === true) {
      navigate("/app")
    }
  }, [enabled, redemption, isAdmin, navigate, replace])

  useEffect(() => {
    inputsRef.current[0]?.focus()
  }, [])

  function setDigit(index: number, value: string) {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "")
    if (!clean) {
      setDigits((prev) => {
        const next = [...prev]
        next[index] = ""
        return next
      })
      return
    }
    const chars = clean.split("")
    setDigits((prev) => {
      const next = [...prev]
      let cursor = index
      for (const ch of chars) {
        if (cursor >= CODE_LENGTH) break
        next[cursor] = ch
        cursor += 1
      }
      const nextFocus = Math.min(cursor, CODE_LENGTH - 1)
      requestAnimationFrame(() => inputsRef.current[nextFocus]?.focus())
      return next
    })
    if (error) setError("")
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus()
      setDigits((prev) => {
        const next = [...prev]
        next[index - 1] = ""
        return next
      })
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputsRef.current[index - 1]?.focus()
    } else if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const text = e.clipboardData.getData("text")
    setDigit(0, text)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = digits.join("")
    if (code.length !== CODE_LENGTH) {
      setError("Please enter the full code")
      return
    }
    setLoading(true)
    setError("")
    try {
      await redeem({ code })
      navigate("/app")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not redeem code")
      setLoading(false)
    }
  }

  if (enabled === undefined || redemption === undefined || isAdmin === undefined) {
    return null
  }

  if (!enabled || redemption || isAdmin) return null

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-[340px]"
      >
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <Logo symbolOnly className="size-9" />
          </Link>
        </div>

        <div className="rounded-[8px] gradient-border gradient-border-to-tl gradient-border-from-neutral-700 gradient-border-via-neutral-800 gradient-border-to-neutral-600 bg-card p-5 ring-1 ring-border">
          <h1 className="text-center text-[16px] font-semibold">Enter your access code</h1>
          <p className="mt-1 text-center text-[14px] text-muted-foreground">
            Median is in early access. Enter your invite code to continue.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
            <div className="flex justify-between gap-1.5">
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputsRef.current[i] = el
                  }}
                  type="text"
                  inputMode="text"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={1}
                  value={digit}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={handlePaste}
                  className="h-10 w-full rounded-[8px] bg-background text-center text-[15px] font-medium uppercase ring-1 ring-border outline-none transition-all focus:ring-foreground/30"
                />
              ))}
            </div>

            {error && <p className="text-[13px] text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex h-9 items-center justify-center rounded-[8px] bg-primary text-[14px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? <Spinner /> : "Continue"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-[14px] text-muted-foreground">
          Don&apos;t have a code?{" "}
          <button
            type="button"
            onClick={() => { clearLocalFirstStore(); signOut({ redirectUrl: "/" }) }}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign out
          </button>
        </p>
      </motion.div>
    </div>
  )
}
