"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
} from "@workspace/ui/components/sidebar"

export function EmptySidebarShell({
  children,
}: Readonly<{ children?: React.ReactNode }>) {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarContent />
      </Sidebar>
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
