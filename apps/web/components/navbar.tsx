"use client"

import { useState } from "react"
import {
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from "@clerk/nextjs"
import Link from "next/link"
import { CaretDown, List } from "@phosphor-icons/react"
import { Logo } from "@/components/logo"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@workspace/ui/components/sheet"

const navLinks = [
  { label: "Product", href: "#", hasDropdown: true },
  { label: "Integrations", href: "#" },
  { label: "Pricing", href: "#" },
  { label: "Docs", href: "#" },
]

export function Navbar() {
  const { isSignedIn } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full border-b border-navbar-border bg-navbar">
      <nav className="mx-auto flex h-11 max-w-7xl items-center px-6">
        {/* Logo */}
        <Link href="/" className="mr-6 flex-shrink-0">
          <Logo />
        </Link>

        {/* Nav links – desktop */}
        <ul className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <li key={link.label}>
              <Link
                href={link.href}
                className="text-navbar-foreground/70 flex items-center gap-1 px-3 py-2 text-sm font-medium"
              >
                {link.label}
                {link.hasDropdown && <CaretDown size={14} />}
              </Link>
            </li>
          ))}
        </ul>

        {/* Right side – desktop auth buttons */}
        <div className="ml-auto hidden items-center gap-4 md:flex">
          {!isSignedIn ? (
            <>
              <SignInButton mode="redirect">
                <button
                  className="text-navbar-accent hover:bg-navbar-accent/10 rounded-[4px] px-3.5 py-1 text-sm font-medium transition-colors"
                  type="button"
                >
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="redirect">
                <button
                  className="bg-navbar-accent hover:bg-navbar-accent/85 rounded-[4px] px-3.5 py-1 text-sm font-medium text-white transition-colors"
                  type="button"
                >
                  Get started
                </button>
              </SignUpButton>
            </>
          ) : (
            <>
              <Link
                href="/app"
                className="text-navbar-accent hover:bg-navbar-accent/10 rounded-[4px] px-3.5 py-1 text-sm font-medium transition-colors"
              >
                Dashboard
              </Link>
              <UserButton />
            </>
          )}
        </div>

        {/* Mobile menu button – visible only on small screens */}
        <div className="ml-auto md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              className="text-navbar-foreground/70 hover:bg-navbar-accent/10 rounded-[4px] p-1.5 transition-colors"
              aria-label="Open menu"
            >
              <List size={20} />
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[280px] border-navbar-border bg-navbar"
            >
              {/* Nav links */}
              <nav className="mt-8 flex flex-col gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="text-navbar-foreground/70 hover:bg-navbar-accent/10 flex items-center gap-1 rounded-[4px] px-3 py-2 text-sm font-medium transition-colors"
                  >
                    {link.label}
                    {link.hasDropdown && <CaretDown size={14} />}
                  </Link>
                ))}
              </nav>

              {/* Auth buttons */}
              <div className="mt-6 flex flex-col gap-2">
                {!isSignedIn ? (
                  <>
                    <SignInButton mode="redirect">
                      <button
                        className="text-navbar-accent hover:bg-navbar-accent/10 rounded-[4px] px-3.5 py-2 text-sm font-medium transition-colors"
                        type="button"
                        onClick={() => setMobileOpen(false)}
                      >
                        Sign in
                      </button>
                    </SignInButton>
                    <SignUpButton mode="redirect">
                      <button
                        className="bg-navbar-accent hover:bg-navbar-accent/85 rounded-[4px] px-3.5 py-2 text-sm font-medium text-white transition-colors"
                        type="button"
                        onClick={() => setMobileOpen(false)}
                      >
                        Get started
                      </button>
                    </SignUpButton>
                  </>
                ) : (
                  <>
                    <Link
                      href="/app"
                      onClick={() => setMobileOpen(false)}
                      className="text-navbar-accent hover:bg-navbar-accent/10 rounded-[4px] px-3.5 py-2 text-sm font-medium transition-colors"
                    >
                      Dashboard
                    </Link>
                    <div className="px-3.5 py-2">
                      <UserButton />
                    </div>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  )
}
