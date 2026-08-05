import { DEFAULT_PROFILE } from "@/lib/sensei/userProfile"

export const LO_PROFILE_DB_ID_ENV = "NOTION_LO_PROFILE_DB_ID"
export const LO_MEMORY_DB_ID_ENV = "NOTION_LO_MEMORY_DB_ID"

/** Existing, read-only source databases. */
export const FITNESS_LOG_DB_ID = "3af908af-25b9-81bb-ac97-d7b0462f5e64"
export const BJJ_TRAINING_DB_ID = "2e7908af-25b9-8097-8098-c857bdc0acbe"

export const LO_MEMORY_CATEGORIES = [
  "profile", "preference", "person", "project", "rule", "fact", "event",
] as const
export type LoMemoryCategory = (typeof LO_MEMORY_CATEGORIES)[number]

export const LO_MEMORY_SOURCE_KINDS = [
  "manual", "chat", "bjj_training", "fitness_log", "gateway", "migration",
] as const
export type LoMemorySourceKind = (typeof LO_MEMORY_SOURCE_KINDS)[number]

export const LO_MEMORY_STATUSES = ["active", "superseded"] as const
export type LoMemoryStatus = (typeof LO_MEMORY_STATUSES)[number]

export const LO_BELTS = ["white", "blue", "purple", "brown", "black"] as const
export type LoBelt = (typeof LO_BELTS)[number]

export const LO_PROFILE_ROLES = ["student", "instructor", "admin"] as const
export type LoProfileRole = (typeof LO_PROFILE_ROLES)[number]

export interface LoBjjAttributes {
  guard: number
  passing: number
  control: number
  finishing: number
  takedowns: number
  legLocks: number
}

export interface LoPromotionHistoryEntry {
  date: string
  belt: LoBelt
  stripes: number
  label: string
  ceremony: boolean
}

export interface LoProfileSeed {
  name: string
  belt: LoBelt
  stripes: number
  trainingStartDate: string
  gym: string
  instructor: string
  avatarUrl: string | null
  promotionHistory: LoPromotionHistoryEntry[]
  baseStats: {    gi: LoBjjAttributes
    nogi: LoBjjAttributes
  }
  role: LoProfileRole
}

/**
 * The single Lo Profile row starts from the profile that currently powers the
 * existing Sensei UI. Keeping this derived from that source prevents divergent
 * profile defaults while the old UI is retired.
 */
export const DEFAULT_LO_PROFILE: LoProfileSeed = {
  name: DEFAULT_PROFILE.name,
  belt: DEFAULT_PROFILE.belt as LoBelt,
  stripes: DEFAULT_PROFILE.stripes,
  trainingStartDate: DEFAULT_PROFILE.trainingStartDate,
  gym: DEFAULT_PROFILE.gym,
  instructor: DEFAULT_PROFILE.instructor,
  avatarUrl: DEFAULT_PROFILE.avatarUrl ?? null,
  promotionHistory: [
    { date: "2019-11-27", belt: "white", stripes: 0, label: "화이트벨트 시작", ceremony: false },
    { date: "2020-06-20", belt: "white", stripes: 1, label: "화이트 1그랄", ceremony: false },
    { date: "2021-01-19", belt: "white", stripes: 2, label: "화이트 2그랄", ceremony: false },
    { date: "2023-11-10", belt: "white", stripes: 3, label: "화이트 3그랄", ceremony: false },
    { date: "2024-03-08", belt: "white", stripes: 4, label: "화이트 4그랄", ceremony: false },
    { date: "2024-07-19", belt: "blue", stripes: 0, label: "블루벨트 승급", ceremony: false },
    { date: "2025-09-26", belt: "blue", stripes: 1, label: "블루 1그랄", ceremony: true },
    { date: "2025-09-26", belt: "blue", stripes: 2, label: "블루 2그랄", ceremony: true },
    { date: "2026-03-20", belt: "blue", stripes: 3, label: "블루 3그랄", ceremony: true },
  ],
  baseStats: {
    gi: { ...DEFAULT_PROFILE.baseStats.gi },
    nogi: { ...DEFAULT_PROFILE.baseStats.nogi },
  },
  role: DEFAULT_PROFILE.role ?? "student",
}

export interface LoProfile extends LoProfileSeed {
  pageId: string
  url: string
}

export interface LoMemorySource {
  kind: LoMemorySourceKind
  reference: string
  capturedAt: string
}

export interface LoMemory {
  pageId: string
  url: string
  name: string
  content: string
  category: LoMemoryCategory | null
  status: LoMemoryStatus | null
  importance: number | null
  source: {
    kind: LoMemorySourceKind | null
    reference: string | null
    capturedAt: string | null
  }
  supersedes: string | null
  supersededBy: string | null
  supersededAt: string | null
  createdAt: string
  lastEditedAt: string
}

export interface LoMemoryCreateInput {
  name: string
  content: string
  category: LoMemoryCategory
  importance?: number
  source: LoMemorySource
}

export interface LoMemoryQuery {
  category?: LoMemoryCategory
  status?: LoMemoryStatus | "all"
  sourceKind?: LoMemorySourceKind
  sourceReference?: string
  minImportance?: number
  limit?: number
}

export interface LoMemorySupersedeInput {
  pageId: string
  replacement: LoMemoryCreateInput
  supersededAt: string
}

export type LoFitnessRecordType = "Daily log" | "Current regimen"
export type LoFitnessManager = "Lo" | "Dakota"

export interface LoFitnessMetrics {
  weightKg: number | null
  bodyFatPercent: number | null
  smmKg: number | null
  muscleMassKg: number | null
  fatFreeMassKg: number | null
  bodyFatMassKg: number | null
  boneMassKg: number | null
  mineralMassKg: number | null
  visceralFatLevel: number | null
  bmi: number | null
  bmrKcal: number | null
  obesityDegreePercent: number | null
  pushUps: number | null
  dailyTarget: number | null
}

export interface LoFitnessRecord {
  pageId: string
  url: string
  day: string
  date: string | null
  recordType: LoFitnessRecordType | null
  manager: LoFitnessManager | null
  metrics: LoFitnessMetrics
  workout: string | null
  meals: string | null
  notes: string | null
  challenge: string | null
  dailyMedication: string | null
  dailySupplements: string | null
  mounjaroDose: string | null
  injectionStatus: string | null
  injectionSite: string | null
  pushUpSets: string | null
  lastConfirmed: string | null
}

export interface LoFitnessSnapshot {
  currentRegimen: LoFitnessRecord | null
  latestDailyLog: LoFitnessRecord | null
}

export type LoTrainingSessionType =
  | "class"
  | "openmat"
  | "promotion"
  | "study"
  | "reflection"
  | "body"
  | "unknown"

export interface LoBjjTrainingSession {
  pageId: string
  url: string
  name: string
  date: string | null
  sessionType: LoTrainingSessionType
  sessionTypeRaw: string | null
  instructor: string | null
  gym: string | null
  classTags: string[]
  sparringTags: string[]
  studyTags: string[]
  note: string | null
  todayFocus: string | null
  focusApplied: boolean
  videoUrl: string | null
  videoTitle: string | null
}

export interface LoBjjTrainingQuery {
  from?: string
  to?: string
  limit?: number
}
