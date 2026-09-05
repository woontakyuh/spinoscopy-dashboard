import { NextResponse } from "next/server"
import { listAllSenseiEntries } from "@/lib/notion/sensei"
import { fetchSenseiData } from "@/lib/notion/senseiData"
import { calculateBjjStats, getTagFrequencies, getStudyTagFrequencies } from "@/lib/sensei/stats"

export async function GET() {
  try {
    const [entries, { archetypes }] = await Promise.all([listAllSenseiEntries(), fetchSenseiData()])
    const stats = calculateBjjStats(entries, archetypes)
    const tagFrequencies = getTagFrequencies(entries)
    const studyTagFrequencies = getStudyTagFrequencies(entries)
    return NextResponse.json({ stats, tagFrequencies, studyTagFrequencies })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
