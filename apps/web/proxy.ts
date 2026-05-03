import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const HAS_WORKSPACE_COOKIE = "median_has_workspace"
const ADMIN_HOST = "https://admin.median.sh"

export default clerkMiddleware((auth, req) => {
  if (
    req.nextUrl.pathname === "/app/admin" ||
    req.nextUrl.pathname.startsWith("/app/admin/")
  ) {
    const adminPath = req.nextUrl.pathname.replace(/^\/app\/admin/, "") || "/"
    const redirectUrl = new URL(adminPath, ADMIN_HOST)
    redirectUrl.search = req.nextUrl.search
    return NextResponse.redirect(redirectUrl)
  }

  if (req.nextUrl.pathname === "/app/setup" && req.cookies.get(HAS_WORKSPACE_COOKIE)?.value === "1") {
    return NextResponse.redirect(new URL("/app", req.url))
  }
})

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
}
