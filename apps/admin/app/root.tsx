import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router"
import { ClerkProvider, useAuth } from "@clerk/clerk-react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { Toaster } from "sonner"

import type { Route } from "./+types/root"
import { convex } from "./lib/convex"
import "./styles/app.css"

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&family=Geist:wght@400;500;600;700&display=swap",
  },
]

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="antialiased font-sans">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Admin — Median</title>
        <Meta />
        <Links />
      </head>
      <body className="bg-background text-foreground">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined

function ConvexWithClerk({ children }: { children: React.ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
      <Toaster
        position="bottom-center"
        toastOptions={{
          className:
            "!bg-background !text-foreground !border-border !shadow-lg !text-[13px] !font-medium",
          classNames: {
            success: "[&>[data-icon]]:!text-emerald-500",
            error: "[&>[data-icon]]:!text-red-500",
            warning: "[&>[data-icon]]:!text-amber-500",
            info: "[&>[data-icon]]:!text-blue-500",
          },
        }}
      />
    </ConvexProviderWithClerk>
  )
}

export default function App() {
  if (!clerkPublishableKey) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="max-w-md p-6 text-center">
          <div className="text-[13px] font-semibold">Missing configuration</div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Set <code className="font-mono">VITE_CLERK_PUBLISHABLE_KEY</code>{" "}
            and <code className="font-mono">VITE_CONVEX_URL</code> in the admin
            app environment to continue.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      afterSignOutUrl="/sign-in"
    >
      <ConvexWithClerk>
        <Outlet />
      </ConvexWithClerk>
    </ClerkProvider>
  )
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong"
  let details = "An unexpected error occurred."
  let stack: string | undefined

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Not found" : `${error.status}`
    details =
      error.status === 404
        ? "This page could not be found."
        : error.statusText || details
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message
    stack = error.stack
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-[15px] font-semibold">{message}</h1>
      <p className="mt-1 text-[12px] text-muted-foreground">{details}</p>
      {stack && (
        <pre className="mt-4 w-full overflow-x-auto border border-border bg-muted p-3 text-[11px]">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  )
}
