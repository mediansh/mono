"use client"

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from "react"
import { createPortal } from "react-dom"
import { Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import Mention from "@tiptap/extension-mention"
import { Markdown } from "tiptap-markdown"

// Register a markdown serializer for the Mention node so tiptap-markdown emits
// `@[name](id)` instead of the default `[mention]` placeholder.
const MentionWithMarkdown = Mention.extend({
  addStorage() {
    return {
      ...this.parent?.(),
      markdown: {
        serialize(
          state: { write: (text: string) => void },
          node: { attrs: { id?: string; label?: string } }
        ) {
          const id = node.attrs.id ?? ""
          const label = node.attrs.label ?? id
          state.write(`@[${label}](${id})`)
        },
        parse: {},
      },
    }
  },
})
import { useQuery } from "convex/react"
import { PaperPlaneRight } from "@phosphor-icons/react"
import { cn } from "@workspace/ui/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { AssigneeAvatar } from "@/components/assignee-picker"

export type ComposerMember = {
  userId: string
  name: string
  imageUrl: string | null
}

export type CommentComposerHandle = {
  focus: () => void
}

type Props = {
  workspaceId: Id<"workspaces">
  placeholder?: string
  initialMarkdown?: string
  submitLabel?: string
  onSubmit: (payload: {
    markdown: string
    mentionedUserIds: string[]
  }) => Promise<void> | void
  onCancel?: () => void
  disabled?: boolean
}

type SuggestionState = {
  visible: boolean
  query: string
  rect: { left: number; top: number; bottom: number } | null
  command: ((item: { id: string; label: string }) => void) | null
}

const editorContentClass = cn(
  "min-h-[20px] max-w-[100%] max-h-[140px] overflow-y-auto text-[13.5px] leading-relaxed text-foreground focus:outline-none",
  "[&_p]:my-1 [&_p]:leading-relaxed",
  "[&_h1]:my-2 [&_h1]:text-[17px] [&_h1]:font-semibold",
  "[&_h2]:my-2 [&_h2]:text-[15px] [&_h2]:font-semibold",
  "[&_h3]:my-1 [&_h3]:text-[14px] [&_h3]:font-semibold",
  "[&_strong]:font-semibold",
  "[&_em]:italic",
  "[&_s]:line-through",
  "[&_code]:rounded-[6px] [&_code]:bg-sidebar-accent [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-[10px] [&_pre]:bg-sidebar-accent [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-[13px]",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-sidebar-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_hr]:my-3 [&_hr]:border-sidebar-border"
)

