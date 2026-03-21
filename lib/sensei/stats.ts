import type { SenseiEntry } from "@/lib/types/sensei"
import type { BjjAttributes, BjjStats } from "@/lib/types/sensei"
import { TAG_TO_CATEGORY } from "@/lib/ai/bjjTags"
import { calculateOvr } from "./ovr"

const CATEGORY_ATTR_MAP: Record<string, keyof BjjAttributes> = {
  Guard: "guard",
  Passing: "passing",
  Control: "control",
  Finishing: "finishing",
  Takedowns: "takedowns",
  LegLocks: "legLocks",
}

// Default profile — 프로모션 기록이 없을 때 fallback
const DEFAULT_PROFILE = {
  belt: "blue",
  beltStripes: 3,
  trainingStartDate: "2019-12-01",
}

// 프로모션 엔트리 note에서 벨트 정보 파싱: "[BELT:blue:3] ..."
function parseBeltFromNote(note: string): { belt: string; stripes: number } | null {
  const match = note.match(/\[BELT:(\w+):(\d)\]/)
  if (!match) return null
  return { belt: match[1], stripes: parseInt(match[2]) }
}

function getLatestBeltInfo(entries: SenseiEntry[]): { belt: string; stripes: number } {
  const promotions = entries
    .filter((e) => e.sessionType === "promotion" && e.note)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))

  for (const promo of promotions) {
    const info = parseBeltFromNote(promo.note)
    if (info) return info
  }
  return { belt: DEFAULT_PROFILE.belt, stripes: DEFAULT_PROFILE.beltStripes }
}

// XP thresholds per level (cumulative sessions)
function xpForLevel(level: number): number {
  if (level <= 1) return 0
  return Math.floor(2.5 * level * level)
}

