import type { MyCompetition, FollowedEvent } from "@/lib/types/sensei"

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

// Following 국제 메이저 대회
export const FOLLOWED_EVENTS: FollowedEvent[] = [
  {
    id: "event-1",
    name: "IBJJF World Championship",
    date: "2026-06-04",
    location: "Las Vegas, USA",
    organization: "IBJJF",
    ruleSet: "gi",
    type: "major",
    coachEntries: [
      { name: "조준용", division: "Adult Black Feather -70kg" },
    ],
  },
  {
    id: "event-2",
    name: "IBJJF European Championship",
    date: "2026-01-20",
    location: "Europe",
    organization: "IBJJF",
    ruleSet: "gi",
    type: "major",
    coachEntries: [
      { name: "조준용", division: "Adult Black Feather -70kg", result: "3rd place" },
    ],
  },
  {
    id: "event-3",
    name: "ADCC World Championship",
    date: "2026-09-13",
    location: "TBD",
    organization: "ADCC",
    ruleSet: "nogi",
    type: "major",
  },
  {
    id: "event-4",
    name: "IBJJF Pan Championship",
    date: "2026-03-18",
    location: "Irvine, USA",
    organization: "IBJJF",
    ruleSet: "gi",
    type: "major",
  },
  {
    id: "event-5",
    name: "AJP Abu Dhabi World Pro",
    date: "2026-04-15",
    location: "Abu Dhabi, UAE",
    organization: "AJP",
    ruleSet: "gi",
    type: "major",
  },
]

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
