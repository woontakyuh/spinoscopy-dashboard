import { NextRequest, NextResponse } from "next/server"
import { updateProm, createCase } from "@/lib/notion/patients"
import type { NewCaseInput } from "@/lib/types/patient"

export async function PATCH(req: NextRequest) {
  try {
    const { pageId, timepoint, scores } = await req.json()
    if (!pageId || !timepoint || !scores) {
      return NextResponse.json({ error: "pageId, timepoint, scores required" }, { status: 400 })
    }
    await updateProm(pageId, timepoint, scores)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const input: NewCaseInput = await req.json()
    const pageId = await createCase(input)
    return NextResponse.json({ success: true, pageId })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
