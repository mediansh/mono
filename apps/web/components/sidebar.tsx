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
} from "@phosphor-icons/react"
import { Facehash } from "facehash"
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
  { label: "Logs", href: "/app/logs", icon: ClockCounterClockwise },
  { label: "Billing", href: "/app/billing", icon: CreditCard },
]

const integrationsSubNav = [
  { label: "Discord", href: "/app/integrations/discord", icon: DiscordIcon },
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
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={isActive}
                        className={
                          isActive
                            ? "data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:ring-1 data-active:ring-sidebar-border"
                            : "text-sidebar-foreground/70"
                        }
                      >
                        <item.icon size={15} weight={isActive ? "fill" : "regular"} />
                        <span>{item.label}</span>
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
                        ? "data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:ring-1 data-active:ring-sidebar-border text-sidebar-accent-foreground"
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
                  render={<Link href="/app/admin" />}
                  isActive={pathname.startsWith("/app/admin")}
                  className={
                    pathname.startsWith("/app/admin")
                      ? "data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:ring-1 data-active:ring-sidebar-border"
                      : "text-sidebar-foreground/70"
                  }
                >
                  <ShieldCheck
                    size={15}
                    weight={pathname.startsWith("/app/admin") ? "fill" : "regular"}
                  />
                  <span>Admin</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href="/app/settings" />}
                isActive={pathname.startsWith("/app/settings")}
                className={
                  pathname.startsWith("/app/settings")
                    ? "data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:ring-1 data-active:ring-sidebar-border"
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
                <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1 outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring">
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

// ── Platform icons (inline SVGs for brand accuracy) ──

function DiscordIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
    </svg>
  )
}

function LinearIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <path fill="currentColor" d="M1.225 61.523c-.222-.949.908-1.546 1.597-.857l36.512 36.512c.69.69.092 1.82-.857 1.597-18.425-4.323-32.93-18.827-37.252-37.252ZM.002 46.889a.99.99 0 0 0 .29.76L52.35 99.71c.201.2.478.307.76.29 2.37-.149 4.695-.46 6.963-.927.765-.157 1.03-1.096.478-1.648L2.576 39.448c-.552-.551-1.491-.286-1.648.479a50.067 50.067 0 0 0-.926 6.962ZM4.21 29.705a.988.988 0 0 0 .208 1.1l64.776 64.776c.289.29.726.375 1.1.208a49.908 49.908 0 0 0 5.185-2.684.981.981 0 0 0 .183-1.54L8.436 24.336a.981.981 0 0 0-1.541.183 49.896 49.896 0 0 0-2.684 5.185Zm8.448-11.631a.986.986 0 0 1-.045-1.354C21.78 6.46 35.111 0 49.952 0 77.592 0 100 22.407 100 50.048c0 14.84-6.46 28.172-16.72 37.338a.986.986 0 0 1-1.354-.045L12.659 18.074Z" />
    </svg>
  )
}

function XIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function GitHubIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function CliIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )
}
