import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const ADMIN_HOST = "https://admin.median.sh"

export default clerkMiddleware(async (auth, req) => {
  if (
    req.nextUrl.pathname === "/app/admin" ||
    req.nextUrl.pathname.startsWith("/app/admin/")
  ) {
    // Strip the /app/admin prefix and normalize so attacker paths like
    // `/app/admin//attacker.example/foo` cannot turn into a protocol-relative
    // URL that points at another origin.
    const rawPath = req.nextUrl.pathname.replace(/^\/app\/admin/, "") || "/"
    const normalizedPath =
      "/" + rawPath.replace(/^\/+/, "").replace(/\\+/g, "/")
    const redirectUrl = new URL(ADMIN_HOST)
    redirectUrl.pathname = normalizedPath
    redirectUrl.search = req.nextUrl.search
    return NextResponse.redirect(redirectUrl)
  }

  if (req.nextUrl.pathname.startsWith("/app")) {
    await auth.protect()
  }
})

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
}
