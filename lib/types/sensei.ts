export interface SenseiEntry {
  id: string
  title: string
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
  date: string
  instructor: string
  gym: string
  classTags: string[]
  sparringTags: string[]
  note: string
}
