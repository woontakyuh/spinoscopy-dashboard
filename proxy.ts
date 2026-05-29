import { NextRequest, NextResponse } from "next/server"
import { isDemoHost, isAllowedAgentPath } from "@/lib/demo"

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const demo = isDemoHost(req.headers.get("host"))

  if (pathname.startsWith("/login") || pathname.startsWith("/api")) {
    return NextResponse.next()
  }

  const authCookie = req.cookies.get("dashboard-auth")?.value
  const dashboardPassword = process.env.DASHBOARD_PASSWORD ?? "spinoscopy2026"
  const demoPassword = process.env.DEMO_PASSWORD
  // Main host: only the dashboard password. Demo host: dashboard or demo password.
  const authed =
    !!authCookie &&
    (authCookie === dashboardPassword ||
      (demo && !!demoPassword && authCookie === demoPassword))

  if (!authed) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("from", pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (demo) {
    // Block hidden agent pages — send back to home.
    if (!isAllowedAgentPath(pathname)) {
      return NextResponse.redirect(new URL("/", req.url))
    }
    // Forward a demo flag header for the server layout to read.
    const headers = new Headers(req.headers)
    headers.set("x-demo", "1")
    return NextResponse.next({ request: { headers } })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
