"use client"

import { useRef } from "react"
import {
  useEditor,
  useEditorState,
  EditorContent,
  type Editor,
} from "@tiptap/react"
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
   * this prop after mount has no effect (use `key` to force a remount).
   */
  defaultValue?: RichTextValue
  onChange: (value: RichTextValue) => void
  placeholder?: string
  className?: string
}

function parseInitial(value: RichTextValue | undefined) {
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
  // Keep the latest onChange in a ref so the editor's onUpdate closure
  // (created once) always calls the current callback.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const editor = useEditor({
    immediatelyRender: false,
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
    ],
    content: parseInitial(defaultValue),
    onUpdate: ({ editor }) => {
      onChangeRef.current(JSON.stringify(editor.getJSON()))
    },
    editorProps: {
      attributes: {
        class: cn(
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
        ),
      },
    },
  })

  if (!editor) {
    return (
      <div
        className={cn(
          "rounded-[6px] border border-sidebar-border bg-background",
          className,
        )}
      >
        <div className="h-[46px] border-b border-sidebar-border" />
        <div className="min-h-[300px] px-4 py-3 text-[13px] text-muted-foreground">
          Loading editor…
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[6px] border border-sidebar-border bg-background",
        className,
      )}
    >
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: (ctx) => ({
      isH1: ctx.editor.isActive("heading", { level: 1 }),
      isH2: ctx.editor.isActive("heading", { level: 2 }),
      isH3: ctx.editor.isActive("heading", { level: 3 }),
      isBold: ctx.editor.isActive("bold"),
      isItalic: ctx.editor.isActive("italic"),
      isStrike: ctx.editor.isActive("strike"),
      isCode: ctx.editor.isActive("code"),
      isBulletList: ctx.editor.isActive("bulletList"),
      isOrderedList: ctx.editor.isActive("orderedList"),
      isBlockquote: ctx.editor.isActive("blockquote"),
      isLink: ctx.editor.isActive("link"),
      canUndo: ctx.editor.can().undo(),
      canRedo: ctx.editor.can().redo(),
    }),
  })

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined
    const url = window.prompt("URL", prev ?? "https://")
    if (url === null) return
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-sidebar-border bg-sidebar/40 px-1.5 py-1.5">
      <Group>
        <TBtn
          label="Heading 1"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={state.isH1}
        >
          <TextHOne size={14} />
        </TBtn>
        <TBtn
          label="Heading 2"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={state.isH2}
        >
          <TextHTwo size={14} />
        </TBtn>
        <TBtn
          label="Heading 3"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={state.isH3}
        >
          <TextHThree size={14} />
        </TBtn>
      </Group>
      <Divider />
      <Group>
        <TBtn
          label="Bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={state.isBold}
        >
          <TextB size={14} />
        </TBtn>
        <TBtn
          label="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={state.isItalic}
        >
          <TextItalic size={14} />
        </TBtn>
        <TBtn
          label="Strike"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={state.isStrike}
        >
          <TextStrikethrough size={14} />
        </TBtn>
        <TBtn
          label="Inline code"
          onClick={() => editor.chain().focus().toggleCode().run()}
          active={state.isCode}
        >
          <Code size={14} />
        </TBtn>
      </Group>
      <Divider />
      <Group>
        <TBtn
          label="Bulleted list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={state.isBulletList}
        >
          <ListBullets size={14} />
        </TBtn>
        <TBtn
          label="Numbered list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={state.isOrderedList}
        >
          <ListNumbers size={14} />
        </TBtn>
        <TBtn
          label="Blockquote"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={state.isBlockquote}
        >
          <Quotes size={14} />
        </TBtn>
        <TBtn label="Link" onClick={setLink} active={state.isLink}>
          <LinkSimple size={14} />
        </TBtn>
      </Group>
      <Divider />
      <Group>
        <TBtn
          label="Undo"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!state.canUndo}
        >
          <ArrowCounterClockwise size={14} />
        </TBtn>
        <TBtn
          label="Redo"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!state.canRedo}
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
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-[4px] text-muted-foreground transition-colors",
        "hover:bg-sidebar-accent hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-40",
        active && "bg-sidebar-accent text-foreground ring-1 ring-sidebar-border",
      )}
    >
      {children}
    </button>
  )
}
