import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const expected = process.env.DASHBOARD_PASSWORD ?? "spinoscopy2026"

  if (password !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const res = NextResponse.json({ success: true })
  res.cookies.set("dashboard-auth", expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  })
  return res
}
