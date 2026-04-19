import { NextResponse } from "next/server"
import { getPlayerProfileSections } from "@/lib/notion/lo"

export async function GET() {
  try {
    const sections = await getPlayerProfileSections()
    return NextResponse.json(sections)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