function trainingMonthsSince(startDate: string): number {
  const start = new Date(startDate)
  const now = new Date()
  return (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
}

function determinePlaystyle(attrs: BjjAttributes): string {
  const sorted = Object.entries(attrs).sort(([, a], [, b]) => b - a)
  const top = sorted[0][0]
  const second = sorted[1][0]

  const labels: Record<string, string> = {
    guard: "Guard Player",
    passing: "Passer",
    control: "Top Controller",
    finishing: "Finisher",
    takedowns: "Wrestler",
    legLocks: "Leg Locker",
  }

  if (sorted[0][1] - sorted[1][1] < 5) {
    return `${labels[top]} / ${labels[second]}`
  }
  return labels[top] || "All-Rounder"
}

function calculateStreaks(entries: SenseiEntry[]): { current: number; best: number } {
  const dates = entries
    .filter((e) => e.date && e.sessionType !== "promotion")
    .map((e) => e.date!)
    .sort()

  const uniqueDates = Array.from(new Set(dates))
  if (uniqueDates.length === 0) return { current: 0, best: 0 }

  // Weekly streak: count consecutive weeks with at least 1 session
  const weeks = new Set<string>()
  for (const d of uniqueDates) {
    const date = new Date(d)
    const yearStart = new Date(date.getFullYear(), 0, 1)
    const weekNum = Math.floor((date.getTime() - yearStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
    weeks.add(`${date.getFullYear()}-W${weekNum}`)
  }

  const sortedWeeks = Array.from(weeks).sort()
  let current = 1
  let best = 1
  let streak = 1

  for (let i = 1; i < sortedWeeks.length; i++) {
    const [prevY, prevW] = sortedWeeks[i - 1].split("-W").map(Number)
    const [curY, curW] = sortedWeeks[i].split("-W").map(Number)

    const isConsecutive = (curY === prevY && curW === prevW + 1) ||
      (curY === prevY + 1 && prevW >= 51 && curW === 0)

    if (isConsecutive) {
      streak++
    } else {
      streak = 1
    }
    if (streak > best) best = streak
  }

  // Current streak: check if latest week is current or last week
  const now = new Date()
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const currentWeek = Math.floor((now.getTime() - yearStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
  const currentWeekKey = `${now.getFullYear()}-W${currentWeek}`
  const lastWeekKey = currentWeek > 0
    ? `${now.getFullYear()}-W${currentWeek - 1}`
    : `${now.getFullYear() - 1}-W51`

  if (sortedWeeks.includes(currentWeekKey) || sortedWeeks.includes(lastWeekKey)) {
    // Count backwards from the latest week
    current = 1
    for (let i = sortedWeeks.length - 2; i >= 0; i--) {
      const [prevY, prevW] = sortedWeeks[i].split("-W").map(Number)
      const [curY, curW] = sortedWeeks[i + 1].split("-W").map(Number)
      const isConsec = (curY === prevY && curW === prevW + 1) ||
        (curY === prevY + 1 && prevW >= 51 && curW === 0)
      if (isConsec) {
        current++
      } else {
        break
      }
    }
  } else {
    current = 0
  }

  return { current, best }
}

export function calculateBjjStats(entries: SenseiEntry[]): BjjStats {
  const sessions = entries.filter((e) => e.sessionType !== "promotion")
  const totalSessions = sessions.length

  // Count tags per category
  const categoryCounts: Record<keyof BjjAttributes, number> = {
    guard: 0, passing: 0, control: 0, finishing: 0, takedowns: 0, legLocks: 0,
  }
  const tagFrequency: Record<string, number> = {}

  for (const entry of sessions) {
    const allTags = [...entry.classTags, ...entry.sparringTags]
    for (const tag of allTags) {
      tagFrequency[tag] = (tagFrequency[tag] || 0) + 1
      const category = TAG_TO_CATEGORY[tag]
      if (category && category !== "Meta") {
        const attr = CATEGORY_ATTR_MAP[category]
        if (attr) categoryCounts[attr]++
      }
    }
  }

  // Belt-capped absolute scaling
  // 1) raw score 0-100 from sqrt(tagCount)
  // 2) scale by belt ceiling: raw/100 * beltMax
  const beltInfo = getLatestBeltInfo(entries)
  const BELT_CAPS: Record<string, number> = {
    white: 20, blue: 40, purple: 55, brown: 65, black: 75,
  }
  const beltCap = BELT_CAPS[beltInfo.belt] ?? 40

  const attributes: BjjAttributes = { guard: 0, passing: 0, control: 0, finishing: 0, takedowns: 0, legLocks: 0 }

  for (const key of Object.keys(attributes) as (keyof BjjAttributes)[]) {
    const raw = categoryCounts[key]
    // Raw score: sqrt-based 0-100
    const rawScore = Math.min(100, 10 * Math.sqrt(raw))
    // Diversity bonus on raw score
    const categoryName = Object.entries(CATEGORY_ATTR_MAP).find(([, v]) => v === key)?.[0]
    const uniqueTagsInCategory = categoryName
      ? Object.keys(tagFrequency).filter((t) => TAG_TO_CATEGORY[t] === categoryName).length
      : 0
    const diversityBonus = Math.min(15, uniqueTagsInCategory * 2)
    const totalRaw = Math.min(100, rawScore + diversityBonus)
    // Apply belt cap: raw/100 * beltMax
    attributes[key] = Math.round((totalRaw / 100) * beltCap)
  }

  // Level & XP
  let level = 1
  while (xpForLevel(level + 1) <= totalSessions) {
    level++
  }
  const xpCurrent = totalSessions - xpForLevel(level)
  const xpToNext = xpForLevel(level + 1) - xpForLevel(level)

  // Gi ratio
  let giCount = 0
  let nogiCount = 0
  for (const entry of sessions) {
    const allTags = [...entry.classTags, ...entry.sparringTags]
    if (allTags.includes("NoGi")) nogiCount++
    else giCount++
  }
  const giRatio = totalSessions > 0 ? giCount / totalSessions : 1

  // Recent focus (top 5 tags from last 10 sessions)
  const recentSessions = sessions.slice(0, 10)
  const recentTagCounts: Record<string, number> = {}
  for (const entry of recentSessions) {
    for (const tag of [...entry.classTags, ...entry.sparringTags]) {
      if (tag === "Gi" || tag === "NoGi") continue
      recentTagCounts[tag] = (recentTagCounts[tag] || 0) + 1
    }
  }
  const recentFocus = Object.entries(recentTagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([tag]) => tag)

  const { ovr, role } = calculateOvr(attributes)

  return {
    level,
    totalSessions,
    xpCurrent,
    xpToNext: Math.max(xpToNext, 1),
    belt: getLatestBeltInfo(entries).belt,
    beltStripes: getLatestBeltInfo(entries).stripes,
    trainingStartDate: DEFAULT_PROFILE.trainingStartDate,
    trainingMonths: trainingMonthsSince(DEFAULT_PROFILE.trainingStartDate),
    attributes,
    ovr,
    ovrRole: role,
    playstyle: determinePlaystyle(attributes),
    recentFocus,
    streaks: calculateStreaks(entries),
    giRatio,
  }
}

// Tag frequency map for skill tree
export function getTagFrequencies(entries: SenseiEntry[]): Record<string, number> {
  const freq: Record<string, number> = {}
  for (const entry of entries) {
    if (entry.sessionType === "promotion") continue
    for (const tag of [...entry.classTags, ...entry.sparringTags]) {
      freq[tag] = (freq[tag] || 0) + 1
    }
  }
  return freq
}
