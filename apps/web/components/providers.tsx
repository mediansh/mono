"use client"

import { ClerkProvider, useAuth } from "@clerk/nextjs"
import { ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { Toaster } from "sonner"

import { ErrorTracker } from "@/components/error-tracker"
import { PostHogProvider } from "@/components/posthog-provider"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { ThemeProvider } from "@/components/theme-provider"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null

export function Providers({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider afterSignOutUrl="/">
      {convex ? (
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <PostHogProvider>
            <ThemeProvider>
              <TooltipProvider>
                <ErrorTracker />
                {children}
              </TooltipProvider>
              <Toaster richColors position="bottom-right" />
            </ThemeProvider>
          </PostHogProvider>
        </ConvexProviderWithClerk>
      ) : (
        <PostHogProvider>
          <ThemeProvider>
            <TooltipProvider>
              <ErrorTracker />
              {children}
            </TooltipProvider>
            <Toaster richColors position="bottom-right" />
          </ThemeProvider>
        </PostHogProvider>
      )}
    </ClerkProvider>
  )
}
