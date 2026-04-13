import Link from "next/link"
import { Logo } from "@/components/logo"
import { FaXTwitter, FaDiscord, FaYoutube, FaInstagram, FaRedditAlien } from "react-icons/fa6"
import type { ReactNode } from "react"

type FooterLink = { label: string; href: string; icon?: ReactNode }

const socialLinks: FooterLink[] = [
  { label: "Twitter", href: "https://x.com/clovr_dev", icon: <FaXTwitter size={13} /> },
  { label: "Discord", href: "https://discord.gg/P7MwTrgH5a", icon: <FaDiscord size={13} /> },
  { label: "YouTube", href: "https://www.youtube.com/@useclovr", icon: <FaYoutube size={13} /> },
  { label: "Instagram", href: "https://www.instagram.com/clovrlabs/", icon: <FaInstagram size={13} /> },
  { label: "Reddit", href: "https://reddit.com/r/clovr", icon: <FaRedditAlien size={13} /> },
]

const links: Record<string, FooterLink[]> = {
  Product: [
    { label: "Features", href: "#features" },
    { label: "Integrations", href: "#integrations" },
    { label: "Pricing", href: "#pricing" },
  ],
  Resources: [
    { label: "Docs", href: "https://docs.median.sh" },
    { label: "Changelog", href: "/changelog" },
    { label: "News", href: "/news" },
  ],
  Socials: socialLinks,
  Company: [
    { label: "Sign in", href: "/sign-in" },
    { label: "Get started", href: "/sign-up" },
    { label: "Contact us", href: "mailto:hello@clovrlabs.co" },
  ],
}

export function LandingFooter() {
  return (
    <footer className="border-t border-foreground/[0.06] px-4 pt-12 pb-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-10 sm:flex-row">
          {/* Logo + tagline */}
          <div className="max-w-xs">
            <Logo className="text-lg" />
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The feedback engine for modern teams.
            </p>
          </div>

          {/* Link columns */}
          <div className="flex flex-wrap gap-16">
            {Object.entries(links).map(([heading, items]) => (
              <div key={heading}>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
                  {heading}
                </p>
                {heading === "Socials" ? (
                  <ul className="mt-3 space-y-2">
                    {items.map((item) => (
                      <li key={item.label}>
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[13px] text-[#3f3f46] transition-colors hover:text-[#71717a]"
                        >
                          {item.icon}
                          {item.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {items.map((item) => (
                      <li key={item.label}>
                        <Link
                          href={item.href}
                          {...(item.href.startsWith("http") || item.href.startsWith("mailto") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center gap-3 border-t border-foreground/[0.06] pt-6 sm:flex-row sm:justify-between sm:gap-0">
          <p className="text-[10px] text-muted-foreground/50 sm:text-xs">
            &copy; {new Date().getFullYear()} Clovr Labs Pty Ltd. All rights reserved.
          </p>
          <div className="flex gap-4">
            <Link href="/terms" className="text-[10px] text-muted-foreground/50 transition-colors hover:text-muted-foreground sm:text-xs">
              Terms of Service
            </Link>
            <Link href="/privacy" className="text-[10px] text-muted-foreground/50 transition-colors hover:text-muted-foreground sm:text-xs">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
