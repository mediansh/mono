import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Create workspace",
}

export default function SetupLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <>{children}</>
}
