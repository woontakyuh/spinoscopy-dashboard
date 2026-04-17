import { NextResponse } from "next/server"
import { listInterestingCases } from "@/lib/notion/interestingCases"

export async function GET() {
  try {
    const cases = await listInterestingCases(200)
    return NextResponse.json(cases)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
