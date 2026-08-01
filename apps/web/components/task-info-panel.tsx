"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  Brain,
  CaretRight,
  Info,
  Link as LinkIcon,
  Paperclip,
} from "@phosphor-icons/react"
import {
  TASK_STATUS_LABELS,
  type TaskPriority,
  type TaskSource,
  type TaskStatus,
} from "@/lib/task-board"

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
}
import {
  getTaskSources,
  sanitizeExternalUrl,
  SOURCE_CONFIG,
} from "@/lib/task-sources"

// The full record the information panel can render. Every field is optional so
// the panel works against both the kanban board's enriched `Task` and the raw
// `Doc<"tasks">` the requests tab hands it.
export type TaskInfo = {
  _id?: string
  id?: string
  _creationTime?: number
  taskCode?: string
  taskNumber?: number
  title?: string
  description?: string
  status?: string
  priority?: string
  labels?: string[]
  project?: string
  order?: number
  updatedAt?: number
  createdAtLabel?: string
  workspaceId?: string
  assignee?: { name: string; avatar: string }
  assignees?: { userId: string; name: string; imageUrl?: string }[]
  source?: TaskSource
  sources?: TaskSource[]
  customData?: unknown
  attachments?: { name: string; type?: string; size?: number }[]
}

function formatTimestamp(value: number | undefined): string | null {
  if (!value || !Number.isFinite(value)) return null
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatBytes(size: number | undefined): string | null {
  if (!size || !Number.isFinite(size)) return null
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function hasCustomData(customData: unknown): boolean {
  if (customData === undefined || customData === null) return false
  if (typeof customData === "object") {
    return Object.keys(customData as Record<string, unknown>).length > 0
  }
  return true
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-1">
      <span className="w-[104px] shrink-0 text-[12px] text-muted-foreground/70">
        {label}
      </span>
      <div className="min-w-0 flex-1 text-[12px] break-words text-foreground/85">
        {children}
      </div>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground/60 uppercase first:mt-0">
      {children}
    </p>
  )
}

// Custom data is arbitrary developer JSON. Objects are rendered key-by-key so
// the common case stays scannable; anything else falls back to pretty JSON.
function CustomDataView({ customData }: { customData: unknown }) {
  const entries = useMemo(() => {
    if (
      typeof customData !== "object" ||
      customData === null ||
      Array.isArray(customData)
    ) {
      return null
    }
    return Object.entries(customData as Record<string, unknown>)
  }, [customData])

  if (!entries) {
    return (
      <pre className="max-h-[240px] overflow-auto rounded-[8px] bg-muted/60 p-2.5 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-foreground/80 ring-1 ring-border">
        {JSON.stringify(customData, null, 2)}
      </pre>
    )
  }

  return (
    <div className="flex flex-col gap-1 rounded-[8px] bg-muted/40 p-2.5 ring-1 ring-border">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-start gap-3">
          <span className="w-[104px] shrink-0 font-mono text-[11px] break-words text-muted-foreground/70">
            {key}
          </span>
          <span className="min-w-0 flex-1 font-mono text-[11px] break-words whitespace-pre-wrap text-foreground/85">
            {typeof value === "string" ? value : JSON.stringify(value)}
          </span>
        </div>
      ))}
    </div>
  )
}