export const TaskCommentComposer = forwardRef<CommentComposerHandle, Props>(
  function TaskCommentComposer(
    {
      workspaceId,
      placeholder = "Write a comment… use @ to mention",
      initialMarkdown,
      submitLabel = "Comment",
      onSubmit,
      onCancel,
      disabled,
    },
    ref
  ) {
    const hostRef = useRef<HTMLDivElement | null>(null)
    const [editor, setEditor] = useState<Editor | null>(null)
    const [isEmpty, setIsEmpty] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)

    const members = useQuery(api.workspaces.getAssignableMembers, {
      workspaceId,
    })

    const memberListRef = useRef<ComposerMember[]>([])
    useEffect(() => {
      memberListRef.current = (members ?? []).map((m) => ({
        userId: m.userId,
        name: m.name,
        imageUrl: m.imageUrl ?? null,
      }))
    }, [members])

    const [suggestion, setSuggestion] = useState<SuggestionState>({
      visible: false,
      query: "",
      rect: null,
      command: null,
    })
    const [activeIndex, setActiveIndex] = useState(0)

    const filteredMembers = useMemo(() => {
      const q = suggestion.query.trim().toLowerCase()
      const all = memberListRef.current
      if (!q) return all.slice(0, 8)
      return all.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8)
    }, [suggestion.query, members])

    useEffect(() => {
      setActiveIndex(0)
    }, [suggestion.query, suggestion.visible])

    const activeIndexRef = useRef(0)
    activeIndexRef.current = activeIndex
    const filteredRef = useRef(filteredMembers)
    filteredRef.current = filteredMembers
    const suggestionRef = useRef(suggestion)
    suggestionRef.current = suggestion

    useEffect(() => {
      if (!hostRef.current) return

      const instance = new Editor({
        element: hostRef.current,
        extensions: [
          StarterKit.configure({
            heading: { levels: [1, 2, 3] },
          }),
          Link.configure({
            openOnClick: false,
            autolink: true,
            HTMLAttributes: {
              class: "text-primary underline underline-offset-2",
            },
          }),
          Placeholder.configure({
            placeholder,
            emptyEditorClass:
              "before:text-muted-foreground before:float-left before:h-0 before:pointer-events-none before:content-[attr(data-placeholder)]",
          }),
          Markdown.configure({
            html: false,
            tightLists: true,
            linkify: true,
            breaks: true,
            transformPastedText: true,
          }),
          MentionWithMarkdown.configure({
            HTMLAttributes: {
              class:
                "mention-chip inline-flex items-center rounded-[8px] bg-primary/10 px-1 py-px text-[13px] font-medium text-primary",
            },
            renderHTML({ options, node }) {
              return [
                "span",
                options.HTMLAttributes,
                `@${node.attrs.label ?? node.attrs.id}`,
              ]
            },
            // Markdown serializer for tiptap-markdown — store mentions as
            // `@[name](id)` so we can validate and re-render them later.
            renderText({ node }) {
              const label = node.attrs.label ?? node.attrs.id
              return `@[${label}](${node.attrs.id})`
            },
            suggestion: {
              char: "@",
              items: ({ query }) => {
                const q = query.trim().toLowerCase()
                const all = memberListRef.current
                const list = q
                  ? all.filter((m) => m.name.toLowerCase().includes(q))
                  : all
                return list.slice(0, 8).map((m) => ({
                  id: m.userId,
                  label: m.name,
                }))
              },
              render: () => {
                let currentRange: { from: number; to: number } | null = null

                function updateState(props: {
                  query: string
                  clientRect?: (() => DOMRect | null) | null
                  command: (item: { id: string; label: string }) => void
                  range: { from: number; to: number }
                }) {
                  currentRange = props.range
                  const rect = props.clientRect?.()
                  setSuggestion({
                    visible: true,
                    query: props.query,
                    rect: rect
                      ? {
                          left: rect.left,
                          top: rect.top,
                          bottom: rect.bottom,
                        }
                      : null,
                    command: props.command,
                  })
                }

                return {
                  onStart: (props) => {
                    updateState(props as never)
                  },
                  onUpdate: (props) => {
                    updateState(props as never)
                  },
                  onKeyDown: (props) => {
                    const evt = props.event
                    const list = filteredRef.current
                    if (!suggestionRef.current.visible || list.length === 0) {
                      return false
                    }
                    if (evt.key === "ArrowDown") {
                      setActiveIndex((i) => (i + 1) % list.length)
                      return true
                    }
                    if (evt.key === "ArrowUp") {
                      setActiveIndex((i) => (i - 1 + list.length) % list.length)
                      return true
                    }
                    if (evt.key === "Enter" || evt.key === "Tab") {
                      const item = list[activeIndexRef.current]
                      const command = suggestionRef.current.command
                      if (item && command) {
                        command({ id: item.userId, label: item.name })
                      }
                      return true
                    }
                    if (evt.key === "Escape") {
                      setSuggestion({
                        visible: false,
                        query: "",
                        rect: null,
                        command: null,
                      })
                      return true
                    }
                    return false
                  },
                  onExit: () => {
                    currentRange = null
                    setSuggestion({
                      visible: false,
                      query: "",
                      rect: null,
                      command: null,
                    })
                  },
                }
              },
            },
          }),
        ],
        editorProps: {
          attributes: {
            class: editorContentClass,
          },
        },
        onUpdate: ({ editor }) => {
          setIsEmpty(editor.isEmpty)
        },
      })

      // Apply initial markdown if provided. Tiptap-markdown adds setContent
      // markdown support automatically.
      if (initialMarkdown) {
        instance.commands.setContent(initialMarkdown)
        setIsEmpty(instance.isEmpty)
      }

      setEditor(instance)

      return () => {
        instance.destroy()
        setEditor(null)
      }
      // We intentionally do not depend on `initialMarkdown` after mount —
      // the composer is uncontrolled by contract; remount via key to reset.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          editor?.commands.focus()
        },
      }),
      [editor]
    )

    const handleSubmit = useCallback(async () => {
      if (!editor || disabled || isSubmitting) return
      const storage = (
        editor.storage as unknown as {
          markdown?: { getMarkdown?: () => string }
        }
      ).markdown
      const markdown = (storage?.getMarkdown?.() ?? "").trim()
      if (!markdown) return

      const mentioned = new Set<string>()
      editor.state.doc.descendants((node) => {
        if (node.type.name === "mention") {
          const id = node.attrs.id as string | undefined
          if (id) mentioned.add(id)
        }
      })

      setIsSubmitting(true)
      setSubmitError(null)
      try {
        await Promise.resolve(
          onSubmit({
            markdown,
            mentionedUserIds: Array.from(mentioned),
          })
        )
        editor.commands.clearContent()
        setIsEmpty(true)
      } catch (error) {
        setSubmitError(
          error instanceof Error ? error.message : "Failed to save comment"
        )
      } finally {
        setIsSubmitting(false)
      }
    }, [editor, disabled, isSubmitting, onSubmit])

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        void handleSubmit()
      }
    }

    const isEditMode = onCancel !== undefined

    return (
      <div className="relative">
        <div
          className={cn(
            "group/composer flex items-center gap-1 rounded-[20px] border border-sidebar-border bg-muted/40 py-1 px-3 transition-colors focus-within:border-ring/40 focus-within:bg-background",
            disabled && "opacity-60"
          )}
          onKeyDown={onKeyDown}
        >
          <div ref={hostRef} className="min-w-0 flex-1" />
          <div className="flex shrink-0 items-center gap-1">
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex h-7 items-center rounded-full px-2 text-[11.5px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              >
                Cancel
              </button>
            ) : null}
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => {
                      void handleSubmit()
                    }}
                    disabled={disabled || isEmpty || isSubmitting}
                    aria-label={submitLabel}
                    className={cn(
                      "inline-flex h-7 items-center justify-center gap-1 rounded-full bg-primary text-primary-foreground transition-all",
                      isEditMode ? "px-2.5 text-[11.5px] font-medium" : "w-7",
                      "hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
                    )}
                  />
                }
              >
                <PaperPlaneRight size={12} weight="fill" />
                {isEditMode ? <span>{submitLabel}</span> : null}
              </TooltipTrigger>
              <TooltipContent side="top" align="end">
                ⌘↵ to send · @ to mention · Markdown supported
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        {submitError ? (
          <p className="mt-1 px-2 text-[10.5px] text-destructive">
            {submitError}
          </p>
        ) : null}
        <MentionSuggestionDropdown
          state={suggestion}
          members={filteredMembers}
          activeIndex={activeIndex}
          onPick={(member) => {
            suggestion.command?.({ id: member.userId, label: member.name })
          }}
          onHover={setActiveIndex}
        />
      </div>
    )
  }
)

