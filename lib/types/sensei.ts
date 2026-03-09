export type SenseiSessionType = "class" | "openmat" | "promotion"

export interface SenseiEntry {
  id: string
  title: string
  sessionType: SenseiSessionType
  date: string | null
  instructor: string
  gym: string
  classTags: string[]
  sparringTags: string[]
  note: string
  url: string
}

export interface StructuredBjjNote {
  title: string
  sessionType: SenseiSessionType
  date: string
  instructor: string
  gym: string
  classTags: string[]
  sparringTags: string[]
  note: string
}
