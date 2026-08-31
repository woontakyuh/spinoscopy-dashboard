import type { MyCompetition, FollowedEvent } from "@/lib/types/sensei"
export { KOREAN_FOLLOWED_EVENTS } from "@/lib/sensei/korean-competition-events"
export { INTERNATIONAL_FOLLOWED_EVENTS } from "@/lib/sensei/international-competition-events"
import { KOREAN_FOLLOWED_EVENTS } from "@/lib/sensei/korean-competition-events"
import { INTERNATIONAL_FOLLOWED_EVENTS } from "@/lib/sensei/international-competition-events"

// 내 대회 시드 데이터 (localStorage 기반)
export const MY_COMPETITIONS_SEED: MyCompetition[] = [
  {
    id: "comp-1",
    name: "IBJJF Korea International Open",
    date: "2026-05-17",
    registrationDeadline: "2026-05-01",
    location: "Seoul, Korea",
    ruleSet: "gi",
    organization: "IBJJF",
    division: "Adult Blue",
    status: "등록완료",
    weightClass: "-76kg",
    fee: 120000,
  },
]

export const FOLLOWED_EVENTS: FollowedEvent[] = [
  ...KOREAN_FOLLOWED_EVENTS,
  ...INTERNATIONAL_FOLLOWED_EVENTS,
].sort((a, b) => a.date.localeCompare(b.date))

const STORAGE_KEY = "sensei-my-competitions"

export function loadMyCompetitions(): MyCompetition[] {
  if (typeof window === "undefined") return MY_COMPETITIONS_SEED
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return MY_COMPETITIONS_SEED
}

export function saveMyCompetitions(comps: MyCompetition[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(comps))
}
