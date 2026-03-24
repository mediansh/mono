"use client"

import {
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from "@clerk/nextjs"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { Logo } from "@/components/logo"

const navLinks = [
  { label: "Product", href: "#", hasDropdown: true },
  { label: "Integrations", href: "#" },
  { label: "Pricing", href: "#" },
  { label: "Docs", href: "#" },
]

export function Navbar() {
  const { isSignedIn } = useAuth()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-navbar-border bg-navbar">
      <nav className="mx-auto flex h-11 max-w-7xl items-center px-6">
        {/* Logo */}
        <Link href="/" className="mr-6 flex-shrink-0">
          <Logo />
        </Link>

        {/* Nav links */}
        <ul className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <li key={link.label}>
              <Link
                href={link.href}
                className="text-navbar-foreground/70 flex items-center gap-1 px-3 py-2 text-sm font-medium"
              >
                {link.label}
                {link.hasDropdown && <ChevronDown className="h-3.5 w-3.5" />}
              </Link>
            </li>
          ))}
        </ul>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-4">
          {!isSignedIn ? (
            <>
              <SignInButton mode="redirect">
                <button
                  className="text-navbar-accent hover:bg-navbar-accent/10 rounded-lg px-3.5 py-1 text-sm font-medium transition-colors"
                  type="button"
                >
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="redirect">
                <button
                  className="bg-navbar-accent hover:bg-navbar-accent/85 rounded-lg px-3.5 py-1 text-sm font-medium text-white transition-colors"
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
                className="text-navbar-accent hover:bg-navbar-accent/10 rounded-lg px-3.5 py-1 text-sm font-medium transition-colors"
              >
                Dashboard
              </Link>
              <UserButton />
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
