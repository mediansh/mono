"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Settings01Icon,
  Tag01Icon,
  UserMultiple02Icon,
  ArrowLeft01Icon,
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

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Settings header bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm"
      >
        <div className="mx-auto w-full max-w-2xl px-8">
          {/* Back + title row */}
          <div className="flex items-center gap-3 pb-3 pt-6">
            <Link
              href="/app"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
            </Link>
            <h1 className="text-lg font-semibold">Settings</h1>
          </div>

          {/* Tab navigation */}
          <nav className="flex gap-1">
            {settingsNav.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors"
                >
                  <HugeiconsIcon
                    icon={item.icon}
                    size={15}
                    strokeWidth={1.5}
                    className={
                      isActive
                        ? "text-[#0496FF]"
                        : "text-muted-foreground"
                    }
                  />
                  <span
                    className={
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }
                  >
                    {item.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="settings-tab-active"
                      className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#0496FF]"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                </Link>
              )
            })}
          </nav>
        </div>
      </motion.div>

      {/* Page content */}
      <div className="flex-1">{children}</div>
    </div>
  )
}
