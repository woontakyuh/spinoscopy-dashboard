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

// RPG System Types

export interface BjjAttributes {
  guard: number
  passing: number
  control: number
  finishing: number
  takedowns: number
  legLocks: number
}

export interface BjjStats {
  level: number
  totalSessions: number
  xpCurrent: number
  xpToNext: number
  belt: string
  attributes: BjjAttributes
  ovr: number
  ovrRole: string
  playstyle: string
  recentFocus: string[]
  streaks: { current: number; best: number }
  giRatio: number
}

export interface Archetype {
  name: string
  flag: string
  nickname: string
  team: string
  stats: BjjAttributes
  tags: string[]
  playstyle: string
  ruleSet: "gi" | "nogi" | "both"
  category: "gi-legend" | "gi-active" | "nogi" | "special"
  isCustom?: boolean
  editableStats?: boolean
  styleReferences?: string[]
  bio?: string
}
