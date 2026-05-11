"use client"

import { useMemo, useState } from "react"
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
      <header className="flex shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar/30 px-4 py-2">
        <ChatCircle size={14} className="text-muted-foreground" />
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Comments
        </h3>
        <span className="text-[11px] text-muted-foreground">
          {ordered.length}
        </span>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        {comments === undefined ? (
          <p className="text-[12px] text-muted-foreground">Loading…</p>
        ) : ordered.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            No comments yet. Start the conversation.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
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
        <div className="shrink-0 border-t border-sidebar-border bg-sidebar/20 px-4 py-3">
          <TaskCommentComposer
            workspaceId={workspaceId}
            onSubmit={handleCreate}
            disabled={submitting}
          />
        </div>
      ) : (
        <div className="shrink-0 border-t border-sidebar-border bg-sidebar/20 px-4 py-3 text-[11.5px] text-muted-foreground">
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
    currentUserId !== null &&
    thumbs.some((r) => r.userId === currentUserId)

  const authorAssignee = {
    userId: comment.authorId,
    name: comment.authorName ?? "Member",
    imageUrl: comment.authorImageUrl ?? undefined,
  }

  return (
    <div className="group flex gap-2.5">
      <div className="pt-0.5">
        <AssigneeAvatar assignee={authorAssignee} size={24} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[12.5px] font-medium text-foreground">
            {authorAssignee.name}
          </span>
          <span className="text-[10.5px] text-muted-foreground">
            {formatTimestamp(comment.createdAt)}
            {comment.editedAt ? " · edited" : ""}
          </span>
          {isAuthor && canComment && !isEditing ? (
            <div className="ml-auto opacity-0 transition-opacity group-hover:opacity-100">
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Comment actions"
                  className="flex h-6 w-6 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
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

        {isEditing ? (
          <div className="mt-1">
            <TaskCommentComposer
              key={`edit-${comment._id}`}
              workspaceId={workspaceId}
              initialMarkdown={comment.bodyMarkdown}
              submitLabel="Save"
              onSubmit={onSaveEdit}
              onCancel={onCancelEdit}
            />
          </div>
        ) : (
          <>
            <div className="mt-0.5">
              <TaskCommentBody markdown={comment.bodyMarkdown} />
            </div>
            <div className="mt-1.5 flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  void onToggleReaction()
                }}
                disabled={!canComment || !currentUserId}
                aria-pressed={userReacted}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px] transition-colors",
                  userReacted
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-sidebar-border bg-background text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                  "disabled:pointer-events-none disabled:opacity-40"
                )}
              >
                <ThumbsUp
                  size={11}
                  weight={userReacted ? "fill" : "regular"}
                />
                {thumbs.length > 0 ? <span>{thumbs.length}</span> : null}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
