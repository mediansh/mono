"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import {
  Bug,
  X,
  CaretDown,
  CaretRight,
  ArrowCounterClockwise,
  Sun,
  Moon,
  Desktop,
  Spinner,
  WifiSlash,
  WifiHigh,
  WifiMedium,
  Eye,
  EyeSlash,
  Cursor,
  Warning,
  CheckCircle,
  Info,
  User,
  Users,
  UserCircle,
  ShieldCheck,
  Crown,
  Layout,
  Stack,
  Palette,
  Lightning,
  ClipboardText,
  BoundingBox,
  Trash,
} from "@phosphor-icons/react"
import {
  useDevDebug,
  setDevDebug,
  toggleDevPanel,
  resetDevDebug,
  type SimulatedRole,
  type SimulatedLoadingTarget,
  type SimulatedErrorTarget,
  type SimulatedNetworkState,
} from "@/lib/dev-debug-store"
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUS_LABELS,
  DEFAULT_WORKSPACE_LABELS,
  type TaskStatus,
  type TaskPriority,
} from "@/lib/task-board"

// ─── Section wrapper ───────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  id,
  expandedSection,
  onToggle,
  children,
}: {
  title: string
  icon: React.ComponentType<{ size?: number; weight?: "regular" | "bold" | "fill" }>
  id: string
  expandedSection: string | null
  onToggle: (id: string) => void
  children: React.ReactNode
}) {
  const isOpen = expandedSection === id

  return (
    <div className="border-b border-white/10 last:border-b-0">
      <button
        onClick={() => onToggle(id)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-white/50 transition-colors hover:text-white/80"
      >
        {isOpen ? <CaretDown size={10} /> : <CaretRight size={10} />}
        <Icon size={12} />
        {title}
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 space-y-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Pill toggle ───────────────────────────────────────────────────

function Pill({
  label,
  active,
  onClick,
  color = "blue",
}: {
  label: string
  active: boolean
  onClick: () => void
  color?: "blue" | "red" | "yellow" | "green" | "purple" | "neutral"
}) {
  const colors = {
    blue: active ? "bg-blue-500/20 text-blue-300 ring-blue-500/40" : "bg-white/5 text-white/40 ring-white/10",
    red: active ? "bg-red-500/20 text-red-300 ring-red-500/40" : "bg-white/5 text-white/40 ring-white/10",
    yellow: active ? "bg-yellow-500/20 text-yellow-300 ring-yellow-500/40" : "bg-white/5 text-white/40 ring-white/10",
    green: active ? "bg-green-500/20 text-green-300 ring-green-500/40" : "bg-white/5 text-white/40 ring-white/10",
    purple: active ? "bg-purple-500/20 text-purple-300 ring-purple-500/40" : "bg-white/5 text-white/40 ring-white/10",
    neutral: active ? "bg-white/15 text-white/80 ring-white/30" : "bg-white/5 text-white/40 ring-white/10",
  }

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 transition-all ${colors[color]}`}
    >
      {label}
    </button>
  )
}

// ─── Toggle row ────────────────────────────────────────────────────

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-[11px] text-white/60">{label}</span>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-4 w-7 rounded-full transition-colors ${value ? "bg-blue-500" : "bg-white/15"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform ${value ? "translate-x-3" : ""}`}
        />
      </button>
    </label>
  )
}

// ─── Action button ─────────────────────────────────────────────────

function ActionButton({
  label,
  onClick,
  icon: Icon,
  variant = "default",
}: {
  label: string
  onClick: () => void
  icon?: React.ComponentType<{ size?: number }>
  variant?: "default" | "destructive"
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
        variant === "destructive"
          ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
          : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
      }`}
    >
      {Icon && <Icon size={12} />}
      {label}
    </button>
  )
}

// ─── CSS variable viewer ───────────────────────────────────────────

function CSSVariableRow({ name }: { name: string }) {
  const [value, setValue] = useState("")

  useEffect(() => {
    const computed = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    setValue(computed)
  }, [name])

  const isColor = value.startsWith("#") || value.startsWith("rgb") || value.startsWith("hsl") || value.startsWith("oklch")

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="truncate font-mono text-[10px] text-white/40">{name}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        {isColor && (
          <div
            className="h-3 w-3 rounded-sm ring-1 ring-white/10"
            style={{ background: `var(${name})` }}
          />
        )}
        <span className="font-mono text-[10px] text-white/60">{value || "–"}</span>
      </div>
    </div>
  )
}

// ─── Breakpoint indicator ──────────────────────────────────────────

function useBreakpoint() {
  const [bp, setBp] = useState("")

  useEffect(() => {
    function update() {
      const w = window.innerWidth
      if (w < 640) setBp("xs")
      else if (w < 768) setBp("sm")
      else if (w < 1024) setBp("md")
      else if (w < 1280) setBp("lg")
      else if (w < 1536) setBp("xl")
      else setBp("2xl")
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  return bp
}

// ─── Main panel ────────────────────────────────────────────────────

function DevDebugPanelContent() {
  const debug = useDevDebug()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const breakpoint = useBreakpoint()
  const [windowSize, setWindowSize] = useState({ w: 0, h: 0 })
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function update() {
      setWindowSize({ w: window.innerWidth, h: window.innerHeight })
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  // Global keyboard shortcut: Ctrl+Shift+D
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault()
        toggleDevPanel()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // Layout outlines effect
  useEffect(() => {
    if (debug.showLayoutOutlines) {
      const style = document.createElement("style")
      style.id = "dev-debug-outlines"
      style.textContent = `* { outline: 1px solid rgba(59, 130, 246, 0.3) !important; }`
      document.head.appendChild(style)
      return () => { style.remove() }
    }
  }, [debug.showLayoutOutlines])

  const toggleSection = useCallback((id: string) => {
    setDevDebug("expandedSection", debug.expandedSection === id ? null : id)
  }, [debug.expandedSection])

  const cssVars = [
    "--background", "--foreground", "--card", "--card-foreground",
    "--primary", "--primary-foreground", "--border", "--muted",
    "--muted-foreground", "--destructive", "--sidebar", "--radius",
  ]

  return (
    <AnimatePresence>
      {debug.panelOpen && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, x: 20, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 20, scale: 0.95 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="fixed bottom-14 right-3 z-[99999] w-72 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border border-white/10 bg-[#1a1a1a] shadow-2xl shadow-black/50"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#1a1a1a] px-3 py-2">
            <div className="flex items-center gap-2">
              <Bug size={14} className="text-yellow-400" />
              <span className="text-[12px] font-semibold text-white/90">Dev Debug</span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-white/30">
                {breakpoint} · {windowSize.w}×{windowSize.h}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={resetDevDebug}
                className="rounded p-1 text-white/30 transition-colors hover:bg-white/10 hover:text-white/60"
                title="Reset all"
              >
                <ArrowCounterClockwise size={12} />
              </button>
              <button
                onClick={toggleDevPanel}
                className="rounded p-1 text-white/30 transition-colors hover:bg-white/10 hover:text-white/60"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* ── Theme ───────────────────────────── */}
          <Section title="Theme" icon={Palette} id="theme" expandedSection={debug.expandedSection} onToggle={toggleSection}>
            <div className="flex gap-1">
              {(["light", "dark", "system"] as const).map((t) => (
                <Pill
                  key={t}
                  label={t}
                  active={theme === t}
                  onClick={() => setTheme(t)}
                  color="neutral"
                />
              ))}
            </div>
            <p className="text-[10px] text-white/30">
              Resolved: {resolvedTheme} · Hotkey: <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-[9px]">D</kbd>
            </p>
          </Section>

          {/* ── Auth & Roles ────────────────────── */}
          <Section title="Auth & Roles" icon={ShieldCheck} id="roles" expandedSection={debug.expandedSection} onToggle={toggleSection}>
            <p className="text-[10px] text-white/30 mb-1">Simulate permission level</p>
            <div className="flex flex-wrap gap-1">
              {(["owner", "admin", "member", "guest", null] as SimulatedRole[]).map((role) => (
                <Pill
                  key={role ?? "real"}
                  label={role ?? "Real"}
                  active={debug.simulatedRole === role}
                  onClick={() => setDevDebug("simulatedRole", role)}
                  color={role === "owner" ? "purple" : role === "admin" ? "blue" : role === "guest" ? "yellow" : "neutral"}
                />
              ))}
            </div>
          </Section>

          {/* ── Loading States ──────────────────── */}
          <Section title="Loading States" icon={Spinner} id="loading" expandedSection={debug.expandedSection} onToggle={toggleSection}>
            <div className="flex flex-wrap gap-1">
              {(["workspace", "tasks", "auth", "global", null] as SimulatedLoadingTarget[]).map((target) => (
                <Pill
                  key={target ?? "none"}
                  label={target ?? "None"}
                  active={debug.simulatedLoading === target}
                  onClick={() => setDevDebug("simulatedLoading", target)}
                  color="blue"
                />
              ))}
            </div>
          </Section>

          {/* ── Error States ────────────────────── */}
          <Section title="Error States" icon={Warning} id="errors" expandedSection={debug.expandedSection} onToggle={toggleSection}>
            <div className="flex flex-wrap gap-1">
              {(["app", "global", null] as SimulatedErrorTarget[]).map((target) => (
                <Pill
                  key={target ?? "none"}
                  label={target ?? "None"}
                  active={debug.simulatedError === target}
                  onClick={() => setDevDebug("simulatedError", target)}
                  color="red"
                />
              ))}
            </div>
          </Section>

          {/* ── Empty States ────────────────────── */}
          <Section title="Empty States" icon={Stack} id="empty" expandedSection={debug.expandedSection} onToggle={toggleSection}>
            <ToggleRow
              label="No tasks (empty board)"
              value={debug.simulateEmptyTasks}
              onChange={(v) => setDevDebug("simulateEmptyTasks", v)}
            />
            <ToggleRow
              label="No workspace (force setup)"
              value={debug.simulateNoWorkspace}
              onChange={(v) => setDevDebug("simulateNoWorkspace", v)}
            />
          </Section>

          {/* ── Network ─────────────────────────── */}
          <Section title="Network" icon={WifiHigh} id="network" expandedSection={debug.expandedSection} onToggle={toggleSection}>
            <div className="flex gap-1">
              {(["online", "slow", "offline"] as SimulatedNetworkState[]).map((s) => (
                <Pill
                  key={s}
                  label={s}
                  active={debug.networkState === s}
                  onClick={() => setDevDebug("networkState", s)}
                  color={s === "offline" ? "red" : s === "slow" ? "yellow" : "green"}
                />
              ))}
            </div>
            <p className="text-[10px] text-white/30">
              {debug.networkState === "slow"
                ? "Adds 2s delay to fetch/XHR"
                : debug.networkState === "offline"
                  ? "Blocks all fetch/XHR requests"
                  : "Normal network behavior"}
            </p>
          </Section>

          {/* ── Toast Triggers ──────────────────── */}
          <Section title="Toast Triggers" icon={Lightning} id="toasts" expandedSection={debug.expandedSection} onToggle={toggleSection}>
            <div className="grid grid-cols-2 gap-1">
              <ActionButton label="Success" icon={CheckCircle} onClick={() => toast.success("Task created successfully")} />
              <ActionButton label="Error" icon={Warning} onClick={() => toast.error("Failed to save changes")} />
              <ActionButton label="Info" icon={Info} onClick={() => toast.info("New integration available")} />
              <ActionButton label="Warning" icon={Warning} onClick={() => toast.warning("API rate limit approaching")} />
              <ActionButton label="Loading" icon={Spinner} onClick={() => {
                const id = toast.loading("Syncing tasks...")
                setTimeout(() => toast.success("Synced!", { id }), 2000)
              }} />
              <ActionButton label="Promise" icon={Lightning} onClick={() => {
                toast.promise(new Promise(r => setTimeout(r, 2000)), {
                  loading: "Processing...",
                  success: "Done!",
                  error: "Failed!",
                })
              }} />
            </div>
          </Section>

          {/* ── Layout Debug ────────────────────── */}
          <Section title="Layout Debug" icon={BoundingBox} id="layout" expandedSection={debug.expandedSection} onToggle={toggleSection}>
            <ToggleRow
              label="Show element outlines"
              value={debug.showLayoutOutlines}
              onChange={(v) => setDevDebug("showLayoutOutlines", v)}
            />
            <ToggleRow
              label="Render count overlay"
              value={debug.showRenderCounts}
              onChange={(v) => setDevDebug("showRenderCounts", v)}
            />
            <div className="grid grid-cols-4 gap-1 mt-1">
              {[320, 375, 768, 1024, 1280, 1440, 1920, 0].map((w) => (
                <button
                  key={w}
                  onClick={() => {
                    if (w === 0) {
                      document.documentElement.style.removeProperty("max-width")
                      document.documentElement.style.removeProperty("margin")
                      toast.info("Viewport reset")
                    } else {
                      document.documentElement.style.maxWidth = `${w}px`
                      document.documentElement.style.margin = "0 auto"
                      toast.info(`Viewport → ${w}px`)
                    }
                  }}
                  className="rounded bg-white/5 px-1 py-0.5 text-center font-mono text-[9px] text-white/40 ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white/60"
                >
                  {w === 0 ? "Reset" : w}
                </button>
              ))}
            </div>
          </Section>

          {/* ── CSS Variables ───────────────────── */}
          <Section title="CSS Variables" icon={Palette} id="css" expandedSection={debug.expandedSection} onToggle={toggleSection}>
            <div className="space-y-1">
              {cssVars.map((v) => (
                <CSSVariableRow key={v} name={v} />
              ))}
            </div>
          </Section>

          {/* ── Quick Actions ───────────────────── */}
          <Section title="Quick Actions" icon={ClipboardText} id="actions" expandedSection={debug.expandedSection} onToggle={toggleSection}>
            <ActionButton
              label="Copy current state as JSON"
              icon={ClipboardText}
              onClick={() => {
                const state = {
                  theme: resolvedTheme,
                  breakpoint,
                  window: windowSize,
                  debug,
                  pathname: window.location.pathname,
                  cookies: document.cookie,
                }
                navigator.clipboard.writeText(JSON.stringify(state, null, 2))
                toast.success("Debug state copied to clipboard")
              }}
            />
            <ActionButton
              label="Clear localStorage"
              icon={Trash}
              variant="destructive"
              onClick={() => {
                localStorage.clear()
                toast.success("localStorage cleared")
              }}
            />
            <ActionButton
              label="Clear sessionStorage"
              icon={Trash}
              variant="destructive"
              onClick={() => {
                sessionStorage.clear()
                toast.success("sessionStorage cleared")
              }}
            />
            <ActionButton
              label="Force re-render tree"
              icon={ArrowCounterClockwise}
              onClick={() => {
                window.dispatchEvent(new Event("dev-debug-force-rerender"))
                toast.info("Re-render dispatched")
              }}
            />
          </Section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Floating trigger button ───────────────────────────────────────

export function DevDebugPanel() {
  const debug = useDevDebug()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Global shortcut registration (works even when panel is closed)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault()
        toggleDevPanel()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  if (!mounted) return null

  const hasOverrides =
    debug.simulatedRole !== null ||
    debug.simulatedLoading !== null ||
    debug.simulatedError !== null ||
    debug.simulateEmptyTasks ||
    debug.simulateNoWorkspace ||
    debug.networkState !== "online" ||
    debug.showLayoutOutlines

  return createPortal(
    <>
      <DevDebugPanelContent />
      <motion.button
        onClick={toggleDevPanel}
        className="fixed bottom-3 right-3 z-[99999] flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#1a1a1a] px-2.5 py-1.5 text-[11px] font-medium text-white/60 shadow-lg shadow-black/30 transition-colors hover:border-white/20 hover:text-white/90"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Bug size={14} className={hasOverrides ? "text-yellow-400" : "text-white/40"} />
        {hasOverrides && (
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
        )}
        <span className="font-mono text-[9px] text-white/30">⌃⇧D</span>
      </motion.button>
    </>,
    document.body
  )
}