function MentionSuggestionDropdown({
  state,
  members,
  activeIndex,
  onPick,
  onHover,
}: {
  state: SuggestionState
  members: ComposerMember[]
  activeIndex: number
  onPick: (member: ComposerMember) => void
  onHover: (index: number) => void
}) {
  if (typeof document === "undefined") return null
  if (!state.visible || !state.rect) return null
  if (members.length === 0) return null

  const DROPDOWN_MAX_HEIGHT = 240
  const viewportHeight =
    typeof window !== "undefined" ? window.innerHeight : 1000
  const spaceBelow = viewportHeight - state.rect.bottom
  const placeAbove =
    spaceBelow < DROPDOWN_MAX_HEIGHT + 8 && state.rect.top > spaceBelow

  const positionStyle: React.CSSProperties = placeAbove
    ? {
        bottom: viewportHeight - state.rect.top + 4,
        left: state.rect.left,
        maxHeight: Math.max(120, state.rect.top - 12),
      }
    : {
        top: state.rect.bottom + 4,
        left: state.rect.left,
        maxHeight: Math.max(120, spaceBelow - 12),
      }

  return createPortal(
    <div
      className="fixed z-[1000] flex w-[220px] flex-col overflow-hidden rounded-[10px] border border-border bg-popover shadow-lg"
      style={positionStyle}
      role="listbox"
    >
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {members.map((m, idx) => {
          const active = idx === activeIndex
          return (
            <button
              key={m.userId}
              type="button"
              role="option"
              aria-selected={active}
              onMouseDown={(e) => {
                e.preventDefault()
                onPick(m)
              }}
              onMouseEnter={() => onHover(idx)}
              className={cn(
                "flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px]",
                active ? "bg-accent text-foreground" : "text-foreground/90"
              )}
            >
              <AssigneeAvatar
                assignee={{
                  userId: m.userId,
                  name: m.name,
                  imageUrl: m.imageUrl ?? undefined,
                }}
                size={18}
              />
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
            </button>
          )
        })}
      </div>
    </div>,
    document.body
  )
}
