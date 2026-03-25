import type { UserProfile } from "@/lib/types/sensei"

const STORAGE_KEY = "sensei-user-profile"

export const DEFAULT_PROFILE: UserProfile = {
  name: "여운탁",
  belt: "blue",
  stripes: 3,
  trainingStartDate: "2019-11-27",
  gym: "DT Wire",
  instructor: "조준용",
  baseStats: {
    gi: { guard: 0, passing: 0, control: 0, finishing: 0, takedowns: 0, legLocks: 0 },
    nogi: { guard: 0, passing: 0, control: 0, finishing: 0, takedowns: 0, legLocks: 0 },
  },
  nextGoalTitle: "블루벨트 4그랄",
  nextGoalText: "현재: 블루벨트 3그랄",
  nextGoalProgress: 75,
  role: "student",
}

export function loadUserProfile(): UserProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return { ...DEFAULT_PROFILE, ...JSON.parse(stored) }
  } catch { /* ignore */ }
  return DEFAULT_PROFILE
}

export function saveUserProfile(profile: Partial<UserProfile>): void {
  if (typeof window === "undefined") return
  const current = loadUserProfile()
  const merged = { ...current, ...profile }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
}
