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
