"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Gear, Key, Tag, Users } from "@phosphor-icons/react"

const settingsNav = [
  { label: "General", href: "/app/settings", icon: Gear },
  { label: "Labels", href: "/app/settings/labels", icon: Tag },
  { label: "Members", href: "/app/settings/members", icon: Users },
  { label: "API Keys", href: "/app/settings/api-keys", icon: Key },
]

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const pathname = usePathname()

  useEffect(() => {
    document.title = "Settings — Median"
  }, [pathname])

  return (
    <div className="flex h-screen flex-col overflow-hidden md:flex-row">
      {/* Settings sub-sidebar — stacks above content on mobile, sidebar on md+ */}
      <div className="flex shrink-0 flex-col border-b border-sidebar-border bg-sidebar md:w-52 md:border-r md:border-b-0">
        {/* Title — hidden on mobile to keep nav compact */}
        <div className="hidden px-3 pt-3 pb-1 md:block">
          <h1 className="text-[13px] font-semibold">Settings</h1>
        </div>

        {/* Navigation — horizontal scroll on mobile, vertical list on md+ */}
        <nav className="flex gap-0.5 overflow-x-auto p-1.5 scrollbar-hide md:flex-col md:overflow-visible">
          {settingsNav.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex shrink-0 items-center gap-2 rounded-[4px] px-2 py-1 text-[13px] font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-foreground ring-1 ring-sidebar-border"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                }`}
              >
                <item.icon
                  size={15}
                  weight={isActive ? "fill" : "regular"}
                  className={
                    isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                  }
                />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Page content */}
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
