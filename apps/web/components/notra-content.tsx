"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@workspace/ui/lib/utils"

export function NotraContent({
  markdown,
  className,
}: {
  markdown: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "notra-content max-w-none text-sm leading-7 text-muted-foreground",
        "[&_p]:my-4",
        "[&_h1]:mt-10 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-foreground",
        "[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground",
        "[&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:tracking-tight [&_h3]:text-foreground",
        "[&_h4]:mt-6 [&_h4]:mb-2 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:tracking-tight [&_h4]:text-foreground",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_em]:italic",
        "[&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_a]:transition-colors hover:[&_a]:text-foreground/70",
        "[&_code]:rounded-[3px] [&_code]:bg-foreground/[0.06] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
        "[&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:rounded-[6px] [&_pre]:bg-foreground/[0.04] [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-[12px] [&_pre]:leading-6 [&_pre]:text-foreground",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
        "[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
        "[&_li]:marker:text-foreground/30",
        "[&_blockquote]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-foreground/15 [&_blockquote]:pl-4",
        "[&_hr]:my-8 [&_hr]:border-foreground/[0.08]",
        "[&_img]:my-6 [&_img]:rounded-[6px]",
        "[&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left",
        "[&_th]:border-b [&_th]:border-foreground/[0.08] [&_th]:px-2 [&_th]:py-2 [&_th]:font-semibold [&_th]:text-foreground",
        "[&_td]:border-b [&_td]:border-foreground/[0.04] [&_td]:px-2 [&_td]:py-2",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ children, href }) {
            const isExternal = typeof href === "string" && /^https?:\/\//.test(href)
            return (
              <a
                href={href}
                {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
