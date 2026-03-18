"use client"

import { usePathname } from "next/navigation"
import { SidebarProvider, SidebarInset } from "@workspace/ui/components/sidebar"
import { AppSidebar } from "@/components/sidebar"
import { PageTransition } from "@/components/page-transition"
import { WorkspaceProvider } from "@/components/workspace-provider"
import { WorkspaceGuard } from "@/components/workspace-guard"

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const pathname = usePathname()
  const isSetup = pathname === "/app/setup"

  return (
    <WorkspaceProvider>
      <WorkspaceGuard>
        {isSetup ? (
          children
        ) : (
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <PageTransition>{children}</PageTransition>
            </SidebarInset>
          </SidebarProvider>
        )}
      </WorkspaceGuard>
    </WorkspaceProvider>
  )
}
