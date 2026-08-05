import { NextResponse } from "next/server"

import { getLoDashboard } from "@/lib/lo/dashboard"

export const dynamic = "force-dynamic"

/** Read-only Lo dashboard data. Tool execution remains on the local Mac gateway. */
export async function GET(): Promise<NextResponse> {
  try {
    const dashboard = await getLoDashboard()
    return NextResponse.json(dashboard, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch {
    return NextResponse.json(
      { error: "Lo dashboard is temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    )
  }
}
