"use client"

import { usePathname } from "next/navigation"
import { SidebarProvider, SidebarInset } from "@workspace/ui/components/sidebar"
import { AppSidebar } from "@/components/sidebar"
import { PageTransition } from "@/components/page-transition"
import { RoutePrefetch } from "@/components/route-prefetch"
import { WorkspaceProvider } from "@/components/workspace-provider"
import { WorkspaceGuard } from "@/components/workspace-guard"
import { WorkspaceQueryPreloader } from "@/components/workspace-query-preloader"
import { DevErrorTrigger } from "@/components/dev-error-trigger"

const appRoutes = ["/app", "/app/setup", "/app/settings", "/app/settings/labels", "/app/settings/members", "/app/integrations", "/app/integrations/discord", "/app/integrations/linear", "/app/integrations/x", "/app/integrations/github", "/app/observability"]

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const pathname = usePathname()
  const isSetup = pathname === "/app/setup"

  return (
    <WorkspaceProvider>
      <RoutePrefetch routes={appRoutes} />
      <WorkspaceQueryPreloader />
      {process.env.NODE_ENV === "development" && <DevErrorTrigger target="app" />}
      <WorkspaceGuard>
        {isSetup ? (
          children
        ) : (
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="my-0">
              <PageTransition>{children}</PageTransition>
            </SidebarInset>
          </SidebarProvider>
        )}
      </WorkspaceGuard>
    </WorkspaceProvider>
  )
}
