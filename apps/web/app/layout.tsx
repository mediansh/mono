import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Agentation } from "agentation"

import "@workspace/ui/globals.css"
import { Providers } from "@/components/providers"
import { cn } from "@workspace/ui/lib/utils"

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

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", fontSans.variable)}
    >
      <body>
        <Providers>
          {children}
        </Providers>
        {process.env.NODE_ENV === "development" && <Agentation />}
      </body>
    </html>
  )
}
