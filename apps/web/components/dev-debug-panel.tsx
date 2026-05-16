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
  Plus,
  ListPlus,
  Shuffle,
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
  REQUEST_SOURCES,
  type TaskStatus,
  type TaskPriority,
  type RequestSource,
} from "@/lib/task-board"
import {
  getLocalFirstStoreSnapshot,
  updateWorkspaceTasks,
  type LocalTaskDoc,
} from "@/lib/local-first-store"

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
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wider text-white/50 transition-colors hover:text-white/80"
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
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 transition-all ${colors[color]}`}
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
      <span className="text-[12px] text-white/60">{label}</span>
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
      className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-[12px] font-medium transition-colors ${
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
      <span className="truncate font-mono text-[11px] text-white/40">{name}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        {isColor && (
          <div
            className="h-3 w-3 rounded-sm ring-1 ring-white/10"
            style={{ background: `var(${name})` }}
          />
        )}
        <span className="font-mono text-[11px] text-white/60">{value || "–"}</span>
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

// ─── Select row ───────────────────────────────────────────────────

function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
  renderLabel,
}: {
  label: string
  value: T
  options: readonly T[]
  onChange: (v: T) => void
  renderLabel?: (v: T) => string
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[12px] text-white/60 shrink-0">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="min-w-0 flex-1 rounded bg-white/5 pl-1.5 pr-7 py-0.5 text-[11px] text-white/70 ring-1 ring-white/10 outline-none focus:ring-blue-500/50"
      >
        {options.map((opt) => (
          <option key={opt} value={opt} className="bg-[#1a1a1a] text-white/80">
            {renderLabel ? renderLabel(opt) : opt}
          </option>
        ))}
      </select>
    </div>
  )
}

// ─── Text input row ───────────────────────────────────────────────

function TextInputRow({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[12px] text-white/60 shrink-0">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-white/70 ring-1 ring-white/10 outline-none placeholder:text-white/20 focus:ring-blue-500/50"
      />
    </div>
  )
}

// ─── Mock task helpers ────────────────────────────────────────────

const MOCK_TITLES = [
  "Add dark mode toggle to settings",
  "Fix sidebar collapse animation jitter",
  "Implement CSV export for tasks",
  "API rate limiting returns wrong status code",
  "Refactor notification service",
  "Add drag-and-drop file upload",
  "Mobile nav doesn't close on route change",
  "Upgrade dependencies to latest",
  "Add Stripe webhook retry logic",
  "Performance regression on task list",
  "User avatar upload crops incorrectly",
  "Add keyboard shortcut for quick-add task",
  "Search filter doesn't clear on workspace switch",
  "Add custom label color picker",
  "Integrate Linear two-way sync",
]

const MOCK_AUTHORS = [
  "alex_dev", "sarah.m", "@jcole_ui", "devops-dan", "ux_marie",
  "backend_bob", "@frontend_fey", "qabot", "pm_liz", "cto_mike",
]

const MOCK_ASSIGNEES = [
  { name: "Abdul", avatar: "" },
  { name: "Sarah", avatar: "" },
  { name: "Alex", avatar: "" },
  { name: "Jordan", avatar: "" },
]

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

let devTaskCounter = 9000

function generateMockTask(overrides: Partial<{
  title: string
  status: TaskStatus
  priority: TaskPriority
  labels: string[]
  assigneeName: string
  sourcePlatform: RequestSource | "none"
  description: string
}>): LocalTaskDoc {
  devTaskCounter++
  const store = getLocalFirstStoreSnapshot()
  const workspaceId = store.currentWorkspaceId ?? "dev_workspace"
  const workspace = store.workspaces.find((w) => w._id === workspaceId)
  const prefix = workspace?.prefix ?? "DEV"
  const status = overrides.status ?? randomFrom(TASK_STATUSES)
  const priority = overrides.priority ?? randomFrom(TASK_PRIORITIES)
  const labelPool = (workspace?.labels ?? DEFAULT_WORKSPACE_LABELS).map((l) => l.name)

  const labels = overrides.labels ??
    (Math.random() > 0.4
      ? [randomFrom(labelPool)]
      : [])

  const assignee = overrides.assigneeName
    ? { name: overrides.assigneeName, avatar: "" }
    : status !== "requests" && Math.random() > 0.3
      ? randomFrom(MOCK_ASSIGNEES)
      : undefined

  const sourcePlatform = overrides.sourcePlatform ?? (status === "requests" ? randomFrom(REQUEST_SOURCES) : "none")
  const source = sourcePlatform !== "none"
    ? { platform: sourcePlatform as RequestSource, url: `https://example.com/${sourcePlatform}/${devTaskCounter}`, author: randomFrom(MOCK_AUTHORS) }
    : undefined

  const existingTasks = store.tasksByWorkspace[workspaceId] ?? []
  const maxOrder = existingTasks
    .filter((t) => t.status === status)
    .reduce((max, t) => Math.max(max, t.order), -1)

  return {
    _id: `dev_task_${devTaskCounter}`,
    _creationTime: Date.now(),
    workspaceId: workspaceId as any,
    taskCode: `${prefix}-${devTaskCounter}`,
    taskNumber: devTaskCounter,
    title: overrides.title || randomFrom(MOCK_TITLES),
    description: overrides.description,
    status,
    priority,
    labels,
    order: maxOrder + 1,
    project: "Median V1",
    assignee,
    source,
    createdAtLabel: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date()),
  }
}

