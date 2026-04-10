import type { Metadata } from "next"
import { Suspense } from "react"
import { Geist, Geist_Mono } from "next/font/google"
import { Agentation } from "agentation"
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"

import "@workspace/ui/globals.css"
import { NavigationAccelerator } from "@/components/navigation-accelerator"
import { Providers } from "@/components/providers"
import { RoutePrefetch } from "@/components/route-prefetch"
import { cn } from "@workspace/ui/lib/utils"
import { WebVitals } from "@/components/web-vitals"
import { DevDebugPanel } from "@/components/dev-debug-panel"
import { DevNetworkInterceptor } from "@/components/dev-network-interceptor"
import { DevErrorTrigger } from "@/components/dev-error-trigger"

const siteUrl = "https://median.sh"
const siteName = "Median"
const siteDescription = "The feedback engine for modern teams."

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: "%s — Median",
  },
  description: siteDescription,
  icons: {
    icon: process.env.NODE_ENV === "development" ? "/favicon-dev.svg" : "/favicon.svg",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName,
    title: siteName,
    description: siteDescription,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: siteName,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: siteDescription,
    images: ["/og-image.png"],
  },
}

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const globalRoutes = ["/", "/app", "/app/setup", "/sign-in", "/sign-up"]

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, fontSans.variable, "font-sans")}
    >
      <body>
        <Suspense fallback={null}>
          <Providers>
            <NavigationAccelerator />
            <RoutePrefetch routes={globalRoutes} />
            {children}
          </Providers>
        </Suspense>
        <WebVitals />
        <Analytics />
        <SpeedInsights />
        {process.env.NODE_ENV === "development" && (
          <>
            <Agentation />
            <DevDebugPanel />
            <DevNetworkInterceptor />
            <DevErrorTrigger target="global" />
          </>
        )}
      </body>
    </html>
  )
}
