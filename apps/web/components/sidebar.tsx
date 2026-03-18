"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useClerk, useUser } from "@clerk/nextjs"
import { useTheme } from "next-themes"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Home01Icon,
  InboxIcon,
  Folder01Icon,
  Search01Icon,
  Logout01Icon,
  Settings01Icon,
  Sun01Icon,
  Moon02Icon,
  ComputerIcon,
  QuillWrite01Icon,
  Add01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { motion } from "motion/react"
import { Logo } from "@/components/logo"
import { useWorkspace } from "@/components/workspace-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@workspace/ui/components/sidebar"

const mainNav = [
  { label: "Home", href: "/app", icon: Home01Icon },
  { label: "Inbox", href: "/app/inbox", icon: InboxIcon },
  { label: "Projects", href: "/app/projects", icon: Folder01Icon },
]

export function AppSidebar() {
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useClerk()
  const { user } = useUser()
  const { theme, setTheme } = useTheme()
  const { workspaces, currentWorkspace, switchWorkspace } = useWorkspace()

  useEffect(() => setMounted(true), [])

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/app" />}
              className="hover:bg-transparent active:bg-transparent data-active:bg-transparent"
              size="lg"
            >
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <Logo className="!h-5 !w-auto text-[#0496FF]" />
              </motion.div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Search + New */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.05, ease: "easeOut" }}
              >
                <SidebarMenuItem>
                  <SidebarMenuButton className="text-muted-foreground ring-1 ring-sidebar-border">
                    <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={2} />
                    <span>Search</span>
                    <kbd className="ml-auto hidden rounded border border-sidebar-border bg-sidebar px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden lg:inline">
                      {mounted ? (/Mac|iPhone/.test(navigator.userAgent) ? "⌘K" : "Ctrl+K") : null}
                    </kbd>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.08, ease: "easeOut" }}
              >
                <SidebarMenuItem>
                  <SidebarMenuButton className="bg-[#0496FF] text-white hover:bg-[#0496FF]/85 hover:text-white active:bg-[#0496FF]/70 active:text-white data-active:bg-[#0496FF] data-active:text-white">
                    <HugeiconsIcon icon={QuillWrite01Icon} size={16} strokeWidth={2} />
                    <span>New</span>
                    <kbd className="ml-auto hidden rounded border border-white/25 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/70 group-data-[collapsible=icon]:hidden lg:inline">
                      C
                    </kbd>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </motion.div>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="mx-0" />

        {/* Main nav */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item, i) => (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.25,
                    delay: 0.1 + i * 0.05,
                    ease: "easeOut",
                  }}
                >
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={pathname === item.href}
                      className={
                        pathname === item.href
                          ? "data-active:bg-[#0496FF]/10 data-active:text-[#0496FF]"
                          : undefined
                      }
                    >
                      <HugeiconsIcon icon={item.icon} size={16} strokeWidth={2} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </motion.div>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.3, ease: "easeOut" }}
        >
        <SidebarMenu>
          <SidebarMenuItem>
            {mounted ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md p-1.5 outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                {user?.imageUrl ? (
                  <img
                    src={user.imageUrl}
                    alt={user.fullName ?? "Profile"}
                    className="size-7 shrink-0 rounded-md"
                  />
                ) : (
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground">
                    {user?.firstName?.charAt(0) ?? "?"}
                  </div>
                )}
                <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
                  <span className="truncate text-sm font-medium">
                    {user?.fullName}
                  </span>
                  {currentWorkspace && (
                    <span className="truncate text-xs text-muted-foreground">
                      {currentWorkspace.name}
                    </span>
                  )}
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56 duration-150">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal">
                    <div className="text-sm font-medium">{user?.fullName}</div>
                    <div className="text-xs text-muted-foreground">
                      {user?.primaryEmailAddress?.emailAddress}
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />

                {/* Workspace switcher */}
                {workspaces.length > 0 && (
                  <>
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                      {workspaces.map((ws) => (
                        <DropdownMenuItem
                          key={ws._id}
                          onClick={() => switchWorkspace(ws._id)}
                        >
                          {ws.iconUrl ? (
                            <img
                              src={ws.iconUrl}
                              alt={ws.name}
                              className="size-4 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <div className="size-4 shrink-0 rounded bg-muted" />
                          )}
                          <span className="truncate">{ws.name}</span>
                          {ws._id === currentWorkspace?._id && (
                            <HugeiconsIcon
                              icon={Tick02Icon}
                              size={14}
                              strokeWidth={2}
                              className="ml-auto text-[#0496FF]"
                            />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                  </>
                )}

                {/* Create workspace */}
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => router.push("/app/setup")}
                  >
                    <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
                    New workspace
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />

                <DropdownMenuItem render={<Link href="/app/settings" />}>
                  <HugeiconsIcon icon={Settings01Icon} size={14} strokeWidth={2} />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <HugeiconsIcon
                      icon={theme === "dark" ? Moon02Icon : Sun01Icon}
                      size={14}
                      strokeWidth={2}
                    />
                    Theme
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => setTheme("light")}>
                      <HugeiconsIcon icon={Sun01Icon} size={14} strokeWidth={2} />
                      Light
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("dark")}>
                      <HugeiconsIcon icon={Moon02Icon} size={14} strokeWidth={2} />
                      Dark
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("system")}>
                      <HugeiconsIcon icon={ComputerIcon} size={14} strokeWidth={2} />
                      System
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <HugeiconsIcon icon={Logout01Icon} size={14} strokeWidth={2} />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            ) : (
              <div className="flex w-full items-center gap-2 rounded-md p-1.5">
                <div className="size-7 shrink-0 rounded-md bg-sidebar-accent" />
              </div>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
        </motion.div>
      </SidebarFooter>
    </Sidebar>
  )
}
