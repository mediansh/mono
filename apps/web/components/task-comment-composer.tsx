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
import { useQuery } from "convex/react"
import { PaperPlaneRight } from "@phosphor-icons/react"
import { cn } from "@workspace/ui/lib/utils"
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
  onSubmit: (payload: { markdown: string; mentionedUserIds: string[] }) => void
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
  "min-h-[64px] max-w-none px-3 py-2 text-[13px] text-foreground focus:outline-none",
  "[&_p]:my-1 [&_p]:leading-relaxed",
  "[&_strong]:font-semibold",
  "[&_em]:italic",
  "[&_code]:rounded-[3px] [&_code]:bg-sidebar-accent [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-[6px] [&_pre]:bg-sidebar-accent [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-[12px]",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-sidebar-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  ".mention-chip:inline-flex"
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
      return all
        .filter((m) => m.name.toLowerCase().includes(q))
        .slice(0, 8)
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
          Mention.configure({
            HTMLAttributes: {
              class:
                "mention-chip inline-flex items-center rounded-[4px] bg-primary/10 px-1 py-px text-[12px] font-medium text-primary",
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
                      setActiveIndex(
                        (i) => (i - 1 + list.length) % list.length
                      )
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

    const handleSubmit = useCallback(() => {
      if (!editor || disabled) return
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

      onSubmit({
        markdown,
        mentionedUserIds: Array.from(mentioned),
      })
      editor.commands.clearContent()
      setIsEmpty(true)
    }, [editor, disabled, onSubmit])

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
      }
    }

    return (
      <div className="relative">
        <div
          className={cn(
            "overflow-hidden rounded-[6px] border border-sidebar-border bg-background",
            disabled && "opacity-60"
          )}
          onKeyDown={onKeyDown}
        >
          <div ref={hostRef} />
          <div className="flex items-center justify-between gap-2 border-t border-sidebar-border bg-sidebar/40 px-2 py-1.5">
            <span className="text-[10.5px] text-muted-foreground">
              Markdown supported · ⌘↵ to send · @ to mention
            </span>
            <div className="flex items-center gap-1">
              {onCancel ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-[4px] px-2 py-1 text-[11.5px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                >
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={disabled || isEmpty}
                className={cn(
                  "inline-flex items-center gap-1 rounded-[4px] bg-primary px-2 py-1 text-[11.5px] font-medium text-primary-foreground",
                  "hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
                )}
              >
                <PaperPlaneRight size={11} weight="fill" />
                {submitLabel}
              </button>
            </div>
          </div>
        </div>
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

  const top = state.rect.bottom + 4
  const left = state.rect.left

  return createPortal(
    <div
      className="fixed z-[1000] w-[220px] overflow-hidden rounded-[6px] border border-border bg-popover shadow-lg"
      style={{ top, left }}
      role="listbox"
    >
      <div className="max-h-[240px] overflow-y-auto py-1">
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
                "flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px]",
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
