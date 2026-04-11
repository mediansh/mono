"use client"

import { useEffect, useReducer, useRef, useState } from "react"
import { Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import {
  TextB,
  TextItalic,
  TextStrikethrough,
  Code,
  ListBullets,
  ListNumbers,
  Quotes,
  TextHOne,
  TextHTwo,
  TextHThree,
  LinkSimple,
  ArrowCounterClockwise,
  ArrowClockwise,
} from "@phosphor-icons/react"
import { cn } from "@workspace/ui/lib/utils"

export type RichTextValue = string // TipTap JSON, stringified

type RichTextEditorProps = {
  /**
   * Initial content as stringified TipTap JSON. Uncontrolled — the editor
   * owns its content after mount and only emits via `onChange`. Changing
   * this prop after mount has no effect; remount via `key` instead.
   */
  defaultValue?: RichTextValue
  onChange: (value: RichTextValue) => void
  placeholder?: string
  className?: string
}

const editorContentClass = cn(
  "min-h-[300px] max-w-none px-4 py-3 text-[13px] text-foreground focus:outline-none",
  "[&_p]:my-2 [&_p]:leading-relaxed",
  "[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-[20px] [&_h1]:font-semibold [&_h1]:leading-tight",
  "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:leading-tight",
  "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:leading-tight",
  "[&_strong]:font-semibold",
  "[&_em]:italic",
  "[&_code]:rounded-[3px] [&_code]:bg-sidebar-accent [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px]",
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-[6px] [&_pre]:bg-sidebar-accent [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[12px]",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-sidebar-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_hr]:my-4 [&_hr]:border-sidebar-border",
)

function parseInitial(value: RichTextValue | undefined): object | undefined {
  if (!value) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

export function RichTextEditor({
  defaultValue,
  onChange,
  placeholder = "Start writing…",
  className,
}: RichTextEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)

  // Latest callback via ref so the editor doesn't need to be recreated.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Capture defaults once. Changing them after mount has no effect — this
  // component is uncontrolled by contract.
  const initialContentRef = useRef<object | undefined>(parseInitial(defaultValue))
  const placeholderRef = useRef(placeholder)

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
          placeholder: placeholderRef.current,
          emptyEditorClass:
            "before:text-muted-foreground before:float-left before:h-0 before:pointer-events-none before:content-[attr(data-placeholder)]",
        }),
      ],
      content: initialContentRef.current,
      editorProps: {
        attributes: {
          class: editorContentClass,
        },
      },
      onUpdate: ({ editor }) => {
        onChangeRef.current(JSON.stringify(editor.getJSON()))
      },
    })

    setEditor(instance)

    return () => {
      instance.destroy()
      setEditor(null)
    }
  }, [])

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[6px] border border-sidebar-border bg-background",
        className,
      )}
    >
      <Toolbar editor={editor} />
      <div ref={hostRef} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor | null }) {
  const [, forceRerender] = useReducer((n: number) => n + 1, 0)

  // Re-render toolbar whenever the editor state changes so `isActive` /
  // `can()` reads stay in sync with the document and selection.
  useEffect(() => {
    if (!editor) return
    const update = () => forceRerender()
    editor.on("transaction", update)
    editor.on("selectionUpdate", update)
    editor.on("focus", update)
    editor.on("blur", update)
    return () => {
      editor.off("transaction", update)
      editor.off("selectionUpdate", update)
      editor.off("focus", update)
      editor.off("blur", update)
    }
  }, [editor])

  const setLink = () => {
    if (!editor) return
    const prev = editor.getAttributes("link").href as string | undefined
    const url = window.prompt("URL", prev ?? "https://")
    if (url === null) return
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }

  const disabled = !editor
  const isActive = (name: string, attrs?: Record<string, unknown>) =>
    editor?.isActive(name, attrs) ?? false

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-sidebar-border bg-sidebar/40 px-1.5 py-1.5">
      <Group>
        <TBtn
          label="Heading 1"
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          active={isActive("heading", { level: 1 })}
        >
          <TextHOne size={14} />
        </TBtn>
        <TBtn
          label="Heading 2"
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          active={isActive("heading", { level: 2 })}
        >
          <TextHTwo size={14} />
        </TBtn>
        <TBtn
          label="Heading 3"
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          active={isActive("heading", { level: 3 })}
        >
          <TextHThree size={14} />
        </TBtn>
      </Group>
      <Divider />
      <Group>
        <TBtn
          label="Bold"
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={isActive("bold")}
        >
          <TextB size={14} />
        </TBtn>
        <TBtn
          label="Italic"
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={isActive("italic")}
        >
          <TextItalic size={14} />
        </TBtn>
        <TBtn
          label="Strike"
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          active={isActive("strike")}
        >
          <TextStrikethrough size={14} />
        </TBtn>
        <TBtn
          label="Inline code"
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleCode().run()}
          active={isActive("code")}
        >
          <Code size={14} />
        </TBtn>
      </Group>
      <Divider />
      <Group>
        <TBtn
          label="Bulleted list"
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={isActive("bulletList")}
        >
          <ListBullets size={14} />
        </TBtn>
        <TBtn
          label="Numbered list"
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          active={isActive("orderedList")}
        >
          <ListNumbers size={14} />
        </TBtn>
        <TBtn
          label="Blockquote"
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          active={isActive("blockquote")}
        >
          <Quotes size={14} />
        </TBtn>
        <TBtn label="Link" disabled={disabled} onClick={setLink} active={isActive("link")}>
          <LinkSimple size={14} />
        </TBtn>
      </Group>
      <Divider />
      <Group>
        <TBtn
          label="Undo"
          disabled={!editor?.can().undo()}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <ArrowCounterClockwise size={14} />
        </TBtn>
        <TBtn
          label="Redo"
          disabled={!editor?.can().redo()}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <ArrowClockwise size={14} />
        </TBtn>
      </Group>
    </div>
  )
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-sidebar-border" />
}

function TBtn({
  children,
  onClick,
  active,
  disabled,
  label,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active ? "true" : "false"}
      title={label}
      onMouseDown={(e) => {
        // Prevent the editor from losing its selection when clicking the
        // toolbar, and prevent the enclosing form from swallowing the click.
        e.preventDefault()
      }}
      onClick={(e) => {
        e.preventDefault()
        onClick()
      }}
      disabled={disabled}
      data-active={active ? "true" : undefined}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-[4px] text-muted-foreground transition-colors",
        "hover:bg-sidebar-accent hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-40",
        "data-[active=true]:bg-sidebar-accent data-[active=true]:text-foreground data-[active=true]:ring-1 data-[active=true]:ring-sidebar-border",
      )}
    >
      {children}
    </button>
  )
}
