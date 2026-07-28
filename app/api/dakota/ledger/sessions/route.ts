import { NextResponse } from "next/server"
import { getSessionLogDbId, listSessionLogs } from "@/lib/notion/sessionLog"

export async function GET() {
  try {
    const configured = Boolean(getSessionLogDbId())
    const sessions = configured ? await listSessionLogs() : []
    return NextResponse.json({ configured, sessions })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
