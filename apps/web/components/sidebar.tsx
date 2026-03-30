"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useClerk, useUser } from "@clerk/nextjs"
import { useTheme } from "next-themes"
import { useMutation } from "convex/react"
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
} from "@phosphor-icons/react"
import { Facehash } from "facehash"
import { NewTaskModal } from "@/components/new-task-modal"
import { SearchPalette } from "@/components/search-palette"
import { api } from "@/convex/_generated/api"
import { Logo } from "@/components/logo"
import { useWorkspace } from "@/components/workspace-provider"
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
  SidebarSeparator,
} from "@workspace/ui/components/sidebar"

const mainNav = [
  { label: "Home", href: "/app", icon: House },
  { label: "Integrations", href: "/app/integrations", icon: Plugs },
]

function CreateWorkspaceModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createWorkspace = useMutation(api.workspaces.createWorkspace)
  const generateUploadUrl = useMutation(api.workspaces.generateUploadUrl)
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

      const id = await createWorkspace({ name: name.trim(), iconId: iconId as any })
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Logo <span className="text-muted-foreground font-normal">(optional)</span></label>
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
              className="group flex size-14 items-center justify-center overflow-hidden rounded-none border border-border bg-card transition-colors hover:bg-muted"
            >
              {iconPreview ? (
                <img
                  src={iconPreview}
                  alt="Workspace logo"
                  className="size-full object-cover"
                />
              ) : name.trim() ? (
                <Facehash name={name.trim()} size={56} />
              ) : (
                <Image
                  size={20}
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
                className="w-fit text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Remove
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="modal-workspace-name" className="text-sm font-medium">
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
              className="h-10 rounded-none border border-border bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="flex h-10 items-center justify-center rounded-none bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
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
  const { signOut } = useClerk()
  const { user } = useUser()
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
        <SidebarHeader className="p-2 pb-0">
          <Link href="/app" className="flex items-center">
            <Logo symbolOnly className="size-7" />
          </Link>
        </SidebarHeader>

        <SidebarContent>
          {/* Search + New */}
          <SidebarGroup className="gap-1">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setSearchOpen(true)}
                    className="text-sidebar-foreground/60 ring-1 ring-sidebar-border"
                  >
                    <MagnifyingGlass size={15} weight="bold" />
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

          <SidebarSeparator className="mx-1.5" />

          {/* Main nav */}
          <SidebarGroup className="gap-0.5">
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
                        <item.icon size={15} weight={isActive ? "fill" : "bold"} />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-1.5">
          <SidebarMenu className="gap-0.5">
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
                <Gear size={15} weight={pathname.startsWith("/app/settings") ? "fill" : "bold"} />
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
                <DropdownMenuContent side="top" align="start" className="w-52 duration-150">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="font-normal">
                      <div className="text-[13px] font-medium">{user?.fullName}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {user?.primaryEmailAddress?.emailAddress}
                      </div>
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
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
                            className="items-center"
                          >
                            {ws.iconUrl ? (
                              <img
                                src={ws.iconUrl}
                                alt={ws.name}
                                className="!h-4 !w-4 shrink-0 rounded-[3px] object-cover"
                              />
                            ) : (
                              <div className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-[3px]">
                                <Facehash name={ws.name} size={16} />
                              </div>
                            )}
                            <span className="truncate">{ws.name}</span>
                            {ws._id === currentWorkspace?._id && (
                              <Check
                                size={14}
                                className="ml-auto text-foreground"
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
                      onClick={() => setCreateModalOpen(true)}
                    >
                      <Plus size={14} />
                      New workspace
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />

                  <DropdownMenuItem render={<Link href="/settings" />}>
                    <Gear size={14} weight="fill" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      {theme === "dark" ? <Moon size={14} weight="fill" /> : <Sun size={14} weight="fill" />}
                      Theme
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={() => setTheme("light")}>
                        <Sun size={14} weight="fill" />
                        Light
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setTheme("dark")}>
                        <Moon size={14} weight="fill" />
                        Dark
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setTheme("system")}>
                        <Desktop size={14} weight="fill" />
                        System
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()}>
                    <SignOut size={14} weight="fill" />
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
