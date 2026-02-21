import { NextRequest, NextResponse } from "next/server"
import { createDraft, deleteDraft, listDrafts, confirmDraft } from "@/lib/notion/drafts"
import { formatMemo } from "@/lib/ai/formatMemo"

export async function GET() {
  try {
    const drafts = await listDrafts()
    return NextResponse.json(drafts)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { rawInput?: string; category?: string }
    const rawInput = (body.rawInput ?? "").trim()

    if (!rawInput) {
      return NextResponse.json({ error: "rawInput required" }, { status: 400 })
    }

    const formatted = await formatMemo(rawInput, body.category)

    const draft = await createDraft({
      title: formatted.title,
      rawInput,
      markdown: formatted.markdown,
      category: formatted.category,
    })

    return NextResponse.json(draft)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as { pageId?: string; action?: "confirm" | "delete" }

    if (!body.pageId || !body.action) {
      return NextResponse.json({ error: "pageId and action required" }, { status: 400 })
    }

    if (body.action === "confirm") {
      await confirmDraft(body.pageId)
    } else {
      await deleteDraft(body.pageId)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
