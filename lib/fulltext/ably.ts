export const ABLY_CHANNEL = "fulltext-trigger"
export const ABLY_EVENT = "request"

const ABLY_KEY = process.env.ABLY_API_KEY ?? ""

export function ablyAuthHeader(key: string): string {
  return "Basic " + Buffer.from(key).toString("base64")
}

/**
 * 워커를 즉시 깨우는 트리거를 Ably 채널에 발행한다.
 * 키 미설정/네트워크 실패는 조용히 무시 — 백업 폴링이 결국 큐를 집어간다.
 */
export async function publishTrigger(pageId?: string): Promise<void> {
  if (!ABLY_KEY) return
  try {
    await fetch(`https://rest.ably.io/channels/${ABLY_CHANNEL}/messages`, {
      method: "POST",
      headers: { Authorization: ablyAuthHeader(ABLY_KEY), "Content-Type": "application/json" },
      body: JSON.stringify({ name: ABLY_EVENT, data: pageId ? { pageId } : {} }),
    })
  } catch {
    /* 백업 폴링이 커버 */
  }
}
