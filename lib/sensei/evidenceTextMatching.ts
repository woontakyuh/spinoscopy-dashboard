import type { Position } from "@/lib/types/sensei"

export interface EvidenceMatch {
  id: string
  index: number
  length: number
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function findTermIndexes(text: string, term: string): number[] {
  const normalizedText = text.toLowerCase()
  const normalizedTerm = term.trim().toLowerCase()
  if (!normalizedTerm) return []

  if (/^[a-z0-9][a-z0-9 _-]*$/i.test(normalizedTerm)) {
    const pattern = new RegExp(
      `(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}(?=$|[^a-z0-9])`,
      "gi",
    )
    return [...normalizedText.matchAll(pattern)].map(
      (match) => match.index + match[1].length,
    )
  }

  const indexes: number[] = []
  let cursor = 0
  while (cursor < normalizedText.length) {
    const index = normalizedText.indexOf(normalizedTerm, cursor)
    if (index < 0) break
    indexes.push(index)
    cursor = index + normalizedTerm.length
  }
  return indexes
}

export function findEvidenceMatches(
  text: string,
  position: Position,
  aliases: Readonly<Record<string, readonly string[]>>,
): EvidenceMatch[] {
  const terms = [...new Set([
    position.id,
    position.name,
    position.nameKr,
    ...(aliases[position.id] ?? []),
  ])]
  const lengthByIndex = new Map<number, number>()
  for (const term of terms) {
    for (const index of findTermIndexes(text, term)) {
      lengthByIndex.set(index, Math.max(lengthByIndex.get(index) ?? 0, term.length))
    }
  }

  return [...lengthByIndex].map(([index, length]) => ({
    id: position.id,
    index,
    length,
  }))
}

export function buildEvidenceSnippet(
  segment: string,
  source: EvidenceMatch,
  finish: EvidenceMatch,
): string {
  const matchStart = Math.min(source.index, finish.index)
  const matchEnd = Math.max(
    source.index + source.length,
    finish.index + finish.length,
  )
  const windowStart = Math.max(0, matchStart - 48)
  const windowEnd = Math.min(segment.length, matchEnd + 48)
  const prefix = windowStart > 0 ? "…" : ""
  const suffix = windowEnd < segment.length ? "…" : ""
  return `${prefix}${segment.slice(windowStart, windowEnd).trim()}${suffix}`
}
