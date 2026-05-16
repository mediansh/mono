import Link from "next/link"
import type { ReactNode } from "react"
import { cn } from "@workspace/ui/lib/utils"

type Mark = {
  type: string
  attrs?: Record<string, unknown>
}

type Node = {
  type: string
  attrs?: Record<string, unknown>
  content?: Node[]
  text?: string
  marks?: Mark[]
}

function renderMarks(text: string, marks: Mark[] | undefined, key: string): ReactNode {
  if (!marks || marks.length === 0) return text
  return marks.reduce<ReactNode>((acc, mark, i) => {
    const markKey = `${key}-m${i}`
    switch (mark.type) {
      case "bold":
        return <strong key={markKey}>{acc}</strong>
      case "italic":
        return <em key={markKey}>{acc}</em>
      case "strike":
        return <s key={markKey}>{acc}</s>
      case "code":
        return (
          <code
            key={markKey}
            className="rounded-[6px] bg-foreground/[0.06] px-1 py-0.5 font-mono text-[0.85em]"
          >
            {acc}
          </code>
        )
      case "link": {
        const href = (mark.attrs?.href as string) ?? "#"
        const isExternal = /^https?:\/\//.test(href)
        return (
          <Link
            key={markKey}
            href={href}
            {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="text-foreground underline underline-offset-2 transition-colors hover:text-foreground/70"
          >
            {acc}
          </Link>
        )
      }
      default:
        return acc
    }
  }, text)
}

function renderChildren(nodes: Node[] | undefined, keyPrefix: string): ReactNode[] {
  if (!nodes) return []
  return nodes.map((node, i) => renderNode(node, `${keyPrefix}-${i}`))
}

function renderNode(node: Node, key: string): ReactNode {
  switch (node.type) {
    case "doc":
      return <>{renderChildren(node.content, key)}</>

    case "paragraph":
      return (
        <p key={key} className="my-4 text-sm leading-7 text-muted-foreground">
          {renderChildren(node.content, key)}
        </p>
      )

    case "heading": {
      const level = (node.attrs?.level as number) ?? 2
      const common = "mt-10 mb-3 font-semibold tracking-tight text-foreground"
      if (level === 1) {
        return (
          <h2 key={key} className={cn(common, "text-xl")}>
            {renderChildren(node.content, key)}
          </h2>
        )
      }
      if (level === 2) {
        return (
          <h3 key={key} className={cn(common, "text-base")}>
            {renderChildren(node.content, key)}
          </h3>
        )
      }
      return (
        <h4 key={key} className={cn(common, "text-sm")}>
          {renderChildren(node.content, key)}
        </h4>
      )
    }

    case "bulletList":
      return (
        <ul key={key} className="my-4 space-y-2">
          {renderChildren(node.content, key)}
        </ul>
      )

    case "orderedList":
      return (
        <ol key={key} className="my-4 list-decimal space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
          {renderChildren(node.content, key)}
        </ol>
      )

    case "listItem": {
      // In bullet lists we render a custom bullet; in ordered lists we
      // rely on list-decimal styling on the parent.
      const children = renderChildren(node.content, key)
      return (
        <li key={key} className="flex gap-3 text-sm leading-7 text-muted-foreground">
          <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/25" />
          <div className="min-w-0 flex-1 [&>p]:my-0">{children}</div>
        </li>
      )
    }

    case "blockquote":
      return (
        <blockquote
          key={key}
          className="my-5 border-l-2 border-foreground/15 pl-4 text-sm leading-7 text-muted-foreground [&>p]:my-2"
        >
          {renderChildren(node.content, key)}
        </blockquote>
      )

    case "codeBlock":
      return (
        <pre
          key={key}
          className="my-5 overflow-x-auto rounded-[10px] bg-foreground/[0.04] p-4 font-mono text-[13px] leading-6 text-foreground"
        >
          <code>{renderChildren(node.content, key)}</code>
        </pre>
      )

    case "horizontalRule":
      return <hr key={key} className="my-8 border-foreground/[0.08]" />

    case "hardBreak":
      return <br key={key} />

    case "text":
      return <span key={key}>{renderMarks(node.text ?? "", node.marks, key)}</span>

    default:
      return null
  }
}

export function TiptapContent({ json }: { json: string }) {
  let doc: Node | null = null
  try {
    doc = JSON.parse(json) as Node
  } catch {
    doc = null
  }
  if (!doc) return null
  return <div className="tiptap-content">{renderNode(doc, "n")}</div>
}
