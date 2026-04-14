"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import { Article, Key, Megaphone, ShieldCheck } from "@phosphor-icons/react"
import { api } from "@/convex/_generated/api"

const adminNav = [
  { label: "Overview", href: "/app/admin", icon: ShieldCheck, match: "exact" as const },
  { label: "Blog", href: "/app/admin/blog", icon: Article, match: "prefix" as const },
  { label: "Changelog", href: "/app/admin/changelog", icon: Megaphone, match: "prefix" as const },
  { label: "Early access", href: "/app/admin/early-access", icon: Key, match: "prefix" as const },
]

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const pathname = usePathname()
  const router = useRouter()
  const isAdmin = useQuery(api.admins.isCurrentUserAdmin)

  useEffect(() => {
    if (isAdmin === false) {
      router.replace("/app")
    }
  }, [isAdmin, router])

  useEffect(() => {
    document.title = "Admin — Median"
  }, [pathname])

  if (isAdmin === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-[12px] text-muted-foreground">Loading…</div>
      </div>
    )
  }

  if (isAdmin === false) {
    return null
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Admin sub-sidebar */}
      <div className="flex w-52 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="px-3 pb-1 pt-3">
          <h1 className="text-[13px] font-semibold">Admin</h1>
        </div>

        <nav className="flex flex-col gap-0.5 p-1.5">
          {adminNav.map((item) => {
            const isActive =
              item.match === "exact" ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center gap-2 rounded-[4px] px-2 py-1 text-[13px] font-medium transition-colors ${
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

      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
