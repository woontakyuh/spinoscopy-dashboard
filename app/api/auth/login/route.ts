import { NextRequest, NextResponse } from "next/server"
import { isValidDashboardPassword } from "@/lib/demo"

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const dashboardPassword = process.env.DASHBOARD_PASSWORD ?? "spinoscopy2026"
  const demoPassword = process.env.DEMO_PASSWORD

  if (!isValidDashboardPassword(password, dashboardPassword, demoPassword)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Store whichever password matched so the middleware cookie check passes.
  const matched = password === dashboardPassword ? dashboardPassword : (demoPassword as string)
  const res = NextResponse.json({ success: true })
  res.cookies.set("dashboard-auth", matched, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  })
  return res
}
