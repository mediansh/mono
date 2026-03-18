import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sign up",
}

export default function SignUpLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <>{children}</>
}
