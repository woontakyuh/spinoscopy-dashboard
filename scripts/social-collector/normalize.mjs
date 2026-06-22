// 순수 함수들 (네트워크/IO 없음) — 단위 테스트 대상.

/** Notion Title용 첫 줄 요약 */
export function firstLine(text, max = 80) {
  const line = (text || "").split("\n").map((s) => s.trim()).find(Boolean) ?? ""
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/**
 * Threads 컨테이너 본문 앞에 붙는 메타(계정명·상대시각·빈 줄)를 제거.
 * 예: "choi.openai\n14분\n실제 본문…" → "실제 본문…"
 */
export function cleanThreadText(text, account) {
  const lines = (text || "").split("\n")
  const isMeta = (l) => {
    const t = l.trim()
    if (!t) return true
    if (account && t === account) return true
    if (/^\d+\s*(초|분|시간|일|주|개월|년)$/.test(t)) return true // 14분, 2시간, 5일
    if (/^\d+[smhdw]$/i.test(t)) return true // 14m, 2h, 5d
    return false
  }
  let i = 0
  while (i < lines.length && isMeta(lines[i])) i++
  return lines.slice(i).join("\n").trim()
}

/** YYYY-MM-DD 기준 N일 전 컷오프 문자열 */
export function sinceDate(days, nowMs) {
  return new Date(nowMs - days * 86400000).toISOString().slice(0, 10)
}

/** postedAt(YYYY-MM-DD)가 cutoff 이상이거나 비어있으면 통과 */
export function withinSince(item, cutoff) {
  return !item.postedAt || item.postedAt >= cutoff
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
