import { NextRequest, NextResponse } from "next/server"
import { searchPatients, getPatientProm, getPatientProfile } from "@/lib/notion/patients"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q") ?? ""
  const pageId = searchParams.get("pageId")
  const action = searchParams.get("action")

  try {
    if (pageId && action === "profile") {
      const profile = await getPatientProfile(pageId)
      return NextResponse.json(profile)
    }
    if (pageId) {
      const prom = await getPatientProm(pageId)
      return NextResponse.json(prom)
    }
    if (q.length < 1) return NextResponse.json([])
    const patients = await searchPatients(q)
    return NextResponse.json(patients)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
