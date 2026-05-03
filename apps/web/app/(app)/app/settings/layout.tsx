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
      {/* Settings sub-sidebar — desktop */}
      <div className="hidden w-52 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="px-3 pb-1 pt-3">
          <h1 className="text-[13px] font-semibold">Settings</h1>
        </div>

        <nav className="flex flex-col gap-0.5 p-1.5">
          {settingsNav.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center gap-2 rounded-[4px] px-2 py-1 text-[13px] font-medium transition-colors duration-150 ease-out active:bg-sidebar-border active:text-foreground ${
                  isActive
                    ? "bg-sidebar-accent text-foreground"
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

      {/* Settings top nav — mobile */}
      <div className="flex shrink-0 flex-col border-b border-sidebar-border bg-sidebar md:hidden">
        <nav className="flex gap-1 overflow-x-auto px-1.5 py-1.5 scrollbar-hide">
          {settingsNav.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex shrink-0 items-center gap-1.5 rounded-[4px] px-2 py-1 text-[13px] font-medium transition-colors duration-150 ease-out active:bg-sidebar-border active:text-foreground ${
                  isActive
                    ? "bg-sidebar-accent text-foreground"
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
