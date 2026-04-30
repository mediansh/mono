import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const HAS_WORKSPACE_COOKIE = "median_has_workspace"

export default clerkMiddleware(async (auth, req) => {
  if (req.nextUrl.pathname.startsWith("/app")) {
    await auth.protect()
  }

  if (req.nextUrl.pathname === "/app/setup" && req.cookies.get(HAS_WORKSPACE_COOKIE)?.value === "1") {
    return NextResponse.redirect(new URL("/app", req.url))
  }
})

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
}
