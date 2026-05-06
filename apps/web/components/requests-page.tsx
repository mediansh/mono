"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { useQuery } from "convex/react"
import {
  MagnifyingGlass,
  CheckCircle,
  XCircle,
  Tray,
  ArrowLeft,
  Link as LinkIcon,
  X,
  FunnelSimple,
  Check,
  DotsSixVertical,
  ArrowsDownUp,
} from "@phosphor-icons/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { api } from "@/convex/_generated/api"
import type { Doc } from "@/convex/_generated/dataModel"
import { useWorkspace } from "@/components/workspace-provider"
import {
  DiscordIcon,
  SlackIcon,
  LinearIcon,
  XIcon,
  GitHubIcon,
  CliIcon,
} from "@/components/brand-icons"
import { useRequestActions } from "@/hooks/use-request-actions"
import { getTaskSources, SOURCE_CONFIG } from "@/lib/task-sources"
import {
  REQUEST_SOURCES,
  formatTaskDate,
  type RequestSource,
  type TaskPriority,
  type TaskSource,
} from "@/lib/task-board"

type RequestTask = Doc<"tasks">

const SOURCE_ICON: Record<RequestSource, ComponentType<{ size?: number }>> = {
  discord: DiscordIcon,
  slack: SlackIcon,
  linear: LinearIcon,
  x: XIcon,
  github: GitHubIcon,
  cli: CliIcon,
}

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
}

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  urgent: "text-red-500",
  high: "text-orange-500",
  medium: "text-yellow-600",
  low: "text-blue-500",
  none: "text-muted-foreground",
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
}

type SortKey = "newest" | "oldest" | "priority" | "title"

const SORT_LABEL: Record<SortKey, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  priority: "Priority",
  title: "Title (A–Z)",
}

const LIST_PANE_WIDTH_KEY = "requests:listPaneWidth"
const LIST_PANE_MIN = 260
const LIST_PANE_MAX = 560
const LIST_PANE_DEFAULT = 360

function clampListPaneWidth(value: number) {
  return Math.min(LIST_PANE_MAX, Math.max(LIST_PANE_MIN, value))
}

// github and x render as monochrome marks — let them inherit the foreground
// color so they remain visible in both light and dark mode.
const THEME_FOLLOWING_SOURCES = new Set<RequestSource>(["github", "x"])

function SourceGlyph({ platform, size = 14 }: { platform: RequestSource; size?: number }) {
  const Icon = SOURCE_ICON[platform]
  const cfg = SOURCE_CONFIG[platform]
  if (THEME_FOLLOWING_SOURCES.has(platform)) {
    return (
      <span className="text-foreground inline-flex">
        <Icon size={size} />
      </span>
    )
  }
  return (
    <span style={{ color: cfg.color, display: "inline-flex" }}>
      <Icon size={size} />
    </span>
  )
}

