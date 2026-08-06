import { NextResponse } from "next/server"

import { getAiFrontierEpisodeDetail } from "@/lib/notion/ai-frontier"
import type { AiFrontierEpisodeDetail } from "@/lib/types/ai-frontier"

/** 인증된 브라우저만 보는 개인 데이터라 캐시를 남기지 않는다. */
const NO_STORE = { "Cache-Control": "private, no-store" } as const

/** Notion page id: 32자리 hex 또는 dashed UUID만 허용한다. */
const PAGE_ID_PATTERN = /^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type AiFrontierDetailLoader = (pageId: string) => Promise<AiFrontierEpisodeDetail>

export interface FrontierDetailContext {
  params: Promise<{ pageId: string }>
}

function decodePageId(raw: string): string | null {
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    // 잘못 인코딩된 값은 원문 그대로 두고 아래 형식 검사에서 걸러낸다.
  }
  const trimmed = decoded.trim()
  return PAGE_ID_PATTERN.test(trimmed) ? trimmed : null
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.name === "AiFrontierEpisodeNotFoundError"
}

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE })
}

/**
 * 잘못된 id는 400, index에 없는 에피소드는 404, Notion 실패는 502.
 * 502 본문에는 Notion 원문 오류(토큰·상태코드)를 절대 넣지 않는다.
 */
export function createFrontierDetailHandler(load: AiFrontierDetailLoader) {
  return async function GET(
    _req: Request,
    context: FrontierDetailContext,
  ): Promise<NextResponse> {
    const { pageId } = await context.params
    const validId = decodePageId(pageId ?? "")
    if (!validId) {
      return errorResponse("잘못된 에피소드 ID입니다.", 400)
    }

    try {
      const detail = await load(validId)
      return NextResponse.json(detail, { status: 200, headers: NO_STORE })
    } catch (error) {
      if (isNotFound(error)) {
        return errorResponse("해당 에피소드를 찾을 수 없습니다.", 404)
      }
      return errorResponse("에피소드 본문을 불러오지 못했습니다.", 502)
    }
  }
}

export const GET = createFrontierDetailHandler((pageId) => getAiFrontierEpisodeDetail(pageId))
