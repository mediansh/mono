"use client"

import { useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@workspace/ui/lib/utils"

type Props = {
  markdown: string
  className?: string
}

const MENTION_REGEX = /@\[([^\]]+)\]\(([^)\s]+)\)/g

// Replace `@[name](id)` tokens with `@name` rendered as a styled chip via a
// custom backtick fenced span. We do this by transforming the markdown source
// into a custom inline span using HTML — but since react-markdown disables raw
// HTML by default, we instead emit a marker that we intercept via a custom
// component. We use the `code` inline mark trick: `\`@@MENTION:name:id@@\``.
// At render time we detect this exact shape and render it as a chip.
function encodeMentions(input: string): string {
  return input.replace(MENTION_REGEX, (_match, name: string, id: string) => {
    const safeName = name.replace(/`/g, "")
    const safeId = id.replace(/`/g, "")
    return `\`@@MENTION:${safeId}:${safeName}@@\``
  })
}

function MentionChip({ name }: { name: string }) {
  return (
    <span className="mention-chip mx-px inline-flex items-baseline rounded-[4px] bg-primary/10 px-1 py-px text-[12px] font-medium text-primary">
      @{name}
    </span>
  )
}

export function TaskCommentBody({ markdown, className }: Props) {
  const transformed = useMemo(() => encodeMentions(markdown), [markdown])
  return (
    <div
      className={cn(
        "max-w-none text-[13px] leading-relaxed text-foreground",
        "[&_p]:my-1",
        "[&_h1]:my-2 [&_h1]:text-[16px] [&_h1]:font-semibold",
        "[&_h2]:my-2 [&_h2]:text-[14px] [&_h2]:font-semibold",
        "[&_h3]:my-1 [&_h3]:text-[13px] [&_h3]:font-semibold",
        "[&_strong]:font-semibold",
        "[&_em]:italic",
        "[&_code]:rounded-[3px] [&_code]:bg-sidebar-accent [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px]",
        "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-[6px] [&_pre]:bg-sidebar-accent [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-[12px]",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
        "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:my-0.5",
        "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-sidebar-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_table]:my-2 [&_table]:border-collapse",
        "[&_th]:border [&_th]:border-sidebar-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
        "[&_td]:border [&_td]:border-sidebar-border [&_td]:px-2 [&_td]:py-1",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ children, className: codeClassName, ...rest }) {
            const text = Array.isArray(children) ? children.join("") : String(children ?? "")
            const match = /^@@MENTION:([^:]+):(.+)@@$/.exec(text)
            if (match && !codeClassName) {
              return <MentionChip name={match[2] ?? match[1] ?? ""} />
            }
            return (
              <code className={codeClassName} {...rest}>
                {children}
              </code>
            )
          },
          a({ children, href }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            )
          },
        }}
      >
        {transformed}
      </ReactMarkdown>
    </div>
  )
}
