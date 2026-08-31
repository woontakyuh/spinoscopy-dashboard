import type { Position, SenseiEntry } from "@/lib/types/sensei"

export interface PositionTrainingInfo {
  count: number
  lastDate: string | null
  videos: Array<{ url: string; title?: string }>
  recentNotes: Array<{ date: string; note: string }>
}

export function buildPositionTrainingMap(
  entries: readonly SenseiEntry[],
  positions: readonly Position[],
): Record<string, PositionTrainingInfo> {
  const map: Record<string, PositionTrainingInfo> = {}

  // Build lookup: for each position, what strings to match
  const matchTerms: Record<string, string[]> = {}
  for (const p of positions) {
    const terms = [p.id.toLowerCase(), p.name.toLowerCase()]
    if (p.nameKr) terms.push(p.nameKr.toLowerCase())
    matchTerms[p.id] = terms
  }

  for (const entry of entries) {
    const allTags = [...entry.classTags, ...entry.sparringTags, ...entry.studyTags]
      .map((t) => t.toLowerCase())

    for (const pos of positions) {
      const terms = matchTerms[pos.id]
      const matched = allTags.some((tag) =>
        terms.some((term) => tag.includes(term) || term.includes(tag))
      )
      if (!matched) continue

      if (!map[pos.id]) {
        map[pos.id] = { count: 0, lastDate: null, videos: [], recentNotes: [] }
      }
      const info = map[pos.id]
      info.count++
      if (entry.date && (!info.lastDate || entry.date > info.lastDate)) {
        info.lastDate = entry.date
      }
      if (entry.videoUrl && info.videos.length < 3 && !info.videos.some((v) => v.url === entry.videoUrl)) {
        info.videos.push({ url: entry.videoUrl, title: entry.videoTitle })
      }
      if (entry.note && info.recentNotes.length < 2) {
        info.recentNotes.push({
          date: entry.date ?? "",
          note: entry.note.slice(0, 100),
        })
      }
    }
  }
  return map
}
