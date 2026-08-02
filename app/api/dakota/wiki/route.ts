import { NextResponse } from "next/server"
import { getWikiDbId, listWikiSnapshots } from "@/lib/notion/wikiState"

export async function GET() {
  try {
    const configured = Boolean(getWikiDbId())
    const snapshots = configured ? await listWikiSnapshots() : []
    return NextResponse.json({ configured, snapshots })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
