import { NextResponse } from "next/server"
import { listAllSenseiEntries } from "@/lib/notion/sensei"
import { calculateBjjStats, getTagFrequencies } from "@/lib/sensei/stats"

export async function GET() {
  try {
    const entries = await listAllSenseiEntries()
    const stats = calculateBjjStats(entries)
    const tagFrequencies = getTagFrequencies(entries)
    return NextResponse.json({ stats, tagFrequencies })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
