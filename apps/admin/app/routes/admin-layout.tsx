import { useEffect } from "react"
import { Link, Outlet, useLocation, useNavigate } from "react-router"
import { useAuth, UserButton, SignedIn, SignedOut } from "@clerk/clerk-react"
import { useQuery } from "convex/react"
import {
  Article,
  Key,
  Megaphone,
  Pulse,
  ShieldCheck,
  Users,
} from "@phosphor-icons/react"

import { api } from "~/lib/convex"

const adminNav = [
  { label: "Observability", to: "/", icon: Pulse, match: "exact" as const },
  { label: "Users", to: "/users", icon: Users, match: "prefix" as const },
  { label: "Blog", to: "/blog", icon: Article, match: "prefix" as const },
  {
    label: "Changelog",
    to: "/changelog",
    icon: Megaphone,
    match: "prefix" as const,
  },
  {
    label: "Early access",
    to: "/early-access",
    icon: Key,
    match: "prefix" as const,
  },
]

export default function AdminLayout() {
  const { isLoaded, isSignedIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isAdmin = useQuery(
    api.admins.isCurrentUserAdmin,
    isSignedIn ? {} : "skip",
  )

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      navigate("/sign-in", { replace: true })
    }
  }, [isLoaded, isSignedIn, navigate])

  if (!isLoaded || (isSignedIn && isAdmin === undefined)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-[12px] text-muted-foreground">Loading…</div>
      </div>
    )
  }

  if (!isSignedIn) {
    return null
  }

  if (isAdmin === false) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-center">
        <div className="flex size-10 items-center justify-center border border-sidebar-border bg-sidebar ring-1 ring-sidebar-border">
          <ShieldCheck size={18} className="text-muted-foreground" />
        </div>
        <div className="text-[13px] font-semibold">Not authorized</div>
        <div className="max-w-xs text-[12px] text-muted-foreground">
          Your account is not an admin. Contact an existing admin to grant you
          access.
        </div>
        <div className="mt-2">
          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden md:flex-row">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center justify-between px-3 py-3">
          <h1 className="text-[13px] font-semibold">Admin</h1>
          <SignedIn>
            <UserButton
              appearance={{
                elements: { avatarBox: "size-6" },
              }}
            />
          </SignedIn>
        </div>

        <nav className="flex flex-col gap-0.5 p-1.5">
          {adminNav.map((item) => {
            const isActive =
              item.match === "exact"
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to) && item.to !== "/"
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`group relative flex items-center gap-2 px-2 py-1 text-[13px] font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-foreground ring-1 ring-sidebar-border"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                }`}
              >
                <item.icon
                  size={15}
                  weight={isActive ? "fill" : "regular"}
                  className={
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground group-hover:text-foreground"
                  }
                />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </aside>

      <div className="flex shrink-0 flex-col border-b border-sidebar-border bg-sidebar md:hidden">
        <div className="flex items-center justify-between px-3 py-2">
          <h1 className="text-[13px] font-semibold">Admin</h1>
          <SignedIn>
            <UserButton
              appearance={{ elements: { avatarBox: "size-6" } }}
            />
          </SignedIn>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-1.5 pb-1.5">
          {adminNav.map((item) => {
            const isActive =
              item.match === "exact"
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to) && item.to !== "/"
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`group relative flex shrink-0 items-center gap-1.5 px-2 py-1 text-[13px] font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-foreground ring-1 ring-sidebar-border"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                }`}
              >
                <item.icon
                  size={15}
                  weight={isActive ? "fill" : "regular"}
                  className={
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground group-hover:text-foreground"
                  }
                />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <SignedOut>
          <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
            Redirecting to sign in…
          </div>
        </SignedOut>
        <SignedIn>
          <Outlet />
        </SignedIn>
      </div>
    </div>
  )
}
