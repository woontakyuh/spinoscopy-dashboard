import { NextRequest, NextResponse } from "next/server"
import { isDemoHost, isAllowedAgentPath } from "@/lib/demo"

// 대시보드 인증이 필요한 /api 경로. 나머지 legacy /api는 그대로 통과한다.
const AUTHED_API_PREFIXES = ["/api/lo", "/api/andrej"]
const PUBLIC_FILE_PATTERN = /\.[^/]+$/

/** `/api/andrej`와 `/api/andrej/...`만 매칭하고 `/api/andrejaeger`는 제외한다. */
function isUnderPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const demo = isDemoHost(req.headers.get("host"))

  if (pathname.startsWith("/login")) {
    return NextResponse.next()
  }

  // public/ 정적 자산은 인증 리다이렉트 대상이 아니다. 이미지 요청이 로그인
  // HTML로 바뀌면 <img>가 정상 파일을 가리켜도 브라우저에는 깨진 이미지로 보인다.
  if (PUBLIC_FILE_PATTERN.test(pathname)) {
    return NextResponse.next()
  }

  // Legacy /api routes bypass auth (Telegram, cron). Only the listed prefixes require auth.
  const needsApiAuth = AUTHED_API_PREFIXES.some((prefix) => isUnderPrefix(pathname, prefix))
  if (pathname.startsWith("/api") && !needsApiAuth) {
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
    // Block hidden agent pages — API endpoints only require authentication.
    if (!pathname.startsWith("/api") && !isAllowedAgentPath(pathname)) {
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
