import { notFound } from "next/navigation"
import { currentUser } from "@clerk/nextjs/server"
import { isAdminUser } from "@/lib/admin"

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const user = await currentUser()

  if (!isAdminUser(user)) {
    notFound()
  }

  return <>{children}</>
}
