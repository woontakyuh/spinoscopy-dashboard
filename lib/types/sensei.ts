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

export interface BjjStatsSet {
  attributes: BjjAttributes
  ovr: number
  ovrRole: string
  closestArchetype: string | null
}

export interface BjjStats {
  level: number
  totalSessions: number
  xpCurrent: number
  xpToNext: number
  belt: string
  beltStripes: number
  trainingStartDate: string
  trainingMonths: number
  gi: BjjStatsSet
  nogi: BjjStatsSet
  combined: BjjStatsSet
  playstyle: string
  recentFocus: string[]
  streaks: { current: number; best: number }
  giRatio: number
}

export interface GameplanStep {
  position: string
  action: string
  next: string[]
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
  gameplan: GameplanStep[]
  imageUrl?: string
  videoUrl?: string
  ovrFloor?: number
  isCustom?: boolean
  editableStats?: boolean
  styleReferences?: string[]
  bio?: string
}

// User Profile (Phase 2 확장 대비)
export interface UserProfile {
  name: string
  belt: string
  stripes: number
  trainingStartDate: string
  gym: string
  instructor: string
  avatarUrl?: string
  baseStats: { gi: BjjAttributes; nogi: BjjAttributes }
  nextGoalTitle?: string
  nextGoalText?: string
  nextGoalProgress?: number
  // Phase 2
  gymId?: string
  role?: "student" | "instructor" | "admin"
  userId?: string
}

// Competition Types
export interface MatchResult {
  round: string
  opponent?: string
  result: "승" | "패" | "무"
  method?: string
  points?: string
  duration?: string
}

export interface MyCompetition {
  id: string
  name: string
  date: string
  registrationDeadline?: string
  location: string
  ruleSet: "gi" | "nogi" | "both"
  organization: string
  division?: string
  status: "참가예정" | "등록완료" | "미정" | "불참" | "완료"
  weightClass?: string
  result?: string
  matchResults?: MatchResult[]
  fee?: number
  notes?: string
  url?: string
}

export interface CoachEntry {
  name: string
  division: string
  result?: string
}

export interface FollowedEvent {
  id: string
  name: string
  date: string
  location: string
  organization: string
  ruleSet: "gi" | "nogi" | "both"
  type: "major"
  coachEntries?: CoachEntry[]
  notes?: string
  url?: string
}

export interface PromotionEvent {
  date: string
  belt: string
  stripe?: number
  note?: string
}

// Strategy
export interface Strategy {
  id: string
  name: string
  description?: string
  ruleSet: "gi" | "nogi"
  type: "mine" | "pro"
  proName?: string
  flow: StrategyStep[]
  createdAt: string
  updatedAt: string
  tags?: string[]
  notes?: string
}

export interface StrategyStep {
  positionId: string
  action: string
  condition?: string
  branches?: StrategyBranch[]
  lessonNumber?: number
  videoUrl?: string
  notes?: string
}

export interface StrategyBranch {
  condition: string
  nextStepIndex: number
  alternateFlow?: StrategyStep[]
}

// Skill Tree v3 — 교본 기반

export type PositionLayer = "standing" | "guard" | "passing" | "control" | "submission" | "leglock"
export type PositionPerspective = "top" | "bottom" | "neutral"
export type TransitionType = "sweep" | "pass" | "transition" | "submission" | "escape" | "takedown" | "guard_pull" | "recovery"

export interface Position {
  id: string
  name: string
  nameKr: string
  layer: PositionLayer
  family?: string
  perspective?: PositionPerspective
  lessonNumbers?: number[]
  ruleSet: "common" | "gi" | "nogi"
  children?: string[]
  parent?: string
}

export interface Transition {
  from: string
  to: string
  action: string
  actionEn: string
  condition?: string
  type: TransitionType
  lessonNumber?: number
  videoUrl?: string
  ruleSet: "common" | "gi" | "nogi"
}

export interface LessonVideo {
  title: string
  titleKr: string
  url: string
  category: string
}
