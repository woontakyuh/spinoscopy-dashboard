import { NextResponse } from "next/server"

import {
  AiFrontierImportConflictError,
  AiFrontierImportError,
  AiFrontierImportNotFoundError,
  importAiFrontierEpisode,
} from "@/lib/andrej/frontier-import"
import type { AiFrontierImportResult } from "@/lib/types/ai-frontier-import"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const NO_STORE = { "Cache-Control": "private, no-store" } as const
const PAGE_ID_PATTERN = /^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ImportContext {
  params: Promise<{ pageId: string }>
}

type ImportRunner = (pageId: string) => Promise<AiFrontierImportResult>

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

function validPageId(value: string): string | null {
  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return null
  }
  const trimmed = decoded.trim()
  return PAGE_ID_PATTERN.test(trimmed) ? trimmed : null
}

export function createFrontierImportHandler(run: ImportRunner) {
  return async function POST(
    _request: Request,
    context: ImportContext
  ): Promise<NextResponse> {
    const { pageId: rawPageId } = await context.params
    const pageId = validPageId(rawPageId ?? "")
    if (!pageId) return json({ error: "잘못된 에피소드 ID입니다." }, 400)

    try {
      const result = await run(pageId)
      return json(result, 200)
    } catch (error) {
      if (error instanceof AiFrontierImportNotFoundError) {
        return json({ error: "에피소드 원문 링크를 찾을 수 없습니다." }, 404)
      }
      if (error instanceof AiFrontierImportConflictError) {
        return json({ error: "이미 완료됐거나 수집 중인 에피소드입니다." }, 409)
      }
      if (error instanceof AiFrontierImportError) {
        return json({ error: "에피소드 자료를 가져오지 못했습니다." }, 502)
      }
      return json({ error: "에피소드 수집 중 오류가 발생했습니다." }, 500)
    }
  }
}

export const POST = createFrontierImportHandler((pageId) =>
  importAiFrontierEpisode(pageId)
)
