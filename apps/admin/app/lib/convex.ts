import { ConvexReactClient } from "convex/react"

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined

if (!convexUrl && typeof window !== "undefined") {
  console.warn(
    "[admin] VITE_CONVEX_URL is not set — Convex queries will not work.",
  )
}

export const convex = new ConvexReactClient(convexUrl ?? "https://missing-convex-url.convex.cloud")

export { api } from "@/convex/_generated/api"
export type { Id } from "@/convex/_generated/dataModel"
