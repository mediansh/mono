"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import {
  MagnifyingGlass,
  House,
  Gear,
  Tag,
  UserCircle,
  Users,
  SpinnerGap,
  Circle,
  SealCheck,
  Rocket,
  Archive,
  ListBullets,
  WarningCircle,
  CellSignalFull,
  CellSignalMedium,
  CellSignalLow,
  ArrowRight,
  Plugs,
} from "@phosphor-icons/react"
import { useWorkspace } from "@/components/workspace-provider"
import { useLocalFirstStore } from "@/lib/local-first-store"
import {
  getTaskSortTimestamp,
  sortTasksByStatusAndRecency,
  TASK_STATUS_LABELS,
  formatTaskDate,
  type TaskStatus,
  type TaskPriority,
} from "@/lib/task-board"
import { cn } from "@workspace/ui/lib/utils"
import { useInstantNavigation } from "@/hooks/use-instant-navigation"

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
      return <SpinnerGap size={size} className="text-muted-foreground" />
    case "backlog":
      return <ListBullets size={size} className="text-muted-foreground" />
    case "todo":
      return <Circle size={size} className="text-muted-foreground" />
    case "in_progress":
      return <SpinnerGap size={size} className="text-yellow-500" />
    case "ready":
      return <SealCheck size={size} weight="fill" className="text-emerald-500" />
    case "shipped":
      return <Rocket size={size} weight="fill" className="text-blue-500" />
    case "archive":
      return <Archive size={size} className="text-muted-foreground" />
  }
}

function getPriorityIcon(priority: TaskPriority, size = 12) {
  switch (priority) {
    case "urgent":
      return <WarningCircle size={size} weight="fill" className="text-red-500" />
    case "high":
      return <CellSignalFull size={size} className="text-orange-500" />
    case "medium":
      return <CellSignalMedium size={size} className="text-yellow-500" />
    case "low":
      return <CellSignalLow size={size} className="text-blue-400" />
    case "none":
      return <CellSignalLow size={size} className="text-muted-foreground" />
  }
}

// ── Navigation items ──

const NAV_ITEMS = [
  { id: "home", label: "Home", href: "/app", icon: House, keywords: ["board", "kanban", "tasks", "home"] },
  { id: "settings", label: "Settings", href: "/app/settings", icon: Gear, keywords: ["settings", "preferences", "account"] },
  { id: "labels", label: "Labels", href: "/app/settings/labels", icon: Tag, keywords: ["labels", "tags", "categories"] },
  { id: "assignees", label: "Assignees", href: "/app/settings/assignees", icon: UserCircle, keywords: ["assignees", "owners", "responsible", "avatars"] },
  { id: "members", label: "Members", href: "/app/settings/members", icon: Users, keywords: ["members", "team", "users", "invite"] },
  { id: "integrations-discord", label: "Discord Integration", href: "/app/integrations/discord", icon: Plugs, keywords: ["integrations", "discord", "connect", "bot"] },
  { id: "integrations-linear", label: "Linear Integration", href: "/app/integrations/linear", icon: Plugs, keywords: ["integrations", "linear", "sync", "issues"] },
  { id: "integrations-x", label: "X (Twitter) Integration", href: "/app/integrations/x", icon: Plugs, keywords: ["integrations", "x", "twitter", "tweets", "mentions"] },
  { id: "integrations-github", label: "GitHub Integration", href: "/app/integrations/github", icon: Plugs, keywords: ["integrations", "github", "repository", "issues", "pr", "pull request"] },
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
  icon: typeof House
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
  const { navigate, prefetch } = useInstantNavigation()
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
          sortTasksByStatusAndRecency(taskDocs)
            .sort((a, b) => getTaskSortTimestamp(b) - getTaskSortTimestamp(a))
            .slice(0, 8)

      for (const doc of docs.slice(0, 20)) {
        taskResults.push({
          type: "task",
          id: doc._id,
          taskCode: doc.taskCode,
          title: doc.title,
          status: doc.status,
          priority: doc.priority,
          labels: doc.labels ?? [],
          createdAt: formatTaskDate(
            getTaskSortTimestamp(doc),
            doc.createdAtLabel
          ),
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
        navigate(result.href)
      } else if (pathname === "/app") {
        // Already on the board — just open the task modal
        dispatchOpenTask(result.id)
      } else {
        // Navigate to the board first, then open the task once it mounts
        navigate("/app")
        const taskId = result.id
        const onRouteReady = () => {
          dispatchOpenTask(taskId)
          window.removeEventListener("search-palette:board-ready", onRouteReady)
        }
        window.addEventListener("search-palette:board-ready", onRouteReady)
      }
    },
    [navigate, onOpenChange, pathname]
  )

  useEffect(() => {
    for (const item of NAV_ITEMS) {
      if (item.href !== pathname) {
        prefetch(item.href)
      }
    }
  }, [pathname, prefetch])

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

  // Global index tracker for flat rendering
  let flatIndex = 0

  if (typeof document === "undefined") return null

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
            className="fixed inset-0 z-50 bg-black/40"
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed top-[min(20%,180px)] left-1/2 z-50 w-[calc(100%-2rem)] max-w-[540px] -translate-x-1/2 overflow-hidden rounded-[4px] bg-background shadow-2xl ring-1 ring-border"
          >
            {/* Search input */}
            <div className="flex items-center gap-2.5 border-b border-border px-3">
              <MagnifyingGlass
                size={14}
                className="shrink-0 text-muted-foreground"
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search tasks, navigate..."
                className="h-9 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Results */}
            <div
              ref={listRef}
              className="max-h-[min(50vh,320px)] overflow-y-auto overscroll-contain p-1"
            >
              {results.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-[13px] text-muted-foreground">No results found</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/60">
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
            <div className="hidden items-center gap-3 border-t border-border px-3 py-1.5 sm:flex">
              <div className="flex items-center gap-1.5">
                <kbd className="flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                  ↑
                </kbd>
                <kbd className="flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                  ↓
                </kbd>
                <span className="text-[11px] text-muted-foreground/60">navigate</span>
              </div>
              <div className="flex items-center gap-1.5">
                <kbd className="flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                  ↵
                </kbd>
                <span className="text-[11px] text-muted-foreground/60">open</span>
              </div>
              <div className="flex items-center gap-1.5">
                <kbd className="flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
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
        "flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left transition-colors",
        isActive ? "bg-accent text-foreground" : "text-foreground/80 hover:bg-accent/50"
      )}
    >
      <div className="flex size-6 shrink-0 items-center justify-center rounded-[4px] bg-muted/80">
        <result.icon size={13} className="text-muted-foreground" />
      </div>
      <span className="flex-1 truncate text-[12px] font-medium">{result.label}</span>
      <ArrowRight
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
        "flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left transition-colors",
        isActive ? "bg-accent text-foreground" : "text-foreground/80 hover:bg-accent/50"
      )}
    >
      <div className="shrink-0">{getPriorityIcon(result.priority)}</div>
      <div className="shrink-0">{getStatusIcon(result.status)}</div>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground/50">
        {result.taskCode}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{result.title}</span>
      {result.labels.length > 0 && (
        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          {result.labels.slice(0, 2).map((label) => (
            <span
              key={label}
              className="rounded-[4px] bg-muted px-1.5 py-0.5 text-[9px] font-medium capitalize text-muted-foreground"
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
