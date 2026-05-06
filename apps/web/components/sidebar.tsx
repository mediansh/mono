"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useClerk, useUser } from "@clerk/nextjs"
import { useTheme } from "next-themes"
import { useMutation, useQuery } from "convex/react"
import {
  House,
  MagnifyingGlass,
  SignOut,
  Gear,
  Sun,
  Moon,
  Desktop,
  PenNib,
  Plus,
  Check,
  Image,
  Plugs,
  ClockCounterClockwise,
  CreditCard,
  ShieldCheck,
  ArrowSquareOut,
  Tray,
} from "@phosphor-icons/react"
import { Facehash } from "facehash"
import {
  DiscordIcon,
  SlackIcon,
  LinearIcon,
  XIcon,
  GitHubIcon,
  CliIcon,
} from "@/components/brand-icons"
import { NewTaskModal } from "@/components/new-task-modal"
import { SearchPalette } from "@/components/search-palette"
import { api } from "@/convex/_generated/api"
import { Logo } from "@/components/logo"
import { SyncIndicator } from "@/components/sync-indicator"
import { useWorkspace } from "@/components/workspace-provider"
import { useWorkspaceOptimisticMutations } from "@/hooks/use-workspace-optimistic-mutations"
import { hasTaskWritePermission } from "@/lib/workspace-permissions"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@workspace/ui/components/sidebar"

const mainNav = [
  { label: "Home", href: "/app", icon: House },
  { label: "Requests", href: "/app/requests", icon: Tray },
  { label: "Logs", href: "/app/logs", icon: ClockCounterClockwise },
  { label: "Billing", href: "/app/billing", icon: CreditCard },
]

const integrationsSubNav = [
  { label: "Discord", href: "/app/integrations/discord", icon: DiscordIcon },
  { label: "Slack", href: "/app/integrations/slack", icon: SlackIcon },
  { label: "Linear", href: "/app/integrations/linear", icon: LinearIcon },
  { label: "X (Twitter)", href: "/app/integrations/x", icon: XIcon },
  { label: "GitHub", href: "/app/integrations/github", icon: GitHubIcon },
  { label: "CLI", href: "/app/integrations/cli", icon: CliIcon },
]

function CreateWorkspaceModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const generateUploadUrl = useMutation(api.workspaces.generateUploadUrl)
  const { createWorkspaceOptimistic } = useWorkspaceOptimisticMutations()
  const { switchWorkspace } = useWorkspace()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState("")
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [iconPreview, setIconPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  function reset() {
    setName("")
    setIconFile(null)
    setIconPreview(null)
    setLoading(false)
    setError("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB")
      return
    }
    setIconFile(file)
    setIconPreview(URL.createObjectURL(file))
    if (error) setError("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError("Workspace name is required")
      return
    }

    setLoading(true)
    setError("")

    try {
      let iconId: string | undefined

      if (iconFile) {
        const uploadUrl = await generateUploadUrl()
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": iconFile.type },
          body: iconFile,
        })
        const data = await result.json()
        iconId = data.storageId
      }

      const id = await createWorkspaceOptimistic({
        name: name.trim(),
        iconId: iconId as any,
        iconUrl: iconPreview,
      })
      switchWorkspace(id)
      reset()
      onOpenChange(false)
    } catch {
      setError("Failed to create workspace. Please try again.")
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open)
        if (!open) reset()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>
            Name your workspace. You can optionally upload a logo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-medium">Logo <span className="text-muted-foreground font-normal">(optional)</span></label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group flex size-11 items-center justify-center overflow-hidden rounded-[4px] bg-card ring-1 ring-border transition-colors hover:bg-muted"
            >
              {iconPreview ? (
                <img
                  src={iconPreview}
                  alt="Workspace logo"
                  className="size-full object-cover"
                />
              ) : name.trim() ? (
                <Facehash name={name.trim()} size={44} />
              ) : (
                <Image
                  size={16}
                  className="text-muted-foreground transition-colors group-hover:text-foreground"
                />
              )}
            </button>
            {iconPreview && (
              <button
                type="button"
                onClick={() => {
                  setIconFile(null)
                  setIconPreview(null)
                  if (fileInputRef.current) fileInputRef.current.value = ""
                }}
                className="w-fit text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Remove
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="modal-workspace-name" className="text-[13px] font-medium">
              Workspace name
            </label>
            <input
              id="modal-workspace-name"
              type="text"
              placeholder="My Workspace"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (error) setError("")
              }}
              autoFocus
              className="h-8 rounded-[4px] bg-card px-2.5 text-[13px] ring-1 ring-border outline-none transition-all placeholder:text-muted-foreground focus:ring-foreground/30"
            />
          </div>

          {error && <p className="text-[12px] text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="flex h-8 items-center justify-center rounded-[4px] bg-primary text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? (
              <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              "Create workspace"
            )}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AppSidebar() {
  const [mounted, setMounted] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const pathname = usePathname()
  const { signOut, openUserProfile } = useClerk()
  const { user } = useUser()
  const isAdmin = useQuery(api.admins.isCurrentUserAdmin) ?? false
  const { theme, setTheme } = useTheme()
  const { workspaces, currentWorkspace, switchWorkspace } = useWorkspace()
  const canManageTasks = hasTaskWritePermission(currentWorkspace?.role)
  const workspaceTasks = useQuery(
    api.tasks.listByWorkspace,
    currentWorkspace?._id ? { workspaceId: currentWorkspace._id } : "skip"
  )
  const requestsCount = workspaceTasks
    ? workspaceTasks.filter((task) => task.status === "requests").length
    : 0

  useEffect(() => setMounted(true), [])

  // "C" keybind to open new task modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!canManageTasks) {
        return
      }

      if (
        e.key === "c" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target as HTMLElement)?.isContentEditable
      ) {
        e.preventDefault()
        setNewTaskOpen(true)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [canManageTasks])

  // Cmd+K / Ctrl+K to open search palette
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader className="p-1.5">
          <Link href="/app" className="flex items-center gap-1.5 px-1 py-0.5">
            <Logo symbolOnly className="size-6" />
            <SyncIndicator className="group-data-[collapsible=icon]:hidden" />
          </Link>
        </SidebarHeader>

        <SidebarContent>
          {/* Search + New */}
          <SidebarGroup className="gap-1 pt-0.5">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setSearchOpen(true)}
                    className="text-sidebar-foreground/60 ring-1 ring-sidebar-border"
                  >
                    <MagnifyingGlass size={15} weight="regular" />
                    <span>Search</span>
                    <kbd className="ml-auto hidden rounded-[3px] border border-sidebar-border px-1 py-px font-mono text-[10px] text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden lg:inline">
                      {mounted ? (/Mac|iPhone/.test(navigator.userAgent) ? "⌘K" : "Ctrl+K") : null}
                    </kbd>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => {
                      if (!canManageTasks) return
                      setNewTaskOpen(true)
                    }}
                    disabled={!canManageTasks}
                    className="bg-primary text-primary-foreground ring-1 ring-primary-foreground/10 hover:bg-primary/85 hover:text-primary-foreground active:bg-primary/70 active:text-primary-foreground data-active:bg-primary data-active:text-primary-foreground"
                  >
                    <PenNib size={15} weight="fill" />
                    <span>New</span>
                    <kbd className="ml-auto hidden rounded-[3px] border border-primary-foreground/15 px-1 py-px font-mono text-[10px] text-primary-foreground/50 group-data-[collapsible=icon]:hidden lg:inline">
                      C
                    </kbd>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Main nav */}
          <SidebarGroup className="pt-0 pb-1.5">
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {mainNav.map((item) => {
                  const isActive = item.href === "/app"
                    ? pathname === "/app"
                    : pathname.startsWith(item.href)
                  const showRequestsBadge =
                    item.href === "/app/requests" && requestsCount > 0
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={isActive}
                        className={
                          isActive
                            ? "data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/70"
                        }
                      >
                        <item.icon size={15} weight={isActive ? "fill" : "regular"} />
                        <span>{item.label}</span>
                        {showRequestsBadge && (
                          <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-sidebar-accent px-1 font-mono text-[10px] font-medium text-sidebar-accent-foreground tabular-nums group-data-[collapsible=icon]:hidden">
                            {requestsCount}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}

                {/* Integrations parent */}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/app/integrations" />}
                    isActive={pathname === "/app/integrations"}
                    className={
                      pathname.startsWith("/app/integrations")
                        ? "data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70"
                    }
                  >
                    <Plugs size={15} weight={pathname.startsWith("/app/integrations") ? "fill" : "regular"} />
                    <span>Integrations</span>
                  </SidebarMenuButton>
                  <SidebarMenuSub className="mr-0">
                    {integrationsSubNav.map((sub) => {
                      const isSubActive = pathname === sub.href
                      return (
                        <SidebarMenuSubItem key={sub.href}>
                          <SidebarMenuSubButton
                            render={<Link href={sub.href} />}
                            isActive={isSubActive}
                            size="md"
                            className={isSubActive ? "" : "text-sidebar-foreground/70"}
                          >
                            <span style={{ lineHeight: 0 }}>
                              <sub.icon size={12} />
                            </span>
                            <span>{sub.label}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )
                    })}
                  </SidebarMenuSub>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-1.5">
          <SidebarMenu className="gap-0.5">
            {isAdmin && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <a
                      href="https://admin.median.sh"
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                  className="text-sidebar-foreground/70"
                >
                  <ShieldCheck size={15} weight="regular" />
                  <span>Admin</span>
                  <ArrowSquareOut
                    size={12}
                    weight="regular"
                    className="ml-auto text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden"
                  />
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href="/app/settings" />}
                isActive={pathname.startsWith("/app/settings")}
                className={
                  pathname.startsWith("/app/settings")
                    ? "data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70"
                }
              >
                <Gear size={15} weight={pathname.startsWith("/app/settings") ? "fill" : "regular"} />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              {mounted ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1 outline-none transition-colors duration-150 ease-out hover:bg-sidebar-accent active:bg-sidebar-border focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                  {user?.imageUrl ? (
                    <img
                      src={user.imageUrl}
                      alt={user.fullName ?? "Profile"}
                      className="h-5 w-5 shrink-0 rounded-[4px] object-cover ring-1 ring-sidebar-border"
                    />
                  ) : (
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-sidebar-accent text-[10px] font-medium text-sidebar-accent-foreground ring-1 ring-sidebar-border">
                      {user?.firstName?.charAt(0) ?? "?"}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col justify-center group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-left text-[13px] font-medium leading-tight">
                      {user?.fullName}
                    </span>
                    {currentWorkspace && (
                      <span className="truncate text-left text-[11px] leading-tight text-sidebar-foreground/50">
                        {currentWorkspace.name}
                      </span>
                    )}
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-52 ring-sidebar-border duration-150">
                  {/* Profile header */}
                  <div className="flex items-center gap-2 px-1.5 py-1.5">
                    {user?.imageUrl ? (
                      <img
                        src={user.imageUrl}
                        alt={user.fullName ?? "Profile"}
                        className="h-7 w-7 shrink-0 rounded-[4px] object-cover ring-1 ring-border"
                      />
                    ) : (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] bg-accent text-xs font-medium ring-1 ring-border">
                        {user?.firstName?.charAt(0) ?? "?"}
                      </div>
                    )}
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] font-medium leading-tight">{user?.fullName}</span>
                      <span className="truncate text-[11px] leading-tight text-muted-foreground">
                        {user?.primaryEmailAddress?.emailAddress}
                      </span>
                    </div>
                  </div>
                  <DropdownMenuSeparator />

                  {/* Workspace switcher */}
                  {workspaces.length > 0 && (
                    <>
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-[11px]">Workspaces</DropdownMenuLabel>
                        {workspaces.map((ws) => (
                          <DropdownMenuItem
                            key={ws._id}
                            onClick={() => switchWorkspace(ws._id)}
                            className="items-center gap-2"
                          >
                            {ws.iconUrl ? (
                              <img
                                src={ws.iconUrl}
                                alt={ws.name}
                                className="!h-4 !w-4 shrink-0 rounded-[3px] object-cover ring-1 ring-border"
                              />
                            ) : (
                              <div className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-[3px] ring-1 ring-border">
                                <Facehash name={ws.name} size={16} />
                              </div>
                            )}
                            <span className="truncate">{ws.name}</span>
                            {ws._id === currentWorkspace?._id && (
                              <Check
                                size={12}
                                weight="bold"
                                className="ml-auto text-foreground"
                              />
                            )}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem
                          onClick={() => setCreateModalOpen(true)}
                        >
                          <Plus size={15} weight="regular" />
                          New workspace
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                    </>
                  )}

                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => openUserProfile()}>
                      <Gear size={15} weight="regular" />
                      Account
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        {theme === "dark" ? <Moon size={15} weight="regular" /> : <Sun size={15} weight="regular" />}
                        Theme
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="ring-sidebar-border animate-in fade-in-0 zoom-in-95 slide-in-from-left-1 duration-150">
                        <DropdownMenuItem onClick={() => setTheme("light")}>
                          <Sun size={15} weight="regular" />
                          Light
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTheme("dark")}>
                          <Moon size={15} weight="regular" />
                          Dark
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTheme("system")}>
                          <Desktop size={15} weight="regular" />
                          System
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()} className="text-muted-foreground">
                    <SignOut size={15} weight="regular" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              ) : (
                <div className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1">
                  <div className="h-5 w-5 shrink-0 rounded-[4px] bg-sidebar-accent" />
                </div>
              )}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <CreateWorkspaceModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
      />

      <NewTaskModal
        open={newTaskOpen}
        onOpenChange={setNewTaskOpen}
      />

      <SearchPalette
        open={searchOpen}
        onOpenChange={setSearchOpen}
      />
    </>
  )
}

