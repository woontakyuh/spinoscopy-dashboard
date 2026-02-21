import { NextRequest, NextResponse } from "next/server"
import { formatMemo } from "@/lib/ai/formatMemo"

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { rawInput?: string; category?: string }
    const rawInput = (body.rawInput ?? "").trim()

    if (!rawInput) {
      return NextResponse.json({ error: "rawInput required" }, { status: 400 })
    }

    const formatted = await formatMemo(rawInput, body.category)
    return NextResponse.json(formatted)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
