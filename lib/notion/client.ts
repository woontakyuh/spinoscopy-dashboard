const NOTION_API_BASE = "https://api.notion.com/v1"

/**
 * Notion 관련 환경변수를 읽는다. 앞뒤 공백·개행을 제거한다.
 *
 * 2026-08-05 사고: Vercel 대시보드에 값을 붙여넣을 때 끝에 개행이 섞여
 * `database_id`가 uuid 검증에 걸려 400이 났다(조회는 URL 경로라 통과, 생성만 사망).
 * env를 직접 읽지 말고 반드시 이 함수를 쓴다.
 */
export function notionEnv(name: string): string {
  return (process.env[name] ?? "").trim()
}

// Notion 이 왜 거절했는지(code·message)만 남긴다. 응답 본문 전체는 버린다 — 비밀값이
// 섞여 나올 수 있어서다. message 에도 토큰처럼 생긴 문자열은 가린다.
//
// 2026-10-11: 저널 DB 스키마 크기 초과("Your database schema has exceeded the maximum
// size")로 4일간 알림 메일·DOI 원문신청이 전부 죽었는데, 로그엔 "Notion API request
// failed." 만 찍혀 원인을 아무도 몰랐다.
const SECRETISH = /\b(?:secret_|ntn_|sk-|token_)[A-Za-z0-9_-]{6,}/g

export function summarizeNotionError(body: string): { code?: string; message?: string } {
  try {
    const j = JSON.parse(body) as { object?: string; code?: unknown; message?: unknown }
    if (j?.object !== "error") return {}
    return {
      code: typeof j.code === "string" ? j.code.slice(0, 60) : undefined,
      message:
        typeof j.message === "string" ? j.message.replace(SECRETISH, "[redacted]").slice(0, 300) : undefined,
    }
  } catch {
    return {}
  }
}

export class NotionRequestError extends Error {
  readonly name = "NotionRequestError"

  constructor(
    readonly status: number,
    readonly notionCode?: string,
    readonly notionMessage?: string
  ) {
    super("Notion API request failed.")
  }
}

/** 로그·사용자 화면용 한 줄. Notion 거절 사유가 있으면 붙인다. */
export function describeError(error: unknown): string {
  if (error instanceof NotionRequestError) {
    const why = [error.notionCode, error.notionMessage].filter(Boolean).join(": ")
    return `Notion 요청 실패(${error.status})${why ? ` — ${why}` : ""}`
  }
  return error instanceof Error ? error.message : String(error)
}

export async function notionRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${NOTION_API_BASE}${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${notionEnv("NOTION_TOKEN")}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  })
  if (!res.ok) {
    const { code, message } = summarizeNotionError(await res.text())
    throw new NotionRequestError(res.status, code, message)
  }
  return res.json() as Promise<T>
}
