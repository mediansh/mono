"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { usePathname, useRouter } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Search01Icon,
  Home01Icon,
  Settings01Icon,
  Tag01Icon,
  UserMultiple02Icon,
  Loading03Icon,
  CircleIcon,
  CheckmarkBadge01Icon,
  Rocket01Icon,
  Archive01Icon,
  AlertCircleIcon,
  SignalFull02Icon,
  SignalMedium02Icon,
  SignalLow02Icon,
  ArrowRight01Icon,
  ConnectIcon,
} from "@hugeicons/core-free-icons"
import { motion, AnimatePresence } from "motion/react"
import { useWorkspace } from "@/components/workspace-provider"
import { useLocalFirstStore } from "@/lib/local-first-store"
import {
  TASK_STATUS_LABELS,
  formatTaskDate,
  type TaskStatus,
  type TaskPriority,
} from "@/lib/task-board"
import { cn } from "@workspace/ui/lib/utils"

// ── Event bridge for opening tasks from search ──

export function dispatchOpenTask(taskId: string) {
  window.dispatchEvent(new CustomEvent("search-palette:open-task", { detail: { taskId } }))
}

export function useSearchPaletteTaskEvent(handler: (taskId: string) => void) {
  useEffect(() => {
    const listener = (e: Event) => {
      const taskId = (e as CustomEvent).detail?.taskId
      if (taskId) handler(taskId)
    }
    window.addEventListener("search-palette:open-task", listener)
    return () => window.removeEventListener("search-palette:open-task", listener)
  }, [handler])
}

// ── Status & priority icons (compact versions for search results) ──

function getStatusIcon(status: TaskStatus, size = 13) {
  switch (status) {
    case "requests":
      return <HugeiconsIcon icon={Loading03Icon} size={size} className="text-muted-foreground" />
    case "todo":
      return <HugeiconsIcon icon={CircleIcon} size={size} className="text-muted-foreground" />
    case "in_progress":
      return <HugeiconsIcon icon={Loading03Icon} size={size} className="text-yellow-500" />
    case "ready":
      return <HugeiconsIcon icon={CheckmarkBadge01Icon} size={size} className="text-emerald-500" />
    case "shipped":
      return <HugeiconsIcon icon={Rocket01Icon} size={size} className="text-blue-500" />
    case "archive":
      return <HugeiconsIcon icon={Archive01Icon} size={size} className="text-muted-foreground" />
  }
}

function getPriorityIcon(priority: TaskPriority, size = 12) {
  switch (priority) {
    case "urgent":
      return <HugeiconsIcon icon={AlertCircleIcon} size={size} className="text-red-500" />
    case "high":
      return <HugeiconsIcon icon={SignalFull02Icon} size={size} className="text-orange-500" />
    case "medium":
      return <HugeiconsIcon icon={SignalMedium02Icon} size={size} className="text-yellow-500" />
    case "low":
      return <HugeiconsIcon icon={SignalLow02Icon} size={size} className="text-blue-400" />
    case "none":
      return <HugeiconsIcon icon={SignalLow02Icon} size={size} className="text-muted-foreground" />
  }
}

// ── Navigation items ──

const NAV_ITEMS = [
  { id: "home", label: "Home", href: "/app", icon: Home01Icon, keywords: ["board", "kanban", "tasks", "home"] },
  { id: "settings", label: "Settings", href: "/app/settings", icon: Settings01Icon, keywords: ["settings", "preferences", "account"] },
  { id: "labels", label: "Labels", href: "/app/settings/labels", icon: Tag01Icon, keywords: ["labels", "tags", "categories"] },
  { id: "members", label: "Members", href: "/app/settings/members", icon: UserMultiple02Icon, keywords: ["members", "team", "users", "invite"] },
  { id: "integrations-discord", label: "Discord Integration", href: "/app/integrations/discord", icon: ConnectIcon, keywords: ["integrations", "discord", "connect", "bot"] },
  { id: "integrations-linear", label: "Linear Integration", href: "/app/integrations/linear", icon: ConnectIcon, keywords: ["integrations", "linear", "sync", "issues"] },
  { id: "integrations-x", label: "X (Twitter) Integration", href: "/app/integrations/x", icon: ConnectIcon, keywords: ["integrations", "x", "twitter", "tweets", "mentions"] },
  { id: "integrations-github", label: "GitHub Integration", href: "/app/integrations/github", icon: ConnectIcon, keywords: ["integrations", "github", "repository", "issues", "pr", "pull request"] },
]

// ── Search result types ──

