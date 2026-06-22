// 순수 함수들 (네트워크/IO 없음) — 단위 테스트 대상.

/** Notion Title용 첫 줄 요약 */
export function firstLine(text, max = 80) {
  const line = (text || "").split("\n").map((s) => s.trim()).find(Boolean) ?? ""
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** 이미 저장된 PostId 집합을 제외하고 새 항목만 반환 */
export function dedupeByPostId(items, existingPostIds) {
  const seen = new Set(existingPostIds)
  const out = []
  for (const it of items) {
    if (!it || !it.postId || seen.has(it.postId)) continue
    seen.add(it.postId)
    out.push(it)
  }
  return out
}

/** 다양한 날짜 표현을 ISO(YYYY-MM-DD)로. 실패 시 "" */
export function normalizeDate(raw) {
  if (!raw) return ""
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ""
  return d.toISOString().slice(0, 10)
}

/** 수집 항목 → Notion page properties */
export function toNotionProperties(item, collectedAtISO) {
  const props = {
    Title: { title: [{ text: { content: firstLine(item.text) || `(${item.platform})` } }] },
    Platform: { select: { name: item.platform } },
    Account: { rich_text: [{ text: { content: item.account } }] },
    PostId: { rich_text: [{ text: { content: item.postId } }] },
    URL: { url: item.url || null },
    FullText: { rich_text: [{ text: { content: (item.text || "").slice(0, 1900) } }] },
    CollectedAt: { date: { start: collectedAtISO } },
  }
  if (item.postedAt) props.PostedAt = { date: { start: item.postedAt } }
  return props
}