function injectTask(task: LocalTaskDoc) {
  const store = getLocalFirstStoreSnapshot()
  const workspaceId = store.currentWorkspaceId
  if (!workspaceId) {
    toast.error("No active workspace — can't inject task")
    return
  }
  updateWorkspaceTasks(workspaceId, (tasks) => [...tasks, task])
  toast.success(`Injected ${task.taskCode}`)
}

function injectBulkTasks(count: number) {
  const store = getLocalFirstStoreSnapshot()
  const workspaceId = store.currentWorkspaceId
  if (!workspaceId) {
    toast.error("No active workspace — can't inject tasks")
    return
  }
  const newTasks: LocalTaskDoc[] = []
  for (let i = 0; i < count; i++) {
    newTasks.push(generateMockTask({}))
  }
  updateWorkspaceTasks(workspaceId, (tasks) => [...tasks, ...newTasks])
  toast.success(`Injected ${count} mock tasks`)
}

function clearDevTasks() {
  const store = getLocalFirstStoreSnapshot()
  const workspaceId = store.currentWorkspaceId
  if (!workspaceId) return
  updateWorkspaceTasks(workspaceId, (tasks) =>
    tasks.filter((t) => !t._id.startsWith("dev_task_"))
  )
  toast.success("Cleared all dev-injected tasks")
}

// ─── Task injector form ───────────────────────────────────────────

function TaskInjectorForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<TaskStatus>("todo")
  const [priority, setPriority] = useState<TaskPriority>("medium")
  const [selectedLabels, setSelectedLabels] = useState<string[]>([])
  const [assignee, setAssignee] = useState("")
  const [sourcePlatform, setSourcePlatform] = useState<RequestSource | "none">("none")

  const store = getLocalFirstStoreSnapshot()
  const workspace = store.workspaces.find((w) => w._id === store.currentWorkspaceId)
  const labelPool = (workspace?.labels ?? DEFAULT_WORKSPACE_LABELS).map((l) => l.name)

  const handleSubmit = () => {
    const task = generateMockTask({
      title: title || undefined,
      description: description || undefined,
      status,
      priority,
      labels: selectedLabels.length > 0 ? selectedLabels : undefined,
      assigneeName: assignee || undefined,
      sourcePlatform,
    })
    injectTask(task)
    // Reset form
    setTitle("")
    setDescription("")
    onClose()
  }

  return (
    <div className="space-y-2">
      <TextInputRow label="Title" value={title} onChange={setTitle} placeholder="Random if empty" />
      <TextInputRow label="Description" value={description} onChange={setDescription} placeholder="Optional" />
      <SelectRow
        label="Status"
        value={status}
        options={TASK_STATUSES}
        onChange={setStatus}
        renderLabel={(s) => TASK_STATUS_LABELS[s]}
      />
      <SelectRow
        label="Priority"
        value={priority}
        options={TASK_PRIORITIES}
        onChange={setPriority}
      />
      <SelectRow
        label="Source"
        value={sourcePlatform}
        options={["none", ...REQUEST_SOURCES] as const}
        onChange={(v) => setSourcePlatform(v as RequestSource | "none")}
      />
      <TextInputRow label="Assignee" value={assignee} onChange={setAssignee} placeholder="Name or empty" />

      {/* Labels multi-select */}
      <div className="space-y-1">
        <span className="text-[12px] text-white/60">Labels</span>
        <div className="flex flex-wrap gap-1">
          {labelPool.map((label) => {
            const active = selectedLabels.includes(label)
            return (
              <Pill
                key={label}
                label={label}
                active={active}
                onClick={() =>
                  setSelectedLabels(
                    active
                      ? selectedLabels.filter((l) => l !== label)
                      : [...selectedLabels, label]
                  )
                }
                color="purple"
              />
            )
          })}
        </div>
      </div>

      <div className="flex gap-1 pt-1">
        <button
          onClick={handleSubmit}
          className="flex flex-1 items-center justify-center gap-1 rounded bg-blue-500/20 px-2 py-1 text-[12px] font-medium text-blue-300 ring-1 ring-blue-500/30 transition-colors hover:bg-blue-500/30"
        >
          <Plus size={12} />
          Add Task
        </button>
        <button
          onClick={onClose}
          className="rounded bg-white/5 px-2 py-1 text-[12px] text-white/40 ring-1 ring-white/10 transition-colors hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </div>
  )
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
              <span className="text-[13px] font-semibold text-white/90">Dev Debug</span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/30">
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
            <p className="text-[11px] text-white/30">
              Resolved: {resolvedTheme} · Hotkey: <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-[10px]">D</kbd>
            </p>
          </Section>

          {/* ── Auth & Roles ────────────────────── */}
          <Section title="Auth & Roles" icon={ShieldCheck} id="roles" expandedSection={debug.expandedSection} onToggle={toggleSection}>
            <p className="text-[11px] text-white/30 mb-1">Simulate permission level</p>
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

          {/* ── Task Injector ──────────────────── */}
          <Section title="Task Injector" icon={ListPlus} id="tasks" expandedSection={debug.expandedSection} onToggle={toggleSection}>
            <TaskInjectorForm onClose={() => toggleSection("tasks")} />

            <div className="border-t border-white/10 pt-2 mt-2 space-y-1">
              <p className="text-[11px] text-white/30 mb-1">Quick inject</p>
              <div className="grid grid-cols-2 gap-1">
                <ActionButton label="Random task" icon={Shuffle} onClick={() => injectTask(generateMockTask({}))} />
                <ActionButton label="+5 random" icon={Shuffle} onClick={() => injectBulkTasks(5)} />
                <ActionButton label="+10 random" icon={Shuffle} onClick={() => injectBulkTasks(10)} />
                <ActionButton label="+25 random" icon={Shuffle} onClick={() => injectBulkTasks(25)} />
              </div>

              <p className="text-[11px] text-white/30 mt-2 mb-1">By status (1 each)</p>
              <div className="flex flex-wrap gap-1">
                {TASK_STATUSES.map((s) => (
                  <Pill
                    key={s}
                    label={TASK_STATUS_LABELS[s]}
                    active={false}
                    onClick={() => injectTask(generateMockTask({ status: s }))}
                    color="blue"
                  />
                ))}
              </div>

              <p className="text-[11px] text-white/30 mt-2 mb-1">By priority (1 each)</p>
              <div className="flex flex-wrap gap-1">
                {TASK_PRIORITIES.map((p) => (
                  <Pill
                    key={p}
                    label={p}
                    active={false}
                    onClick={() => injectTask(generateMockTask({ priority: p }))}
                    color={p === "urgent" ? "red" : p === "high" ? "yellow" : "neutral"}
                  />
                ))}
              </div>

              <p className="text-[11px] text-white/30 mt-2 mb-1">By source (1 each)</p>
              <div className="flex flex-wrap gap-1">
                {REQUEST_SOURCES.map((src) => (
                  <Pill
                    key={src}
                    label={src}
                    active={false}
                    onClick={() => injectTask(generateMockTask({ status: "requests", sourcePlatform: src }))}
                    color="green"
                  />
                ))}
              </div>

              <p className="text-[11px] text-white/30 mt-2 mb-1">Presets</p>
              <div className="grid grid-cols-1 gap-1">
                <ActionButton label="Full board (all columns)" icon={ListPlus} onClick={() => {
                  const store = getLocalFirstStoreSnapshot()
                  const wId = store.currentWorkspaceId
                  if (!wId) { toast.error("No active workspace"); return }
                  const tasks: LocalTaskDoc[] = []
                  for (const s of TASK_STATUSES) {
                    const count = s === "requests" ? 3 : s === "archive" ? 1 : 2
                    for (let i = 0; i < count; i++) {
                      tasks.push(generateMockTask({ status: s }))
                    }
                  }
                  updateWorkspaceTasks(wId, (existing) => [...existing, ...tasks])
                  toast.success(`Injected ${tasks.length} tasks across all columns`)
                }} />
                <ActionButton label="Agent/CLI batch (5 tasks)" icon={ListPlus} onClick={() => {
                  const store = getLocalFirstStoreSnapshot()
                  const wId = store.currentWorkspaceId
                  if (!wId) { toast.error("No active workspace"); return }
                  const agentTasks: LocalTaskDoc[] = [
                    generateMockTask({ title: "Refactor auth middleware", status: "todo", priority: "high", labels: ["improvement"], sourcePlatform: "cli" }),
                    generateMockTask({ title: "Fix rate limiter edge case", status: "in_progress", priority: "urgent", labels: ["bug"], sourcePlatform: "cli" }),
                    generateMockTask({ title: "Add pagination to API", status: "todo", priority: "medium", labels: ["feature"], sourcePlatform: "cli" }),
                    generateMockTask({ title: "Update deps & audit", status: "ready", priority: "low", labels: ["improvement"], sourcePlatform: "cli" }),
                    generateMockTask({ title: "Write integration tests", status: "in_progress", priority: "medium", labels: ["improvement"], sourcePlatform: "cli" }),
                  ]
                  updateWorkspaceTasks(wId, (existing) => [...existing, ...agentTasks])
                  toast.success("Injected 5 CLI/agent tasks")
                }} />
                <ActionButton label="Mixed feedback inbox" icon={ListPlus} onClick={() => {
                  const store = getLocalFirstStoreSnapshot()
                  const wId = store.currentWorkspaceId
                  if (!wId) { toast.error("No active workspace"); return }
                  const sources: RequestSource[] = ["discord", "x", "github", "slack", "linear"]
                  const feedbackTasks: LocalTaskDoc[] = sources.map((src) =>
                    generateMockTask({ status: "requests", sourcePlatform: src })
                  )
                  updateWorkspaceTasks(wId, (existing) => [...existing, ...feedbackTasks])
                  toast.success("Injected 5 feedback requests from mixed sources")
                }} />
                <ActionButton label="Overloaded column (20 in Todo)" icon={ListPlus} onClick={() => {
                  const store = getLocalFirstStoreSnapshot()
                  const wId = store.currentWorkspaceId
                  if (!wId) { toast.error("No active workspace"); return }
                  const tasks: LocalTaskDoc[] = []
                  for (let i = 0; i < 20; i++) {
                    tasks.push(generateMockTask({ status: "todo" }))
                  }
                  updateWorkspaceTasks(wId, (existing) => [...existing, ...tasks])
                  toast.success("Injected 20 tasks into Todo")
                }} />
              </div>

              <div className="pt-2">
                <ActionButton
                  label="Clear all dev tasks"
                  icon={Trash}
                  variant="destructive"
                  onClick={clearDevTasks}
                />
              </div>
            </div>
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
            <p className="text-[11px] text-white/30">
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
                  className="rounded bg-white/5 px-1 py-0.5 text-center font-mono text-[10px] text-white/40 ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white/60"
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
        className="fixed bottom-3 right-3 z-[99999] flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#1a1a1a] px-2.5 py-1.5 text-[12px] font-medium text-white/60 shadow-lg shadow-black/30 transition-colors hover:border-white/20 hover:text-white/90"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Bug size={14} className={hasOverrides ? "text-yellow-400" : "text-white/40"} />
        {hasOverrides && (
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
        )}
        <span className="font-mono text-[10px] text-white/30">⌃⇧D</span>
      </motion.button>
    </>,
    document.body
  )
}
