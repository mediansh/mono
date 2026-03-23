"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Settings01Icon,
  Tag01Icon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons"
import { motion } from "motion/react"

const settingsNav = [
  { label: "General", href: "/app/settings", icon: Settings01Icon },
  { label: "Labels", href: "/app/settings/labels", icon: Tag01Icon },
  { label: "Members", href: "/app/settings/members", icon: UserMultiple02Icon },
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
    <div className="flex h-screen overflow-hidden">
      {/* Settings sub-sidebar */}
      <div className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        {/* Title */}
        <div className="px-4 pb-2 pt-4">
          <motion.h1
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="text-sm font-semibold"
          >
            Settings
          </motion.h1>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-0.5 px-2 pt-2">
          {settingsNav.map((item, i) => {
            const isActive = pathname === item.href
            return (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.25,
                  delay: 0.03 + i * 0.04,
                  ease: "easeOut",
                }}
              >
                <Link
                  href={item.href}
                  className={`group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[#0496FF]/10 text-[#0496FF]"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                  }`}
                >
                  <HugeiconsIcon
                    icon={item.icon}
                    size={15}
                    strokeWidth={1.75}
                    className={
                      isActive ? "text-[#0496FF]" : "text-muted-foreground group-hover:text-foreground"
                    }
                  />
                  <span>{item.label}</span>
                </Link>
              </motion.div>
            )
          })}
        </nav>
      </div>

      {/* Page content */}
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
