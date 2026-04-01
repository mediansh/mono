"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

export default function IntegrationsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const pathname = usePathname()

  useEffect(() => {
    document.title = "Integrations — Median"
  }, [pathname])

  return <>{children}</>
}
