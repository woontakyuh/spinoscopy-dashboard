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

/**
 * X syndication timeline-profile 페이지의 __NEXT_DATA__ JSON에서 트윗 추출.
 * 구조가 자주 바뀌므로 id_str + (full_text|text) 가진 객체를 깊이 탐색해 모은다.
 */
export function extractTweetsFromNextData(root, handle) {
  const found = new Map() // id_str -> tweet
  const stack = [root]
  while (stack.length) {
    const node = stack.pop()
    if (!node || typeof node !== "object") continue
    if (Array.isArray(node)) {
      for (const v of node) stack.push(v)
      continue
    }
    const id = node.id_str ?? node.idStr
    const text = node.full_text ?? node.text
    if (typeof id === "string" && typeof text === "string" && !found.has(id)) {
      found.set(id, {
        platform: "x",
        account: handle,
        postId: id,
        text: text.trim(),
        url: `https://x.com/${handle}/status/${id}`,
        postedAt: normalizeDate(node.created_at),
      })
    }
    for (const v of Object.values(node)) {
      if (v && typeof v === "object") stack.push(v)
    }
  }
  return [...found.values()]
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