type TaskResult = {
  type: "task"
  id: string
  taskCode: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  labels: string[]
  createdAt: string
}

type NavResult = {
  type: "nav"
  id: string
  label: string
  href: string
  icon: typeof Home01Icon
  keywords: string[]
}

type SearchResult = TaskResult | NavResult

// ── Main component ──

export function SearchPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { currentWorkspace } = useWorkspace()
  const { tasksByWorkspace } = useLocalFirstStore()
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const workspaceId = currentWorkspace?._id
  const taskDocs = workspaceId ? tasksByWorkspace[workspaceId] : undefined

  // Build search results
  const results = useMemo(() => {
    const q = query.toLowerCase().trim()
    const items: SearchResult[] = []

    // Navigation results
    const navResults = NAV_ITEMS.filter((item) => {
      if (!q) return true
      return (
        item.label.toLowerCase().includes(q) ||
        item.keywords.some((kw) => kw.includes(q))
      )
    }).map((item): NavResult => ({ type: "nav", ...item }))

    // Task results
    const taskResults: TaskResult[] = []
    if (taskDocs) {
      const docs = q
        ? taskDocs.filter((doc) => {
            const title = doc.title.toLowerCase()
            const code = doc.taskCode.toLowerCase()
            const labels = (doc.labels ?? []).join(" ").toLowerCase()
            const status = TASK_STATUS_LABELS[doc.status]?.toLowerCase() ?? ""
            return (
              title.includes(q) ||
              code.includes(q) ||
              labels.includes(q) ||
              status.includes(q)
            )
          })
        : // When no query, show recent tasks (by creation time, limited)
          [...taskDocs].sort((a, b) => b._creationTime - a._creationTime).slice(0, 8)

      for (const doc of docs.slice(0, 20)) {
        taskResults.push({
          type: "task",
          id: doc._id,
          taskCode: doc.taskCode,
          title: doc.title,
          status: doc.status,
          priority: doc.priority,
          labels: doc.labels ?? [],
          createdAt: formatTaskDate(doc._creationTime, doc.createdAtLabel),
        })
      }
    }

    // If there's a query, show tasks first then nav
    if (q) {
      items.push(...taskResults, ...navResults)
    } else {
      items.push(...navResults, ...taskResults)
    }

    return items
  }, [query, taskDocs])

  // Group results for section headers
  const groupedResults = useMemo(() => {
    const navItems = results.filter((r): r is NavResult => r.type === "nav")
    const taskItems = results.filter((r): r is TaskResult => r.type === "task")

    const sections: { label: string; items: SearchResult[] }[] = []

    if (query.trim()) {
      // When searching, show tasks first
      if (taskItems.length > 0) sections.push({ label: "Tasks", items: taskItems })
      if (navItems.length > 0) sections.push({ label: "Navigation", items: navItems })
    } else {
      // When no query, show nav first
      if (navItems.length > 0) sections.push({ label: "Navigation", items: navItems })
      if (taskItems.length > 0) sections.push({ label: "Recent tasks", items: taskItems })
    }

    return sections
  }, [results, query])

  // Reset state when opening/closing
  useEffect(() => {
    if (open) {
      setQuery("")
      setActiveIndex(0)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [open])

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0)
  }, [results.length])

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return
    const activeEl = listRef.current.querySelector(`[data-index="${activeIndex}"]`)
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" })
    }
  }, [activeIndex])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onOpenChange(false)
      }
    }
    // Delay to avoid catching the click that opened it
    const id = setTimeout(() => {
      document.addEventListener("mousedown", handleClick)
    }, 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener("mousedown", handleClick)
    }
  }, [open, onOpenChange])

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onOpenChange(false)
      if (result.type === "nav") {
        router.push(result.href)
      } else if (pathname === "/app") {
        // Already on the board — just open the task modal
        dispatchOpenTask(result.id)
      } else {
        // Navigate to the board first, then open the task once it mounts
        router.push("/app")
        const taskId = result.id
        const onRouteReady = () => {
          dispatchOpenTask(taskId)
          window.removeEventListener("search-palette:board-ready", onRouteReady)
        }
        window.addEventListener("search-palette:board-ready", onRouteReady)
      }
    },
    [onOpenChange, router, pathname]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault()
          setActiveIndex((prev) => (prev + 1) % results.length)
          break
        }
        case "ArrowUp": {
          e.preventDefault()
          setActiveIndex((prev) => (prev - 1 + results.length) % results.length)
          break
        }
        case "Enter": {
          e.preventDefault()
          const result = results[activeIndex]
          if (result) handleSelect(result)
          break
        }
        case "Escape": {
          e.preventDefault()
          onOpenChange(false)
          break
        }
      }
    },
    [results, activeIndex, handleSelect, onOpenChange]
  )

  if (!open) return null

  // Global index tracker for flat rendering
  let flatIndex = 0

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/25 supports-backdrop-filter:backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="fixed top-[min(20%,180px)] left-1/2 z-50 w-[calc(100%-2rem)] max-w-[540px] -translate-x-1/2 overflow-hidden rounded-xl border border-border/60 bg-background shadow-2xl ring-1 ring-foreground/[0.03] dark:bg-card"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-border px-4">
              <HugeiconsIcon
                icon={Search01Icon}
                size={16}
                strokeWidth={2}
                className="shrink-0 text-muted-foreground"
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search tasks, navigate..."
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Results */}
            <div
              ref={listRef}
              className="max-h-[min(60vh,400px)] overflow-y-auto overscroll-contain p-1.5"
            >
              {results.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">No results found</p>
                  <p className="mt-1 text-xs text-muted-foreground/60">
                    Try a different search term
                  </p>
                </div>
              ) : (
                groupedResults.map((section) => {
                  const sectionEl = (
                    <div key={section.label} className="mb-1 last:mb-0">
                      <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-muted-foreground/60">
                        {section.label}
                      </div>
                      {section.items.map((result) => {
                        const idx = flatIndex++
                        if (result.type === "nav") {
                          return (
                            <NavResultRow
                              key={result.id}
                              result={result}
                              isActive={idx === activeIndex}
                              dataIndex={idx}
                              onSelect={() => handleSelect(result)}
                              onHover={() => setActiveIndex(idx)}
                            />
                          )
                        }
                        return (
                          <TaskResultRow
                            key={result.id}
                            result={result}
                            isActive={idx === activeIndex}
                            dataIndex={idx}
                            onSelect={() => handleSelect(result)}
                            onHover={() => setActiveIndex(idx)}
                          />
                        )
                      })}
                    </div>
                  )
                  return sectionEl
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 border-t border-border px-4 py-2">
              <div className="flex items-center gap-1.5">
                <kbd className="flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                  ↑
                </kbd>
                <kbd className="flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                  ↓
                </kbd>
                <span className="text-[11px] text-muted-foreground/60">navigate</span>
              </div>
              <div className="flex items-center gap-1.5">
                <kbd className="flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                  ↵
                </kbd>
                <span className="text-[11px] text-muted-foreground/60">open</span>
              </div>
              <div className="flex items-center gap-1.5">
                <kbd className="flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                  esc
                </kbd>
                <span className="text-[11px] text-muted-foreground/60">close</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

// ── Result row components ──

function NavResultRow({
  result,
  isActive,
  dataIndex,
  onSelect,
  onHover,
}: {
  result: NavResult
  isActive: boolean
  dataIndex: number
  onSelect: () => void
  onHover: () => void
}) {
  return (
    <button
      data-index={dataIndex}
      onClick={onSelect}
      onMouseMove={onHover}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
        isActive ? "bg-accent text-foreground" : "text-foreground/80 hover:bg-accent/50"
      )}
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/80">
        <HugeiconsIcon icon={result.icon} size={14} strokeWidth={2} className="text-muted-foreground" />
      </div>
      <span className="flex-1 truncate text-[13px] font-medium">{result.label}</span>
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        size={13}
        className={cn(
          "shrink-0 transition-opacity",
          isActive ? "text-muted-foreground opacity-100" : "opacity-0"
        )}
      />
    </button>
  )
}

function TaskResultRow({
  result,
  isActive,
  dataIndex,
  onSelect,
  onHover,
}: {
  result: TaskResult
  isActive: boolean
  dataIndex: number
  onSelect: () => void
  onHover: () => void
}) {
  return (
    <button
      data-index={dataIndex}
      onClick={onSelect}
      onMouseMove={onHover}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
        isActive ? "bg-accent text-foreground" : "text-foreground/80 hover:bg-accent/50"
      )}
    >
      <div className="shrink-0">{getPriorityIcon(result.priority)}</div>
      <div className="shrink-0">{getStatusIcon(result.status)}</div>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground/50">
        {result.taskCode}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{result.title}</span>
      {result.labels.length > 0 && (
        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          {result.labels.slice(0, 2).map((label) => (
            <span
              key={label}
              className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium capitalize text-muted-foreground"
            >
              {label}
            </span>
          ))}
        </div>
      )}
      <span className="shrink-0 text-[10px] text-muted-foreground/40">{result.createdAt}</span>
    </button>
  )
}
