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
    const body = await res.text()
    throw new Error(`Notion API error ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}
