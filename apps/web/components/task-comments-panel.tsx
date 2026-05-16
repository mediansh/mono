"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { useUser } from "@clerk/nextjs"
import { AnimatePresence, motion } from "motion/react"
import {
  DotsThree,
  PencilSimple,
  ThumbsUp,
  Trash,
  ChatCircle,
} from "@phosphor-icons/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { AssigneeAvatar } from "@/components/assignee-picker"
import { TaskCommentBody } from "@/components/task-comment-body"
import { TaskCommentComposer } from "@/components/task-comment-composer"

type Props = {
  workspaceId: Id<"workspaces">
  taskId: Id<"tasks">
  canComment: boolean
}

function formatTimestamp(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(ms).toLocaleDateString()
}

export function TaskCommentsPanel({ workspaceId, taskId, canComment }: Props) {
  const { user } = useUser()
  const currentUserId = user?.id ?? null

  const comments = useQuery(api.taskComments.listByTask, {
    workspaceId,
    taskId,
  })

  const createComment = useMutation(api.taskComments.create)
  const editComment = useMutation(api.taskComments.edit)
  const removeComment = useMutation(api.taskComments.remove)
  const toggleReaction = useMutation(api.taskComments.toggleReaction)

  const [editingId, setEditingId] = useState<Id<"taskComments"> | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const ordered = useMemo(() => comments ?? [], [comments])

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lastCountRef = useRef<number>(0)
  const pinnedToBottomRef = useRef<boolean>(true)
  const hasScrolledInitialLoadRef = useRef(false)

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    pinnedToBottomRef.current = distanceFromBottom < 32
  }

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const prev = lastCountRef.current
    const next = ordered.length
    lastCountRef.current = next
    if (prev === 0 || pinnedToBottomRef.current || next > prev) {
      el.scrollTop = el.scrollHeight
    }
  }, [ordered.length])

  useEffect(() => {
    if (!comments || hasScrolledInitialLoadRef.current) return
    hasScrolledInitialLoadRef.current = true
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [comments])

  const handleCreate = async (payload: {
    markdown: string
    mentionedUserIds: string[]
  }) => {
    if (submitting) return
    setSubmitting(true)
    try {
      await createComment({
        workspaceId,
        taskId,
        bodyMarkdown: payload.markdown,
        mentionedUserIds: payload.mentionedUserIds,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-1.5 px-4 pt-3 pb-2">
        <ChatCircle size={13} className="text-muted-foreground" />
        <h3 className="text-[12px] font-medium text-foreground/80">
          Comments
        </h3>
        {ordered.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-px text-[10.5px] font-medium text-muted-foreground tabular-nums">
            {ordered.length}
          </span>
        )}
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-3"
      >
        {comments === undefined ? (
          <p className="px-2 text-[13px] text-muted-foreground">Loading…</p>
        ) : ordered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">
            <ChatCircle
              size={20}
              weight="duotone"
              className="text-muted-foreground/50"
            />
            <p className="text-[12.5px] text-muted-foreground">
              No comments yet
            </p>
            <p className="text-[11.5px] text-muted-foreground/70">
              Start the conversation below.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {ordered.map((comment) => (
                <motion.li
                  key={comment._id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <CommentItem
                    comment={comment}
                    currentUserId={currentUserId}
                    canComment={canComment}
                    isEditing={editingId === comment._id}
                    onStartEdit={() => setEditingId(comment._id)}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={async (payload) => {
                      await editComment({
                        commentId: comment._id,
                        bodyMarkdown: payload.markdown,
                        mentionedUserIds: payload.mentionedUserIds,
                      })
                      setEditingId(null)
                    }}
                    onDelete={async () => {
                      await removeComment({ commentId: comment._id })
                    }}
                    onToggleReaction={async () => {
                      await toggleReaction({ commentId: comment._id })
                    }}
                    workspaceId={workspaceId}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {canComment ? (
        <div className="shrink-0 px-3 pt-2 pb-3">
          <TaskCommentComposer
            workspaceId={workspaceId}
            onSubmit={handleCreate}
            disabled={submitting}
          />
        </div>
      ) : (
        <div className="shrink-0 px-4 pt-2 pb-3 text-[11.5px] text-muted-foreground">
          You don&rsquo;t have permission to comment on this task.
        </div>
      )}
    </div>
  )
}

function CommentItem({
  comment,
  currentUserId,
  canComment,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onToggleReaction,
  workspaceId,
}: {
  comment: {
    _id: Id<"taskComments">
    authorId: string
    authorName: string | null
    authorImageUrl: string | null
    bodyMarkdown: string
    reactions: { userId: string; emoji: string }[]
    createdAt: number
    editedAt: number | null
  }
  currentUserId: string | null
  canComment: boolean
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (payload: {
    markdown: string
    mentionedUserIds: string[]
  }) => Promise<void>
  onDelete: () => Promise<void>
  onToggleReaction: () => Promise<void>
  workspaceId: Id<"workspaces">
}) {
  const isAuthor = currentUserId !== null && comment.authorId === currentUserId
  const thumbs = comment.reactions.filter((r) => r.emoji === "+1")
  const userReacted =
    currentUserId !== null && thumbs.some((r) => r.userId === currentUserId)

  const authorAssignee = {
    userId: comment.authorId,
    name: comment.authorName ?? "Member",
    imageUrl: comment.authorImageUrl ?? undefined,
  }

  if (isEditing) {
    return (
      <div className="flex gap-2.5">
        <div className="pt-0.5">
          <AssigneeAvatar assignee={authorAssignee} size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <TaskCommentComposer
            key={`edit-${comment._id}`}
            workspaceId={workspaceId}
            initialMarkdown={comment.bodyMarkdown}
            submitLabel="Save"
            onSubmit={onSaveEdit}
            onCancel={onCancelEdit}
          />
        </div>
      </div>
    )
  }

  const bubbleClass = cn(
    "relative max-w-[85%] rounded-[14px] px-3 py-2 text-[13px] leading-relaxed",
    isAuthor
      ? "rounded-br-[6px] bg-primary text-primary-foreground"
      : "rounded-bl-[6px] bg-muted text-foreground"
  )

  return (
    <div
      className={cn(
        "group flex w-full items-end gap-2",
        isAuthor ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div className="shrink-0 pb-0.5">
        <AssigneeAvatar assignee={authorAssignee} size={24} />
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-col gap-1",
          isAuthor ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "flex items-baseline gap-1.5 px-1 text-[11px]",
            isAuthor ? "flex-row-reverse" : "flex-row"
          )}
        >
          <span className="font-medium text-foreground/80">
            {authorAssignee.name}
          </span>
          <span className="text-muted-foreground/70">
            {formatTimestamp(comment.createdAt)}
            {comment.editedAt ? " · edited" : ""}
          </span>
        </div>

        <div
          className={cn(
            "flex items-end gap-1",
            isAuthor ? "flex-row-reverse" : "flex-row"
          )}
        >
          <div className={bubbleClass}>
            <TaskCommentBody markdown={comment.bodyMarkdown} />
          </div>

          {isAuthor && canComment ? (
            <div className="opacity-0 transition-opacity group-hover:opacity-100">
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Comment actions"
                  className="flex h-6 w-6 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                >
                  <DotsThree size={14} weight="bold" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  <DropdownMenuItem onClick={onStartEdit}>
                    <PencilSimple size={12} />
                    <span>Edit</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      void onDelete()
                    }}
                    variant="destructive"
                  >
                    <Trash size={12} />
                    <span>Delete</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => {
            void onToggleReaction()
          }}
          disabled={!canComment || !currentUserId}
          aria-pressed={userReacted}
          className={cn(
            "inline-flex h-[20px] min-w-[34px] items-center justify-center gap-1 rounded-full border px-1.5 text-[10.5px] transition-colors",
            userReacted
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-sidebar-border bg-background text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-40",
            thumbs.length === 0 &&
              "opacity-0 group-hover:opacity-100 aria-pressed:opacity-100"
          )}
        >
          <ThumbsUp size={11} weight={userReacted ? "fill" : "regular"} />
          <span className="inline-block min-w-[8px] text-center leading-none tabular-nums">
            {thumbs.length > 0 ? thumbs.length : ""}
          </span>
        </button>
      </div>
    </div>
  )
}
