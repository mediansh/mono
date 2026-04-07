"use client"

import { useQuery } from "convex/react"
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { api } from "@/convex/_generated/api"

export type TaskAttachment = {
  storageId: string
  name: string
  type: string
  size: number
  width?: number
  height?: number
  displayWidth?: number
  url?: string | null
}

const DEFAULT_IMAGE_WIDTH = 480
const MIN_IMAGE_WIDTH = 240
const MAX_IMAGE_WIDTH = 760

export function isImageAttachment(attachment: TaskAttachment) {
  return attachment.type.startsWith("image/")
}

export function getDefaultAttachmentDisplayWidth(naturalWidth?: number | null) {
  if (typeof naturalWidth !== "number" || !Number.isFinite(naturalWidth)) {
    return DEFAULT_IMAGE_WIDTH
  }

  return clampAttachmentDisplayWidth(naturalWidth)
}

function clampAttachmentDisplayWidth(width: number) {
  return Math.min(MAX_IMAGE_WIDTH, Math.max(MIN_IMAGE_WIDTH, Math.round(width)))
}

function getAttachmentDisplayWidth(attachment: TaskAttachment) {
  return clampAttachmentDisplayWidth(
    attachment.displayWidth ??
      getDefaultAttachmentDisplayWidth(attachment.width)
  )
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`
  return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`
}

function AttachmentImageCard({
  attachment,
  canManageAttachments,
  onDisplayWidthChange,
  onRemove,
}: {
  attachment: TaskAttachment
  canManageAttachments: boolean
  onDisplayWidthChange?: (displayWidth: number) => void
  onRemove?: () => void
}) {
  const [displayWidth, setDisplayWidth] = useState(
    getAttachmentDisplayWidth(attachment)
  )
  const [isResizing, setIsResizing] = useState(false)
  const displayWidthRef = useRef(displayWidth)
  const dragStateRef = useRef<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)

  useEffect(() => {
    displayWidthRef.current = displayWidth
  }, [displayWidth])

  useEffect(() => {
    setDisplayWidth(getAttachmentDisplayWidth(attachment))
  }, [attachment.displayWidth, attachment.width, attachment.url])

  useEffect(() => {
    return () => {
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [])

  function commitDisplayWidth(nextWidth: number) {
    const normalized = clampAttachmentDisplayWidth(nextWidth)
    setDisplayWidth(normalized)
    onDisplayWidthChange?.(normalized)
  }

  function handleResizeStart(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!canManageAttachments) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.style.cursor = "nwse-resize"
    document.body.style.userSelect = "none"
    setIsResizing(true)
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: displayWidth,
    }

    function handlePointerMove(moveEvent: PointerEvent) {
      const dragState = dragStateRef.current
      if (!dragState || moveEvent.pointerId !== dragState.pointerId) return

      const nextWidth =
        dragState.startWidth + (moveEvent.clientX - dragState.startX)
      setDisplayWidth(clampAttachmentDisplayWidth(nextWidth))
    }

    function handlePointerUp(moveEvent: PointerEvent) {
      const dragState = dragStateRef.current
      if (!dragState || moveEvent.pointerId !== dragState.pointerId) return

      dragStateRef.current = null
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      setIsResizing(false)

      commitDisplayWidth(displayWidthRef.current)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-medium text-foreground/80">
          {attachment.name}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {formatFileSize(attachment.size)}
        </span>
        {canManageAttachments ? (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto rounded-[8px] border border-border/80 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Remove
          </button>
        ) : null}
      </div>

      <div className="w-full overflow-hidden rounded-[14px] border border-border/80 bg-accent/20">
        {attachment.url ? (
          <div
            className="group relative min-w-0"
            style={{
              width: `${displayWidth}px`,
              maxWidth: "100%",
            }}
          >
            <img
              src={attachment.url}
              alt={attachment.name}
              className="block h-auto w-full rounded-[14px] object-contain"
            />
            {canManageAttachments ? (
              <button
                type="button"
                onPointerDown={handleResizeStart}
                className="absolute right-2 bottom-2 z-10 flex size-5 cursor-nwse-resize items-center justify-center rounded-[4px] bg-black/40 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60"
                aria-label={`Resize ${attachment.name}`}
              >
                <svg
                  viewBox="0 0 8 8"
                  className="pointer-events-none size-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <line x1="7" y1="2" x2="2" y2="7" />
                  <line x1="7" y1="5" x2="5" y2="7" />
                </svg>
              </button>
            ) : null}
          </div>
        ) : (
          <div
            className="flex items-center justify-center rounded-[14px] bg-accent/40 px-4 py-12 text-[12px] text-muted-foreground"
            style={{
              width: `${displayWidth}px`,
              maxWidth: "100%",
            }}
          >
            Attachment unavailable
          </div>
        )}
      </div>
    </div>
  )
}

