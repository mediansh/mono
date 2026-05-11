import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const ADMIN_HOST = "https://admin.median.sh"

export default clerkMiddleware(async (auth, req) => {
  if (
    req.nextUrl.pathname === "/app/admin" ||
    req.nextUrl.pathname.startsWith("/app/admin/")
  ) {
    const adminPath = req.nextUrl.pathname.replace(/^\/app\/admin/, "") || "/"
    const redirectUrl = new URL(adminPath, ADMIN_HOST)
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
