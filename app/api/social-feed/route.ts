import { NextResponse } from "next/server"
import { querySocialItems } from "@/lib/notion/social"
import type { SocialFeedResponse } from "@/lib/types/social"

export const dynamic = "force-dynamic"

// Notion "Social Feed" DB를 읽어 소셜 컬럼용 아이템 반환.
// 수집(Threads/X 스크래핑)은 맥 mini 수집기가 담당 — 여기선 저장된 것만 읽는다.
export async function GET() {
  try {
    const items = await querySocialItems(100)
    const response: SocialFeedResponse = {
      items,
      fetchedAt: new Date().toISOString(),
    }
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
