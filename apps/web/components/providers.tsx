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
              <Toaster
                position="bottom-center"
                toastOptions={{
                  className:
                    "!bg-background !text-foreground !border-border !shadow-lg !rounded-[10px] !text-[14px] !font-medium",
                  classNames: {
                    success: "[&>[data-icon]]:!text-emerald-500",
                    error: "[&>[data-icon]]:!text-red-500",
                    warning: "[&>[data-icon]]:!text-amber-500",
                    info: "[&>[data-icon]]:!text-blue-500",
                  },
                }}
              />
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
            <Toaster
              position="bottom-center"
              toastOptions={{
                className:
                  "!bg-background !text-foreground !border-border !shadow-lg !rounded-[10px] !text-[14px] !font-medium",
              }}
            />
          </ThemeProvider>
        </PostHogProvider>
      )}
    </ClerkProvider>
  )
}