export function RequestsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentWorkspace } = useWorkspace()
  const workspaceId = currentWorkspace?._id

  const liveTasks = useQuery(
    api.tasks.listByWorkspace,
    workspaceId ? { workspaceId } : "skip"
  )

  const requests = useMemo<RequestTask[]>(() => {
    if (!liveTasks) return []
    return liveTasks
      .filter((task) => task.status === "requests")
      .sort((a, b) => a.order - b.order)
  }, [liveTasks])

  const { canManageTasks, acceptRequest, denyRequest, acceptMany, denyMany } =
    useRequestActions()

  // ── list pane width (resizable, persisted) ─────────
  // Default during SSR. After mount, hydrate from localStorage once.
  const [listPaneWidth, setListPaneWidth] = useState<number>(LIST_PANE_DEFAULT)
  const [isResizingList, setIsResizingList] = useState(false)

  useEffect(() => {
    const stored = window.localStorage.getItem(LIST_PANE_WIDTH_KEY)
    if (!stored) return
    const parsed = Number.parseInt(stored, 10)
    if (Number.isFinite(parsed)) {
      setListPaneWidth(clampListPaneWidth(parsed))
    }
  }, [])

  const handleListResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = listPaneWidth
      setIsResizingList(true)

      const previousUserSelect = document.body.style.userSelect
      const previousCursor = document.body.style.cursor
      document.body.style.userSelect = "none"
      document.body.style.cursor = "col-resize"

      let latestWidth = startWidth

      function onMove(ev: PointerEvent) {
        const dx = ev.clientX - startX
        latestWidth = clampListPaneWidth(startWidth + dx)
        setListPaneWidth(latestWidth)
      }

      function onUp() {
        setIsResizingList(false)
        document.body.style.userSelect = previousUserSelect
        document.body.style.cursor = previousCursor
        // Persist final width after the user lets go — keeps the write off
        // the SSR/hydration path so it can't clobber a stored value.
        window.localStorage.setItem(LIST_PANE_WIDTH_KEY, String(latestWidth))
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
      }

      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    },
    [listPaneWidth]
  )

  // ── filter / search / sort state ───────────────────
  const [searchTerm, setSearchTerm] = useState("")
  const [activeSources, setActiveSources] = useState<Set<RequestSource>>(
    () => new Set()
  )
  const [sortKey, setSortKey] = useState<SortKey>("newest")
  const searchInputRef = useRef<HTMLInputElement>(null)

  const filteredRequests = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    const filtered = requests.filter((task) => {
      const sources = getTaskSources(task)

      if (activeSources.size > 0) {
        const matchesSource = sources.some((src) => activeSources.has(src.platform))
        if (!matchesSource) return false
      }

      if (term.length === 0) return true
      if (task.title.toLowerCase().includes(term)) return true
      if (sources.some((src) => src.author.toLowerCase().includes(term))) return true
      return false
    })

    const sorted = [...filtered]
    switch (sortKey) {
      case "newest":
        sorted.sort((a, b) => b._creationTime - a._creationTime)
        break
      case "oldest":
        sorted.sort((a, b) => a._creationTime - b._creationTime)
        break
      case "priority":
        sorted.sort(
          (a, b) =>
            PRIORITY_RANK[a.priority as TaskPriority] -
            PRIORITY_RANK[b.priority as TaskPriority]
        )
        break
      case "title":
        sorted.sort((a, b) => a.title.localeCompare(b.title))
        break
    }
    return sorted
  }, [requests, searchTerm, activeSources, sortKey])

  // ── selection (URL param) ──────────────────────────
  const selectedIdParam = searchParams.get("id")
  const userPickedId = useMemo(() => {
    if (selectedIdParam && filteredRequests.some((r) => r._id === selectedIdParam)) {
      return selectedIdParam
    }
    return null
  }, [selectedIdParam, filteredRequests])

  // For desktop split-view, fall back to first request so the detail pane
  // is never empty when there are requests to show. On mobile we use
  // `userPickedId` directly for visibility — see the JSX below.
  const selectedId = userPickedId ?? filteredRequests[0]?._id ?? null

  const setSelectedId = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (id) {
        params.set("id", id)
      } else {
        params.delete("id")
      }
      const query = params.toString()
      router.replace(query ? `/app/requests?${query}` : "/app/requests", {
        scroll: false,
      })
    },
    [router, searchParams]
  )

  const selectedTask = useMemo(
    () => filteredRequests.find((r) => r._id === selectedId) ?? null,
    [filteredRequests, selectedId]
  )

  // ── bulk selection ─────────────────────────────────
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(
    () => new Set()
  )

  // Drop bulk-selected ids that are no longer in the request list
  useEffect(() => {
    if (bulkSelectedIds.size === 0) return
    const live = new Set<string>(requests.map((r) => r._id as string))
    setBulkSelectedIds((prev) => {
      const next = new Set<string>()
      for (const id of prev) if (live.has(id)) next.add(id)
      return next.size === prev.size ? prev : next
    })
  }, [requests]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleBulkSelected = useCallback((id: string) => {
    setBulkSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearBulkSelection = useCallback(() => {
    setBulkSelectedIds(new Set())
  }, [])

  // ── action handlers (with auto-advance) ────────────
  const advanceToNext = useCallback(
    (currentId: string) => {
      const idx = filteredRequests.findIndex((r) => r._id === currentId)
      if (idx === -1) return
      const next = filteredRequests[idx + 1] ?? filteredRequests[idx - 1] ?? null
      setSelectedId(next?._id ?? null)
    },
    [filteredRequests, setSelectedId]
  )

  const handleAccept = useCallback(
    (task: RequestTask) => {
      if (!canManageTasks) return
      advanceToNext(task._id)
      acceptRequest({ id: task._id, title: task.title })
    },
    [canManageTasks, acceptRequest, advanceToNext]
  )

  const handleDeny = useCallback(
    (task: RequestTask) => {
      if (!canManageTasks) return
      advanceToNext(task._id)
      denyRequest({ id: task._id, title: task.title })
    },
    [canManageTasks, denyRequest, advanceToNext]
  )

  const handleAcceptBulk = useCallback(() => {
    if (!canManageTasks || bulkSelectedIds.size === 0) return
    const tasks = requests
      .filter((r) => bulkSelectedIds.has(r._id))
      .map((r) => ({ id: r._id, title: r.title }))
    clearBulkSelection()
    acceptMany(tasks)
  }, [canManageTasks, bulkSelectedIds, requests, acceptMany, clearBulkSelection])

  const handleDenyBulk = useCallback(() => {
    if (!canManageTasks || bulkSelectedIds.size === 0) return
    const tasks = requests
      .filter((r) => bulkSelectedIds.has(r._id))
      .map((r) => ({ id: r._id, title: r.title }))
    clearBulkSelection()
    denyMany(tasks)
  }, [canManageTasks, bulkSelectedIds, requests, denyMany, clearBulkSelection])

  // ── source filter chip toggle ──────────────────────
  const toggleSourceFilter = useCallback((source: RequestSource) => {
    setActiveSources((prev) => {
      const next = new Set(prev)
      if (next.has(source)) next.delete(source)
      else next.add(source)
      return next
    })
  }, [])

  // ── keyboard shortcuts ─────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const inEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable

      if (e.key === "/" && !inEditable) {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      if (e.key === "Escape") {
        if (target instanceof HTMLInputElement) {
          target.blur()
          return
        }
      }

      if (inEditable) return

      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault()
        const idx = filteredRequests.findIndex((r) => r._id === selectedId)
        const next = filteredRequests[Math.min(idx + 1, filteredRequests.length - 1)]
        if (next) setSelectedId(next._id)
        return
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault()
        const idx = filteredRequests.findIndex((r) => r._id === selectedId)
        const next = filteredRequests[Math.max(idx - 1, 0)]
        if (next) setSelectedId(next._id)
        return
      }
      if (selectedTask && (e.key === "a" || e.key === "A")) {
        e.preventDefault()
        handleAccept(selectedTask)
        return
      }
      if (selectedTask && (e.key === "d" || e.key === "D")) {
        e.preventDefault()
        handleDeny(selectedTask)
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [filteredRequests, selectedId, selectedTask, setSelectedId, handleAccept, handleDeny])

  // ── render ─────────────────────────────────────────
  const isLoading = liveTasks === undefined
  const hasNoRequests = !isLoading && requests.length === 0
  const hasNoMatches = !isLoading && requests.length > 0 && filteredRequests.length === 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
    >
      {/* Toolbar — matches the home tab's compact toolbar */}
      <div className="scrollbar-hide flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-toolbar text-toolbar-foreground px-3 py-2">
        <div className="flex items-center gap-2 pr-2">
          <Tray size={14} weight="fill" className="text-foreground/80" />
          <span className="text-[13px] font-semibold tracking-tight">Requests</span>
          <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-[4px] bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            {requests.length}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <div className="flex h-7 w-[200px] items-center gap-1.5 rounded-[4px] bg-card px-2 ring-1 ring-border focus-within:ring-foreground/30 sm:w-[240px]">
            <MagnifyingGlass size={12} className="text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
            />
            {searchTerm ? (
              <button
                onClick={() => setSearchTerm("")}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X size={11} />
              </button>
            ) : (
              <kbd className="hidden rounded-[3px] border border-border px-1 py-px font-mono text-[10px] text-muted-foreground/60 sm:inline">
                /
              </kbd>
            )}
          </div>

          <FilterMenu
            activeSources={activeSources}
            onToggleSource={toggleSourceFilter}
            onClearSources={() => setActiveSources(new Set())}
          />
          <SortMenu sortKey={sortKey} onSortChange={setSortKey} />
        </div>
      </div>

      {/* Bulk action bar */}
      <AnimatePresence initial={false}>
        {bulkSelectedIds.size > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="shrink-0 overflow-hidden border-b border-border bg-background"
          >
            <div className="flex items-center gap-2 px-3 py-1.5">
              <span className="text-[12px] font-medium">
                {bulkSelectedIds.size} selected
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  onClick={clearBulkSelection}
                  className="rounded-[4px] px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Clear
                </button>
                <button
                  disabled={!canManageTasks}
                  onClick={handleAcceptBulk}
                  className="flex items-center gap-1.5 rounded-[4px] bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
                >
                  <CheckCircle size={12} weight="fill" />
                  Accept all
                </button>
                <button
                  disabled={!canManageTasks}
                  onClick={handleDenyBulk}
                  className="flex items-center gap-1.5 rounded-[4px] bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-500/20 disabled:opacity-50 dark:text-red-400"
                >
                  <XCircle size={12} />
                  Deny all
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* List pane */}
        <aside
          style={{ "--list-w": `${listPaneWidth}px` } as React.CSSProperties}
          className={`relative w-full shrink-0 flex-col border-r border-border bg-background md:w-[var(--list-w)] ${
            userPickedId ? "hidden md:flex" : "flex"
          }`}
        >
          {hasNoRequests ? (
            <EmptyState />
          ) : hasNoMatches ? (
            <NoMatchesState
              onClear={() => {
                setSearchTerm("")
                setActiveSources(new Set())
              }}
            />
          ) : (
            <ul className="flex-1 space-y-1.5 overflow-y-auto p-2">
              {filteredRequests.map((task) => (
                <RequestListItem
                  key={task._id}
                  task={task}
                  isSelected={task._id === selectedId}
                  isBulkSelected={bulkSelectedIds.has(task._id)}
                  canManageTasks={canManageTasks}
                  onSelect={() => setSelectedId(task._id)}
                  onToggleBulk={() => toggleBulkSelected(task._id)}
                  onAccept={() => handleAccept(task)}
                  onDeny={() => handleDeny(task)}
                />
              ))}
            </ul>
          )}

          {/* Desktop resize handle */}
          <div
            onPointerDown={handleListResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize requests list"
            className="group absolute inset-y-0 -right-1.5 z-20 hidden w-3 cursor-col-resize items-center justify-center md:flex"
          >
            <div
              className={`absolute inset-y-0 right-1.5 w-px transition-colors ${
                isResizingList
                  ? "bg-primary"
                  : "bg-transparent group-hover:bg-primary/40"
              }`}
            />
            <div
              className={`relative flex h-8 w-3 items-center justify-center rounded-full bg-background text-muted-foreground/60 opacity-0 ring-1 ring-border transition-opacity group-hover:opacity-100 ${
                isResizingList ? "opacity-100 text-primary ring-primary/50" : ""
              }`}
            >
              <DotsSixVertical size={10} weight="bold" />
            </div>
          </div>
        </aside>

        {/* Detail pane */}
        <section
          className={`relative min-h-0 flex-1 overflow-y-auto bg-background ${
            userPickedId ? "flex" : "hidden md:flex"
          } flex-col`}
        >
          <AnimatePresence mode="wait">
            {selectedTask ? (
              <motion.div
                key={selectedTask._id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="flex flex-1 flex-col"
              >
                <RequestDetail
                  task={selectedTask}
                  canManageTasks={canManageTasks}
                  onAccept={() => handleAccept(selectedTask)}
                  onDeny={() => handleDeny(selectedTask)}
                  onBack={() => setSelectedId(null)}
                />
              </motion.div>
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="hidden flex-1 items-center justify-center text-[12px] text-muted-foreground md:flex"
              >
                Select a request to review
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </motion.div>
  )
}

// ── List item ───────────────────────────────────────────

function RequestListItem({
  task,
  isSelected,
  isBulkSelected,
  canManageTasks,
  onSelect,
  onToggleBulk,
  onAccept,
  onDeny,
}: {
  task: RequestTask
  isSelected: boolean
  isBulkSelected: boolean
  canManageTasks: boolean
  onSelect: () => void
  onToggleBulk: () => void
  onAccept: () => void
  onDeny: () => void
}) {
  const sources = getTaskSources(task)
  const dedupedPlatforms = Array.from(new Set(sources.map((s) => s.platform)))
  const firstAuthor = sources[0]?.author

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onSelect()
          }
        }}
        className={`group relative flex w-full cursor-pointer items-start gap-2 rounded-[6px] border bg-card px-3 py-2.5 pr-2 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:shadow-[0_2px_6px_rgba(0,0,0,0.08)] ${
          isSelected
            ? "border-foreground/30 bg-accent shadow-[0_2px_6px_rgba(0,0,0,0.08)]"
            : "border-border hover:border-foreground/20"
        }`}
      >
        <span
          role="checkbox"
          aria-checked={isBulkSelected}
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            onToggleBulk()
          }}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault()
              e.stopPropagation()
              onToggleBulk()
            }
          }}
          className={`mt-0.5 flex size-3.5 shrink-0 cursor-pointer items-center justify-center rounded-[3px] ring-1 transition-colors ${
            isBulkSelected
              ? "bg-foreground text-background ring-foreground"
              : "bg-background ring-border opacity-0 group-hover:opacity-100 data-[checked=true]:opacity-100"
          }`}
          data-checked={isBulkSelected}
        >
          {isBulkSelected && (
            <svg viewBox="0 0 16 16" width={9} height={9} fill="none" stroke="currentColor" strokeWidth={3}>
              <path d="M3 8l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-[13px] font-medium leading-snug text-foreground">
            {task.title}
          </p>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {dedupedPlatforms.map((platform) => (
              <span key={platform} className="inline-flex">
                <SourceGlyph platform={platform} size={10} />
              </span>
            ))}
            {firstAuthor && (
              <span className="truncate">{firstAuthor}</span>
            )}
            <span className="text-muted-foreground/50">·</span>
            <span className="font-mono tabular-nums">{task.taskCode}</span>
            <span className="ml-auto shrink-0">
              {formatTaskDate(task._creationTime, task.createdAtLabel)}
            </span>
          </div>
        </div>

        {/* Quick actions — hover-only, hugging the right edge so they're
            isolated from the main click target. */}
        {canManageTasks && (
          <div
            className="absolute top-1.5 right-1.5 flex flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              title="Accept (A)"
              onClick={(e) => {
                e.stopPropagation()
                onAccept()
              }}
              className="flex size-5 items-center justify-center rounded-[3px] bg-background text-emerald-600 ring-1 ring-border transition-colors hover:bg-emerald-500/15 hover:text-emerald-600 hover:ring-emerald-500/40 dark:text-emerald-400"
            >
              <CheckCircle size={11} weight="fill" />
            </button>
            <button
              type="button"
              title="Deny (D)"
              onClick={(e) => {
                e.stopPropagation()
                onDeny()
              }}
              className="flex size-5 items-center justify-center rounded-[3px] bg-background text-red-600 ring-1 ring-border transition-colors hover:bg-red-500/15 hover:text-red-600 hover:ring-red-500/40 dark:text-red-400"
            >
              <XCircle size={11} />
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

// ── Detail pane ─────────────────────────────────────────

function RequestDetail({
  task,
  canManageTasks,
  onAccept,
  onDeny,
  onBack,
}: {
  task: RequestTask
  canManageTasks: boolean
  onAccept: () => void
  onDeny: () => void
  onBack: () => void
}) {
  const sources = getTaskSources(task)
  return (
    <div className="flex flex-1 flex-col">
      {/* Mobile back button */}
      <div className="flex items-center gap-2 border-b border-border bg-toolbar px-3 py-2 md:hidden">
        <button
          onClick={onBack}
          className="flex h-7 items-center gap-1.5 rounded-[4px] px-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft size={13} />
          Back
        </button>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
          {task.taskCode}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
        {/* Title row */}
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 className="text-[18px] font-semibold leading-tight tracking-tight text-foreground">
              {task.title}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="hidden font-mono md:inline">{task.taskCode}</span>
              <span>{formatTaskDate(task._creationTime, task.createdAtLabel)}</span>
              <span>
                Priority:{" "}
                <span className={PRIORITY_COLOR[task.priority as TaskPriority]}>
                  {PRIORITY_LABEL[task.priority as TaskPriority]}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Labels */}
        {task.labels && task.labels.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {task.labels.map((label) => (
              <span
                key={label}
                className="rounded-[4px] bg-muted px-1.5 py-0.5 text-[10px] font-medium capitalize text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
        )}

        {/* Sources block */}
        {sources.length > 0 && (
          <section className="mt-5">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Sources
            </h3>
            <ul className="flex flex-col gap-1.5">
              {sources.map((src) => (
                <SourceRow key={`${src.platform}-${src.url}-${src.author}`} source={src} />
              ))}
            </ul>
          </section>
        )}

        {/* Description */}
        {task.description && task.description.trim().length > 0 ? (
          <section className="mt-5">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </h3>
            <div className="rounded-[4px] bg-card p-3 text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/90 ring-1 ring-border">
              {task.description}
            </div>
          </section>
        ) : (
          <section className="mt-5">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </h3>
            <p className="text-[12px] italic text-muted-foreground">
              No description provided.
            </p>
          </section>
        )}

        {/* Attachments preview (read-only links) */}
        {task.attachments && task.attachments.length > 0 && (
          <section className="mt-5">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Attachments
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {task.attachments.map((att, idx) => (
                <li
                  key={`${att.storageId}-${idx}`}
                  className="flex items-center gap-1.5 rounded-[4px] bg-card px-2 py-1 text-[11px] text-muted-foreground ring-1 ring-border"
                >
                  <span className="truncate max-w-[180px]">{att.name}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Action footer */}
      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-toolbar px-4 py-3 md:px-6">
        <button
          disabled={!canManageTasks}
          onClick={onDeny}
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[4px] bg-red-500/10 px-3 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-500/20 disabled:opacity-50 dark:text-red-400"
        >
          <XCircle size={13} />
          Deny
          <kbd className="ml-1 hidden rounded-[3px] border border-red-500/30 px-1 py-px font-mono text-[10px] sm:inline">
            D
          </kbd>
        </button>
        <button
          disabled={!canManageTasks}
          onClick={onAccept}
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[4px] bg-emerald-500/10 px-3 text-[12px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
        >
          <CheckCircle size={13} weight="fill" />
          Accept
          <kbd className="ml-1 hidden rounded-[3px] border border-emerald-500/30 px-1 py-px font-mono text-[10px] sm:inline">
            A
          </kbd>
        </button>
      </div>
    </div>
  )
}

function SourceRow({ source }: { source: TaskSource }) {
  const cfg = SOURCE_CONFIG[source.platform]
  const themeFollowing = THEME_FOLLOWING_SOURCES.has(source.platform)
  return (
    <li>
      <a
        href={source.url || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-[4px] bg-card p-2 ring-1 ring-border transition-colors hover:ring-foreground/30"
      >
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-[4px] ${themeFollowing ? "bg-foreground/10" : ""}`}
          style={themeFollowing ? undefined : { backgroundColor: cfg.bg }}
        >
          <SourceGlyph platform={source.platform} size={14} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-[12px] font-medium text-foreground">
            {cfg.label} · {source.author}
          </span>
          {source.url && (
            <span className="truncate text-[11px] text-muted-foreground">
              {source.url}
            </span>
          )}
        </div>
        {source.url && (
          <LinkIcon size={12} className="shrink-0 text-muted-foreground" />
        )}
      </a>
    </li>
  )
}

// ── Empty states ────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="flex size-10 items-center justify-center rounded-[6px] bg-muted">
        <Tray size={18} className="text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-medium">All caught up</p>
        <p className="max-w-[260px] text-[12px] text-muted-foreground">
          New requests from Discord, Slack, X, Linear, GitHub, and the CLI will appear here.
        </p>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
        {REQUEST_SOURCES.map((source) => (
          <span key={source} className="opacity-60">
            <SourceGlyph platform={source} size={13} />
          </span>
        ))}
      </div>
    </div>
  )
}

const TOOLBAR_BUTTON_BASE =
  "flex h-7 items-center gap-1.5 rounded-[4px] px-2 text-[12px] font-medium ring-1 transition-colors outline-none"
const TOOLBAR_BUTTON_INACTIVE =
  "bg-card text-muted-foreground ring-border hover:text-foreground hover:ring-foreground/30"
const TOOLBAR_BUTTON_ACTIVE =
  "bg-accent text-foreground ring-foreground/30"

function FilterMenu({
  activeSources,
  onToggleSource,
  onClearSources,
}: {
  activeSources: Set<RequestSource>
  onToggleSource: (source: RequestSource) => void
  onClearSources: () => void
}) {
  const filterCount = activeSources.size
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`${TOOLBAR_BUTTON_BASE} ${filterCount > 0 ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE}`}
      >
        <FunnelSimple size={12} />
        <span>Filter</span>
        {filterCount > 0 && (
          <span className="rounded-[3px] bg-foreground px-1 py-px text-[10px] font-semibold text-background">
            {filterCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Sources</span>
            {filterCount > 0 && (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  onClearSources()
                }}
                className="text-[10px] font-normal text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </DropdownMenuLabel>
          {REQUEST_SOURCES.map((source) => {
            const cfg = SOURCE_CONFIG[source]
            const checked = activeSources.has(source)
            return (
              <button
                key={source}
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onToggleSource(source)
                }}
                className="flex w-full items-center gap-2 rounded-[4px] px-1.5 py-1 text-[12px] outline-none hover:bg-accent"
              >
                <span className="flex size-3.5 items-center justify-center">
                  {checked ? <Check size={11} /> : null}
                </span>
                <SourceGlyph platform={source} size={12} />
                <span className="flex-1 text-left">{cfg.label}</span>
              </button>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SortMenu({
  sortKey,
  onSortChange,
}: {
  sortKey: SortKey
  onSortChange: (key: SortKey) => void
}) {
  const isDefault = sortKey === "newest"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`${TOOLBAR_BUTTON_BASE} ${isDefault ? TOOLBAR_BUTTON_INACTIVE : TOOLBAR_BUTTON_ACTIVE}`}
      >
        <ArrowsDownUp size={12} />
        <span>Sort</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[180px]">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={sortKey}
            onValueChange={(value) => onSortChange(value as SortKey)}
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
              <DropdownMenuRadioItem key={key} value={key} className="text-[12px]">
                {SORT_LABEL[key]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NoMatchesState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <p className="text-[13px] font-medium">No requests match your filters</p>
      <button
        onClick={onClear}
        className="rounded-[4px] bg-card px-2.5 py-1 text-[12px] font-medium ring-1 ring-border transition-colors hover:bg-accent"
      >
        Clear filters
      </button>
    </div>
  )
}
