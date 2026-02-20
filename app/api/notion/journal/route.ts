import { NextRequest, NextResponse } from "next/server"
import {
  queryArticles,
  getArticle,
  toggleRead,
  updateInterest,
  getJournalStats,
} from "@/lib/notion/journal"
import type { InterestLevel, JournalFilter } from "@/lib/types/journal"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get("action")

  try {
    if (action === "stats") {
      const stats = await getJournalStats()
      return NextResponse.json(stats)
    }

    if (action === "detail") {
      const pageId = searchParams.get("pageId")
      if (!pageId) return NextResponse.json({ error: "pageId required" }, { status: 400 })
      const article = await getArticle(pageId)
      return NextResponse.json(article)
    }

    const filter: JournalFilter = {
      interest: (searchParams.get("interest") as JournalFilter["interest"]) ?? "all",
      journal: searchParams.get("journal") ?? "all",
      category: searchParams.get("category") ?? "all",
      read: searchParams.get("read") === "true" ? true : searchParams.get("read") === "false" ? false : "all",
      search: searchParams.get("search") ?? undefined,
      sort: (searchParams.get("sort") as JournalFilter["sort"]) ?? "date_desc",
      cursor: searchParams.get("cursor") ?? undefined,
    }

    const result = await queryArticles(filter)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { pageId, action, value } = body as {
      pageId: string
      action: "toggleRead" | "updateInterest"
      value: boolean | InterestLevel
    }

    if (!pageId) {
      return NextResponse.json({ error: "pageId required" }, { status: 400 })
    }

    if (action === "toggleRead") {
      await toggleRead(pageId, value as boolean)
    } else if (action === "updateInterest") {
      await updateInterest(pageId, value as InterestLevel)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
