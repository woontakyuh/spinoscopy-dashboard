import { NextRequest, NextResponse } from "next/server"

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith("/login") || pathname.startsWith("/api")) {
    return NextResponse.next()
  }

  const authCookie = req.cookies.get("dashboard-auth")
  const password = process.env.DASHBOARD_PASSWORD ?? "spinoscopy2026"

  if (!authCookie || authCookie.value !== password) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("from", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
