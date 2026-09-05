import type { SenseiEntry } from "@/lib/types/sensei"

export const TRAINING_FILTERS = ["class", "sparring", "study"] as const

export type TrainingFilter = (typeof TRAINING_FILTERS)[number]
export type TrainingRuleSet = "gi" | "nogi"

const NOGI_PATTERN = /(?:^|[\s()[\]·—/-])(no[\s-]?gi|노기)(?=$|[\s()[\]·—/-])/i

export function isRuleSetTag(value: string): boolean {
  return NOGI_PATTERN.test(value.trim())
}

export function getTrainingRuleSet(entry: SenseiEntry): TrainingRuleSet | null {
  if (entry.sessionType === "study" || entry.sessionType === "promotion") return null

  const searchable = [
    entry.title,
    ...entry.classTags,
    ...entry.sparringTags,
  ].join(" ")

  return NOGI_PATTERN.test(searchable) ? "nogi" : "gi"
}

export function matchesTrainingFilter(
  entry: SenseiEntry,
  filter: TrainingFilter | null,
): boolean {
  if (filter === null) return true

  switch (filter) {
    case "class":
      return entry.sessionType === "class"
    case "sparring":
      return entry.sessionType === "openmat" || entry.sparringTags.length > 0
    case "study":
      return entry.sessionType === "study" || entry.studyTags.length > 0
  }
}

/** 홈 히트맵 → Training 탭으로 넘어올 때 "어느 날, 어느 태그" 를 들고 온다 */
export interface TrainingTarget {
  date?: string
  tag?: string
}

/** 기록의 해시태그 — 수업·스파링·공부 태그를 합치고 Gi/NoGi 같은 룰셋 표기는 뺀다 */
export function entryTags(entry: SenseiEntry): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [...entry.classTags, ...entry.sparringTags, ...entry.studyTags]) {
    const tag = raw.trim()
    if (!tag || isRuleSetTag(tag) || tag === "Gi") continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

export function entryHasTag(entry: SenseiEntry, tag: string): boolean {
  const want = tag.trim().toLowerCase()
  return entryTags(entry).some((t) => t.toLowerCase() === want)
}
