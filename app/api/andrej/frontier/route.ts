import { NextResponse } from "next/server"

import { getAiFrontierIndex } from "@/lib/notion/ai-frontier"
import type { AiFrontierIndex } from "@/lib/types/ai-frontier"

/** 인증된 브라우저만 보는 개인 데이터라 캐시를 남기지 않는다. */
const NO_STORE = { "Cache-Control": "private, no-store" } as const

export type AiFrontierIndexLoader = () => Promise<AiFrontierIndex>

/** 로더가 예상 밖으로 reject 했을 때 돌려주는 정직한 "전부 못 읽음" 상태. */
const UNAVAILABLE_INDEX: AiFrontierIndex = {
  status: "unavailable",
  sources: { episodes: "unavailable", concepts: "unavailable" },
  episodes: [],
  concepts: [],
  episodeIndex: {},
}

/**
 * index 응답은 ok/partial/unavailable 모두 HTTP 200이다.
 * 한쪽 DB만 죽어도 나머지는 그대로 보여줘야 하므로 상태는 body 안에서만 구분한다.
 */
export function createFrontierIndexHandler(load: AiFrontierIndexLoader) {
  return async function GET(): Promise<NextResponse> {
    try {
      const index = await load()
      return NextResponse.json(index, { status: 200, headers: NO_STORE })
    } catch {
      // Notion 오류 원문(토큰·상태코드)이 클라이언트로 새지 않도록 삼킨다.
      return NextResponse.json(UNAVAILABLE_INDEX, { status: 200, headers: NO_STORE })
    }
  }
}

export const GET = createFrontierIndexHandler(() => getAiFrontierIndex())
