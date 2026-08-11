import { NextRequest, NextResponse } from "next/server"
import {
  queryArticles,
  getArticle,
  toggleRead,
  updateInterest,
  getJournalStats,
  getDashboardData,
} from "@/lib/notion/journal"
import type { InterestLevel, JournalFilter } from "@/lib/types/journal"
import { requestFulltext, cancelFulltextRequest, addFulltextRequestByDoi } from "@/lib/notion/fulltext"
import { publishTrigger } from "@/lib/fulltext/ably"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get("action")

  try {
    if (action === "stats") {
      const stats = await getJournalStats()
      return NextResponse.json(stats)
    }

    if (action === "dashboard") {
      const data = await getDashboardData()
      return NextResponse.json(data, {
        headers: { "Cache-Control": "public, max-age=300" },
      })
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
      fulltext: (searchParams.get("fulltext") as JournalFilter["fulltext"]) ?? "all",
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
      action: "toggleRead" | "updateInterest" | "requestFulltext" | "cancelFulltext"
      value: boolean | InterestLevel
    }

    if (!pageId) {
      return NextResponse.json({ error: "pageId required" }, { status: 400 })
    }

    if (action === "toggleRead") {
      await toggleRead(pageId, value as boolean)
    } else if (action === "updateInterest") {
      await updateInterest(pageId, value as InterestLevel)
    } else if (action === "requestFulltext") {
      await requestFulltext(pageId)
      await publishTrigger(pageId)
    } else if (action === "cancelFulltext") {
      await cancelFulltextRequest(pageId)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// 밖에서 본 논문을 DOI/링크로 원문요청 큐에 추가
export async function POST(req: NextRequest) {
  try {
    const { doi } = (await req.json()) as { doi?: string }
    if (!doi || typeof doi !== "string" || !doi.trim()) {
      return NextResponse.json({ error: "DOI 또는 링크를 입력해 주세요." }, { status: 400 })
    }
    const result = await addFulltextRequestByDoi(doi)
    await publishTrigger(result.pageId)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
