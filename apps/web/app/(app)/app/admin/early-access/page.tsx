"use client"

import { useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { motion } from "motion/react"
import { Check, Copy, Key, Plus, Trash, UserMinus } from "@phosphor-icons/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const },
  },
}

function Spinner() {
  return (
    <svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

function getCodeStatus(code: { redeemedByUserId?: string; voidedAt?: number }) {
  if (code.voidedAt) return "Voided"
  if (code.redeemedByUserId) return "Redeemed"
  return "Unused"
}

export default function AdminEarlyAccessPage() {
  const enabled = useQuery(api.earlyAccess.isEnabled)
  const codes = useQuery(api.earlyAccess.adminListCodes)
  const redemptions = useQuery(api.earlyAccess.adminListRedemptions)

  const setEnabled = useMutation(api.earlyAccess.adminSetEnabled)
  const createCode = useMutation(api.earlyAccess.adminCreateCode)
  const voidCode = useAction(api.earlyAccess.adminVoidCode)
  const removeScale = useAction(api.earlyAccess.adminRemoveScalePlan)

  const [togglingEnabled, setTogglingEnabled] = useState(false)
  const [creating, setCreating] = useState(false)
  const [note, setNote] = useState("")
  const [count, setCount] = useState(1)
  const [copied, setCopied] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState("")

  async function handleToggle() {
    setTogglingEnabled(true)
    try {
      await setEnabled({ enabled: !enabled })
    } finally {
      setTogglingEnabled(false)
    }
  }

  async function handleCreate() {
    setCreating(true)
    setError("")
    try {
      await createCode({
        note: note.trim() || undefined,
        count,
      })
      setNote("")
      setCount(1)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create code")
    } finally {
      setCreating(false)
    }
  }

  async function handleVoid(codeId: Id<"earlyAccessCodes">) {
    setPendingId(codeId)
    setError("")
    try {
      await voidCode({ codeId })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to void code")
    } finally {
      setPendingId(null)
    }
  }

  async function handleRemoveScale(redemptionId: Id<"earlyAccessRedemptions">) {
    if (!confirm("Remove the Scale plan from this early-access user?")) return
    setPendingId(redemptionId)
    setError("")
    try {
      await removeScale({ redemptionId })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove plan")
    } finally {
      setPendingId(null)
    }
  }

  async function copyToClipboard(code: string) {
    await navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.05 } } }}
      className="mx-auto max-w-3xl px-8 py-10"
    >
      <motion.div variants={fadeUp} className="mb-6">
        <h1 className="text-[15px] leading-tight font-semibold">
          Early access
        </h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Gate new sign-ups behind an access code and grant Scale plans to early
          users.
        </p>
      </motion.div>

      <motion.div
        variants={fadeUp}
        className="mb-5 flex items-center justify-between rounded-[6px] border border-sidebar-border bg-sidebar/30 p-4"
      >
        <div>
          <div className="text-[13px] font-semibold">Early access mode</div>
          <div className="text-[11px] text-muted-foreground">
            When enabled, new users must enter a code after signing up.
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={togglingEnabled || enabled === undefined}
          className={`flex h-7 w-12 items-center rounded-full p-0.5 transition-colors disabled:opacity-50 ${
            enabled ? "justify-end bg-primary" : "justify-start bg-muted"
          }`}
        >
          <span className="size-6 rounded-full bg-background shadow" />
        </button>
      </motion.div>

      {error && (
        <motion.p
          variants={fadeUp}
          className="mb-3 text-[12px] text-destructive"
        >
          {error}
        </motion.p>
      )}

      <motion.div
        variants={fadeUp}
        className="mb-6 rounded-[6px] border border-sidebar-border bg-sidebar/30 p-4"
      >
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
          <Key size={14} weight="fill" />
          Issue codes
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="h-9 flex-1 rounded-[4px] bg-background px-3 text-[13px] ring-1 ring-border outline-none placeholder:text-muted-foreground focus:ring-foreground/30"
          />
          <input
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) =>
              setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
            }
            className="h-9 w-20 rounded-[4px] bg-background px-3 text-[13px] ring-1 ring-border outline-none focus:ring-foreground/30"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="flex h-9 items-center justify-center gap-1.5 rounded-[4px] bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? <Spinner /> : <Plus size={14} weight="bold" />}
            <span>Create</span>
          </button>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="mb-8">
        <h2 className="mb-2 text-[12px] font-medium text-muted-foreground">
          Codes
        </h2>
        <div className="overflow-hidden rounded-[6px] border border-sidebar-border">
          <div className="flex items-center gap-2 border-b border-sidebar-border bg-sidebar/50 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <div className="w-28">Code</div>
            <div className="flex-1">Note</div>
            <div className="w-32">Status</div>
            <div className="w-16" />
          </div>
          {codes === undefined && (
            <div className="px-3 py-4 text-[12px] text-muted-foreground">
              Loading…
            </div>
          )}
          {codes?.length === 0 && (
            <div className="px-3 py-4 text-[12px] text-muted-foreground">
              No codes yet.
            </div>
          )}
          {codes?.map((code) => (
            <div
              key={code._id}
              className="flex items-center gap-2 border-b border-sidebar-border px-3 py-2 text-[12px] last:border-b-0"
            >
              <button
                type="button"
                onClick={() => copyToClipboard(code.code)}
                className="flex w-28 items-center gap-1.5 font-mono text-[12px] font-medium transition-colors hover:text-foreground/80"
              >
                {copied === code.code ? (
                  <Check size={12} weight="bold" />
                ) : (
                  <Copy size={12} />
                )}
                <span>{code.code}</span>
              </button>
              <div className="flex-1 truncate text-muted-foreground">
                {code.note ?? "—"}
              </div>
              <div className="w-32 text-muted-foreground">
                {getCodeStatus(code)}
              </div>
              <div className="flex w-16 justify-end">
                {!code.voidedAt && (
                  <button
                    type="button"
                    onClick={() => handleVoid(code._id)}
                    disabled={pendingId === code._id}
                    className="flex size-7 items-center justify-center rounded-[4px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-destructive disabled:opacity-50"
                    aria-label="Void code"
                  >
                    {pendingId === code._id ? <Spinner /> : <Trash size={13} />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div variants={fadeUp}>
        <h2 className="mb-2 text-[12px] font-medium text-muted-foreground">
          Early access users
        </h2>
        <div className="overflow-hidden rounded-[6px] border border-sidebar-border">
          <div className="flex items-center gap-2 border-b border-sidebar-border bg-sidebar/50 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <div className="flex-1">User</div>
            <div className="w-28">Code</div>
            <div className="w-28">Scale plan</div>
            <div className="w-16" />
          </div>
          {redemptions === undefined && (
            <div className="px-3 py-4 text-[12px] text-muted-foreground">
              Loading…
            </div>
          )}
          {redemptions?.length === 0 && (
            <div className="px-3 py-4 text-[12px] text-muted-foreground">
              No redemptions yet.
            </div>
          )}
          {redemptions?.map((redemption) => {
            const hasScale =
              !!redemption.scaleAttachedAt && !redemption.scaleRemovedAt
            return (
              <div
                key={redemption._id}
                className="flex items-center gap-2 border-b border-sidebar-border px-3 py-2 text-[12px] last:border-b-0"
              >
                <div className="flex-1 truncate">
                  <div className="font-medium">{redemption.name ?? "—"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {redemption.email ?? redemption.userId}
                  </div>
                </div>
                <div className="w-28 font-mono text-[11px] text-muted-foreground">
                  {redemption.code}
                </div>
                <div className="w-28 text-muted-foreground">
                  {hasScale
                    ? "Active"
                    : redemption.scaleRemovedAt
                      ? "Removed"
                      : "Not attached"}
                </div>
                <div className="flex w-16 justify-end">
                  {hasScale && (
                    <button
                      type="button"
                      onClick={() => handleRemoveScale(redemption._id)}
                      disabled={pendingId === redemption._id}
                      className="flex size-7 items-center justify-center rounded-[4px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-destructive disabled:opacity-50"
                      aria-label="Remove Scale plan"
                    >
                      {pendingId === redemption._id ? (
                        <Spinner />
                      ) : (
                        <UserMinus size={13} />
                      )}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>
    </motion.div>
  )
}
