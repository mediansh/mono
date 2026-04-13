import Link from "next/link"
import { Logo } from "@/components/logo"
import { FaXTwitter, FaDiscord, FaYoutube, FaInstagram, FaRedditAlien, FaGithub, FaTiktok } from "react-icons/fa6"
import type { ReactNode } from "react"

type FooterLink = { label: string; href: string; icon?: ReactNode }

const socialLinks: FooterLink[] = [
  { label: "X/Twitter", href: "https://x.com/mediandotsh", icon: <FaXTwitter size={16} /> },
  { label: "GitHub", href: "https://github.com/mediansh", icon: <FaGithub size={16} /> },
  { label: "Instagram", href: "https://www.instagram.com/clovrlabs/", icon: <FaInstagram size={16} /> },
  { label: "TikTok", href: "https://www.tiktok.com/@clovrlabs", icon: <FaTiktok size={16} /> },
  { label: "YouTube", href: "https://www.youtube.com/@clovrlabs", icon: <FaYoutube size={16} /> },
  { label: "Discord", href: "https://clovrlabs.co/discord", icon: <FaDiscord size={16} /> },
  { label: "Reddit", href: "https://www.reddit.com/r/Clovr/", icon: <FaRedditAlien size={16} /> },
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
        <div className="flex flex-col items-center gap-10 sm:flex-row sm:items-start sm:justify-between">
          {/* Logo + tagline */}
          <div className="max-w-xs text-center sm:text-left">
            <Logo className="text-lg" />
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The feedback engine for modern teams.
            </p>
          </div>

          {/* Link columns */}
          <div className="flex flex-wrap justify-center gap-16 sm:justify-end">
            {Object.entries(links).map(([heading, items]) => (
              <div key={heading} className="text-center sm:text-left">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
                  {heading}
                </p>
                <ul className="mt-3 flex flex-col items-center gap-2 sm:items-start">
                  {items.map((item) => (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        {...(item.href.startsWith("http") || item.href.startsWith("mailto") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {item.icon}
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
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