export function TaskAttachmentGallery({
  attachments,
  workspaceId,
  canManageAttachments = false,
  onAttachmentsChange,
}: {
  attachments?: TaskAttachment[]
  workspaceId?: string
  canManageAttachments?: boolean
  onAttachmentsChange?: (attachments: TaskAttachment[]) => void
}) {
  if (!attachments || attachments.length === 0) {
    return null
  }

  const safeAttachments = attachments
  const storageIds = workspaceId
    ? Array.from(
        new Set(safeAttachments.map((attachment) => attachment.storageId))
      )
    : []
  const resolvedUrls = useQuery(
    api.tasks.resolveAttachmentUrls,
    workspaceId && storageIds.length > 0
      ? ({ workspaceId, storageIds } as any)
      : "skip"
  )
  const hydratedAttachments = safeAttachments.map((attachment) => ({
    ...attachment,
    url: resolvedUrls?.[attachment.storageId] ?? attachment.url ?? null,
  }))
  const imageAttachments = hydratedAttachments.filter(isImageAttachment)
  const fileAttachments = hydratedAttachments.filter(
    (attachment) => !isImageAttachment(attachment)
  )

  function handleDisplayWidthChange(storageId: string, displayWidth: number) {
    onAttachmentsChange?.(
      safeAttachments.map((attachment) =>
        attachment.storageId === storageId
          ? { ...attachment, displayWidth }
          : attachment
      )
    )
  }

  function handleRemove(storageId: string) {
    onAttachmentsChange?.(
      safeAttachments.filter((attachment) => attachment.storageId !== storageId)
    )
  }

  return (
    <div className="space-y-4">
      {imageAttachments.length > 0 ? (
        <div className="space-y-4">
          <span className="block text-[11px] font-medium tracking-[0.16em] text-muted-foreground/70 uppercase">
            Attachments
          </span>
          {imageAttachments.map((attachment) => (
            <AttachmentImageCard
              key={attachment.storageId}
              attachment={attachment}
              canManageAttachments={canManageAttachments}
              onDisplayWidthChange={(displayWidth) =>
                handleDisplayWidthChange(attachment.storageId, displayWidth)
              }
              onRemove={() => handleRemove(attachment.storageId)}
            />
          ))}
        </div>
      ) : null}

      {fileAttachments.length > 0 ? (
        <div className="space-y-2">
          <span className="block text-[11px] font-medium tracking-[0.16em] text-muted-foreground/70 uppercase">
            Files
          </span>
          <div className="flex flex-wrap gap-2">
            {fileAttachments.map((attachment) => (
              <div
                key={attachment.storageId}
                className="flex items-center gap-2 rounded-[10px] border border-border/80 bg-background px-3 py-2 text-[12px]"
              >
                <a
                  href={attachment.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 transition-colors hover:text-foreground"
                >
                  <span className="block max-w-[220px] truncate font-medium text-foreground/85">
                    {attachment.name}
                  </span>
                  <span className="text-muted-foreground">
                    {formatFileSize(attachment.size)}
                  </span>
                </a>
                {canManageAttachments ? (
                  <button
                    type="button"
                    onClick={() => handleRemove(attachment.storageId)}
                    className="rounded-[8px] border border-border/80 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