function SourceChip({ source }: { source: TaskSource }) {
  const config = SOURCE_CONFIG[source.platform]
  const safeUrl = sanitizeExternalUrl(source.url)
  const content = (
    <>
      <span>{config.label}</span>
      <span className="text-foreground/50">·</span>
      <span className="truncate">{source.author}</span>
      {safeUrl ? <LinkIcon size={10} className="shrink-0 opacity-60" /> : null}
    </>
  )
  const className =
    "flex max-w-full items-center gap-1.5 rounded-[8px] px-2 py-1 text-[11px] font-medium"

  return safeUrl ? (
    <a
      href={safeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} transition-opacity hover:opacity-80`}
      style={{ backgroundColor: config.bg, color: config.color }}
    >
      {content}
    </a>
  ) : (
    <span
      className={className}
      style={{ backgroundColor: config.bg, color: config.color }}
    >
      {content}
    </span>
  )
}

/**
 * Collapsible "Information" panel listing everything stored on a task —
 * identifiers, board placement, timestamps, people, origin, attachments, and
 * any developer-supplied custom data forwarded through the public API.
 *
 * Shared by the board's task detail panel and the requests tab.
 */
export function TaskInfoPanel({
  task,
  defaultOpen = false,
  className = "",
}: {
  task: TaskInfo
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  const sources = getTaskSources(task)
  const assignees = task.assignees ?? []
  const labels = task.labels ?? []
  const attachments = task.attachments ?? []
  const createdAt =
    formatTimestamp(task._creationTime) ?? task.createdAtLabel ?? null
  const updatedAt = formatTimestamp(task.updatedAt)
  const taskId = task._id ?? task.id ?? null
  const showCustomData = hasCustomData(task.customData)

  return (
    <div className={`rounded-[10px] ring-1 ring-border ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-muted/50"
      >
        <Info size={13} className="shrink-0 text-muted-foreground/70" />
        <span className="text-[12px] font-medium text-foreground/85">
          Information
        </span>
        {showCustomData ? (
          <span className="flex items-center gap-1 rounded-[6px] bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">
            <Brain size={10} />
            Custom data
          </span>
        ) : null}
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="ml-auto flex text-muted-foreground/60"
        >
          <CaretRight size={12} weight="bold" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-3 pt-2 pb-3">
              <SectionHeading>Identity</SectionHeading>
              {task.taskCode ? (
                <Row label="Task code">
                  <span className="font-mono">{task.taskCode}</span>
                </Row>
              ) : null}
              {typeof task.taskNumber === "number" ? (
                <Row label="Task number">
                  <span className="tabular-nums">{task.taskNumber}</span>
                </Row>
              ) : null}
              {taskId ? (
                <Row label="ID">
                  <span className="font-mono break-all">{taskId}</span>
                </Row>
              ) : null}
              {task.project ? <Row label="Project">{task.project}</Row> : null}

              <SectionHeading>Board</SectionHeading>
              {task.status ? (
                <Row label="Status">
                  {TASK_STATUS_LABELS[task.status as TaskStatus] ?? task.status}
                </Row>
              ) : null}
              {task.priority ? (
                <Row label="Priority">
                  {PRIORITY_LABELS[task.priority as TaskPriority] ??
                    task.priority}
                </Row>
              ) : null}
              {typeof task.order === "number" ? (
                <Row label="Order">
                  <span className="tabular-nums">{task.order}</span>
                </Row>
              ) : null}
              <Row label="Labels">
                {labels.length > 0 ? (
                  <span className="capitalize">{labels.join(", ")}</span>
                ) : (
                  <span className="text-muted-foreground/50">None</span>
                )}
              </Row>

              <SectionHeading>Timeline</SectionHeading>
              <Row label="Created">
                {createdAt ?? (
                  <span className="text-muted-foreground/50">Unknown</span>
                )}
              </Row>
              <Row label="Last updated">
                {updatedAt ?? (
                  <span className="text-muted-foreground/50">Never</span>
                )}
              </Row>

              <SectionHeading>People</SectionHeading>
              <Row label="Assignees">
                {assignees.length > 0 ? (
                  assignees.map((assignee) => assignee.name).join(", ")
                ) : task.assignee ? (
                  task.assignee.name
                ) : (
                  <span className="text-muted-foreground/50">Unassigned</span>
                )}
              </Row>

              <SectionHeading>Origin</SectionHeading>
              <Row label="Sources">
                {sources.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {sources.map((source) => (
                      <SourceChip
                        key={`${source.platform}-${source.url}-${source.author}`}
                        source={source}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground/50">
                    Created in Median
                  </span>
                )}
              </Row>

              {attachments.length > 0 ? (
                <>
                  <SectionHeading>Attachments</SectionHeading>
                  <ul className="flex flex-col gap-1">
                    {attachments.map((attachment, index) => {
                      const size = formatBytes(attachment.size)
                      return (
                        <li
                          key={`${attachment.name}-${index}`}
                          className="flex items-center gap-1.5 text-[12px] text-foreground/85"
                        >
                          <Paperclip
                            size={11}
                            className="shrink-0 text-muted-foreground/60"
                          />
                          <span className="truncate">{attachment.name}</span>
                          {size ? (
                            <span className="shrink-0 text-muted-foreground/50">
                              {size}
                            </span>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </>
              ) : null}

              <SectionHeading>Custom data</SectionHeading>
              {showCustomData ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[11px] text-muted-foreground/60">
                    Attached via the API and included in the AI’s context when
                    this task was written.
                  </p>
                  <CustomDataView customData={task.customData} />
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground/50">
                  No custom data attached. Send a{" "}
                  <span className="font-mono">customData</span> object to{" "}
                  <span className="font-mono">POST /api/feedback</span> to
                  enrich tasks with your own fields.
                </p>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
