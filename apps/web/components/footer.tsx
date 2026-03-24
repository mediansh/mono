"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowUpRight } from "lucide-react"
import { ThemeSwitcher } from "@/components/theme-switcher"

const footerLinks = [
  {
    title: "Product",
    links: [
      { label: "Task Board", href: "#" },
      { label: "Agent Workflows", href: "#" },
      { label: "Community Inbox", href: "#" },
      { label: "Auto-Responder", href: "#" },
      { label: "Pricing", href: "#" },
    ],
  },
  {
    title: "Integrations",
    links: [
      { label: "Discord", href: "#" },
      { label: "X / Twitter", href: "#" },
      { label: "GitHub", href: "#" },
      { label: "Linear", href: "#" },
      { label: "Slack", href: "#" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: "#", external: true },
      { label: "Blog", href: "#" },
      { label: "Changelog", href: "#" },
      { label: "API Reference", href: "#", external: true },
      { label: "Status", href: "#", external: true },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
      { label: "Security", href: "#" },
    ],
  },
  {
    title: "Connect",
    links: [
      { label: "X", href: "#", external: true },
      { label: "Discord", href: "#", external: true },
      { label: "GitHub", href: "#", external: true },
      { label: "Talk to us", href: "#", external: true },
    ],
  },
]

export function Footer() {
  const [year, setYear] = useState<number | null>(null)

  useEffect(() => {
    setYear(new Date().getFullYear())
  }, [])

  return (
    <footer className="border-t border-navbar-border bg-navbar">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Top section: logo + link columns */}
        <div className="grid grid-cols-2 gap-6 md:grid-cols-[auto_1fr] md:gap-16">
          {/* Logo */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/">
              <Image
                src="/median.svg"
                alt="Median"
                width={28}
                height={28}
              />
            </Link>
          </div>

          {/* Link columns */}
          <div className="col-span-2 grid grid-cols-2 gap-6 sm:grid-cols-3 md:col-span-1 md:grid-cols-5">
            {footerLinks.map((group) => (
              <div key={group.title}>
                <h3 className="text-navbar-foreground text-sm font-medium">
                  {group.title}
                </h3>
                <ul className="mt-2.5 space-y-1.5">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-navbar-foreground/50 hover:text-navbar-foreground/70 inline-flex items-center gap-0.5 text-sm transition-colors"
                        {...(link.external
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                      >
                        {link.label}
                        {link.external && (
                          <ArrowUpRight className="h-3 w-3" />
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex items-center justify-between border-t border-navbar-border pt-5">
          <div className="text-navbar-foreground/50 text-sm">
            &copy; {year ?? ""} Median.
          </div>
          <ThemeSwitcher />
        </div>
      </div>
    </footer>
  )
}
