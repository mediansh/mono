import type { Metadata } from "next"
import { AppPageClient } from "@/components/app-page-client"

export const metadata: Metadata = {
  title: "Home",
}

export default function AppPage() {
  return <AppPageClient />
}
