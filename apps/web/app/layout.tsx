import type { Metadata } from "next"
import { Suspense } from "react"
import { Geist, Geist_Mono } from "next/font/google"
import { Agentation } from "agentation"

import "@workspace/ui/globals.css"
import { Providers } from "@/components/providers"
import { RoutePrefetch } from "@/components/route-prefetch"
import { cn } from "@workspace/ui/lib/utils"
import { DevDebugPanel } from "@/components/dev-debug-panel"
import { DevNetworkInterceptor } from "@/components/dev-network-interceptor"
import { DevErrorTrigger } from "@/components/dev-error-trigger"

export const metadata: Metadata = {
  title: {
    default: "Median",
    template: "%s — Median",
  },
  description: "Median",
  icons: {
    icon: "/median.svg",
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
            <RoutePrefetch routes={globalRoutes} />
            {children}
          </Providers>
        </Suspense>
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
