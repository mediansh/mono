"use client"

import { usePathname } from "next/navigation"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@workspace/ui/components/sidebar"
import { AppSidebar } from "@/components/sidebar"
import { PageTransition } from "@/components/page-transition"
import { RoutePrefetch } from "@/components/route-prefetch"
import { WorkspaceProvider } from "@/components/workspace-provider"
import { WorkspaceGuard } from "@/components/workspace-guard"
import { WorkspaceQueryPreloader } from "@/components/workspace-query-preloader"
import { PlanGuard } from "@/components/plan-guard"
import { DevErrorTrigger } from "@/components/dev-error-trigger"
import { Logo } from "@/components/logo"
import Link from "next/link"
import { Separator } from "@workspace/ui/components/separator"

const appRoutes = ["/app", "/app/setup", "/app/settings", "/app/settings/labels", "/app/settings/members", "/app/logs", "/app/integrations", "/app/integrations/discord", "/app/integrations/linear", "/app/integrations/x", "/app/integrations/github", "/app/billing"]

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
              {/* Mobile header — visible only below md breakpoint */}
              <header className="sticky top-0 z-30 flex h-11 items-center gap-2 border-b border-sidebar-border bg-sidebar px-2 md:hidden">
                <SidebarTrigger />
                <Separator orientation="vertical" className="h-4" />
                <Link href="/app" className="flex items-center">
                  <Logo symbolOnly className="size-5" />
                </Link>
              </header>
              <PlanGuard>
                <PageTransition>{children}</PageTransition>
              </PlanGuard>
            </SidebarInset>
          </SidebarProvider>
        )}
      </WorkspaceGuard>
    </WorkspaceProvider>
  )
}
