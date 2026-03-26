import type { SenseiEntry, BjjAttributes, BjjStats, BjjStatsSet } from "@/lib/types/sensei"
import { TAG_TO_CATEGORY } from "@/lib/ai/bjjTags"
import { isTagForRuleSet } from "@/lib/ai/bjjTags"
import { calculateOvr } from "./ovr"
import { ARCHETYPES } from "./archetypes"

const CATEGORY_ATTR_MAP: Record<string, keyof BjjAttributes> = {
  Guard: "guard",
  Passing: "passing",
  Control: "control",
  Finishing: "finishing",
  Takedowns: "takedowns",
  LegLocks: "legLocks",
}

export const BELT_CAPS: Record<string, number> = {
  white: 20, blue: 40, purple: 55, brown: 65, black: 75,
}

const DEFAULT_PROFILE = {
  belt: "blue",
  beltStripes: 3,
  trainingStartDate: "2019-11-27",
}

export const PROMOTION_HISTORY = [
  { date: "2019-11-27", belt: "white", stripes: 0, label: "화이트벨트 시작" },
  { date: "2020-06-20", belt: "white", stripes: 1, label: "화이트 1그랄" },
  { date: "2021-01-19", belt: "white", stripes: 2, label: "화이트 2그랄" },
  { date: "2023-11-10", belt: "white", stripes: 3, label: "화이트 3그랄" },
  { date: "2024-03-08", belt: "white", stripes: 4, label: "화이트 4그랄" },
  { date: "2024-07-19", belt: "blue", stripes: 0, label: "블루벨트 승급" },
  { date: "2025-09-26", belt: "blue", stripes: 1, label: "블루 1그랄" },
  { date: "2025-09-26", belt: "blue", stripes: 2, label: "블루 2그랄" },
  { date: "2026-03-20", belt: "blue", stripes: 3, label: "블루 3그랄" },
]

export const PROMOTION_CEREMONIES = ["2026-03-20", "2025-09-26"]

function xpForLevel(level: number): number {
  if (level <= 1) return 0
  return Math.floor(2.5 * level * level)
}

function trainingMonthsSince(startDate: string): number {
  const start = new Date(startDate)
  const now = new Date()
  return (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
}

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

function determinePlaystyle(attrs: BjjAttributes): string {
  const sorted = Object.entries(attrs).sort(([, a], [, b]) => b - a)
  const labels: Record<string, string> = {
    guard: "Guard Player", passing: "Passer", control: "Top Controller",
    finishing: "Finisher", takedowns: "Wrestler", legLocks: "Leg Locker",
  }
  if (sorted[0][1] - sorted[1][1] < 5) {
    return `${labels[sorted[0][0]]} / ${labels[sorted[1][0]]}`
  }
  return labels[sorted[0][0]] || "All-Rounder"
}

function findClosestArchetype(attrs: BjjAttributes, ruleSet: "gi" | "nogi" | "both"): string | null {
  let bestMatch: string | null = null
  let bestDist = Infinity
  for (const arch of ARCHETYPES) {
    if (ruleSet !== "both" && arch.ruleSet !== "both" && arch.ruleSet !== ruleSet) continue
    const d = Math.sqrt(
      (attrs.guard - arch.stats.guard) ** 2 +
      (attrs.passing - arch.stats.passing) ** 2 +
      (attrs.control - arch.stats.control) ** 2 +
      (attrs.finishing - arch.stats.finishing) ** 2 +
      (attrs.takedowns - arch.stats.takedowns) ** 2 +
      (attrs.legLocks - arch.stats.legLocks) ** 2
    )
    if (d < bestDist) { bestDist = d; bestMatch = arch.name }
  }
  return bestMatch
}

function calculateStreaks(entries: SenseiEntry[]): { current: number; best: number } {
  const dates = entries
    .filter((e) => e.date && e.sessionType !== "promotion")
    .map((e) => e.date!)
    .sort()
  const uniqueDates = Array.from(new Set(dates))
  if (uniqueDates.length === 0) return { current: 0, best: 0 }

  const weeks = new Set<string>()
  for (const d of uniqueDates) {
    const date = new Date(d)
    const yearStart = new Date(date.getFullYear(), 0, 1)
    const weekNum = Math.floor((date.getTime() - yearStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
    weeks.add(`${date.getFullYear()}-W${weekNum}`)
  }
  const sortedWeeks = Array.from(weeks).sort()
  let best = 1
  let streak = 1

  for (let i = 1; i < sortedWeeks.length; i++) {
    const [prevY, prevW] = sortedWeeks[i - 1].split("-W").map(Number)
    const [curY, curW] = sortedWeeks[i].split("-W").map(Number)
    const isConsecutive = (curY === prevY && curW === prevW + 1) ||
      (curY === prevY + 1 && prevW >= 51 && curW === 0)
    if (isConsecutive) { streak++ } else { streak = 1 }
    if (streak > best) best = streak
  }

  const now = new Date()
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const currentWeek = Math.floor((now.getTime() - yearStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
  const currentWeekKey = `${now.getFullYear()}-W${currentWeek}`
  const lastWeekKey = currentWeek > 0
    ? `${now.getFullYear()}-W${currentWeek - 1}`
    : `${now.getFullYear() - 1}-W51`

  let current = 0
  if (sortedWeeks.includes(currentWeekKey) || sortedWeeks.includes(lastWeekKey)) {
    current = 1
    for (let i = sortedWeeks.length - 2; i >= 0; i--) {
      const [prevY, prevW] = sortedWeeks[i].split("-W").map(Number)
      const [curY, curW] = sortedWeeks[i + 1].split("-W").map(Number)
      const isConsec = (curY === prevY && curW === prevW + 1) ||
        (curY === prevY + 1 && prevW >= 51 && curW === 0)
      if (isConsec) { current++ } else { break }
    }
  }
  return { current, best }
}

function calculateAttributesForRuleSet(
  entries: SenseiEntry[],
  ruleSet: "gi" | "nogi" | "combined",
  beltCap: number,
): { attrs: BjjAttributes; tagFreq: Record<string, number> } {
  const sessions = entries.filter((e) => e.sessionType !== "promotion")
  const categoryCounts: Record<keyof BjjAttributes, number> = {
    guard: 0, passing: 0, control: 0, finishing: 0, takedowns: 0, legLocks: 0,
  }
  const tagFreq: Record<string, number> = {}

  for (const entry of sessions) {
    const allTags = [...entry.classTags, ...entry.sparringTags, ...(entry.studyTags || [])]
    const isNogiSession = allTags.includes("NoGi")
    if (ruleSet === "gi" && isNogiSession) continue
    if (ruleSet === "nogi" && !isNogiSession) continue

    for (const tag of allTags) {
      if (tag === "Gi" || tag === "NoGi") continue
      if (ruleSet !== "combined" && !isTagForRuleSet(tag, ruleSet)) continue

      tagFreq[tag] = (tagFreq[tag] || 0) + 1
      const category = TAG_TO_CATEGORY[tag]
      if (category && category !== "Meta") {
        const attr = CATEGORY_ATTR_MAP[category]
        if (attr) categoryCounts[attr]++
      }
    }
  }

  const attrs: BjjAttributes = { guard: 0, passing: 0, control: 0, finishing: 0, takedowns: 0, legLocks: 0 }
  for (const key of Object.keys(attrs) as (keyof BjjAttributes)[]) {
    const raw = categoryCounts[key]
    const rawScore = Math.min(100, 10 * Math.sqrt(raw))
    const categoryName = Object.entries(CATEGORY_ATTR_MAP).find(([, v]) => v === key)?.[0]
    const uniqueTags = categoryName
      ? Object.keys(tagFreq).filter((t) => TAG_TO_CATEGORY[t] === categoryName).length
      : 0
    const diversityBonus = Math.min(15, uniqueTags * 2)
    const totalRaw = Math.min(100, rawScore + diversityBonus)
    attrs[key] = Math.round((totalRaw / 100) * beltCap)
  }

  return { attrs, tagFreq }
}

function buildStatsSet(attrs: BjjAttributes, ruleSet: "gi" | "nogi" | "both"): BjjStatsSet {
  const { ovr, role } = calculateOvr(attrs)
  return {
    attributes: attrs,
    ovr,
    ovrRole: role,
    closestArchetype: findClosestArchetype(attrs, ruleSet),
  }
}

export function calculateBjjStats(entries: SenseiEntry[]): BjjStats {
  const sessions = entries.filter((e) => e.sessionType !== "promotion")
  const totalSessions = sessions.length
  const beltInfo = getLatestBeltInfo(entries)
  const beltCap = BELT_CAPS[beltInfo.belt] ?? 40

  const { attrs: giAttrs, tagFreq: giTagFreq } = calculateAttributesForRuleSet(entries, "gi", beltCap)
  const { attrs: nogiAttrs, tagFreq: nogiTagFreq } = calculateAttributesForRuleSet(entries, "nogi", beltCap)
  const { attrs: combinedAttrs } = calculateAttributesForRuleSet(entries, "combined", beltCap)

  // 2026 sessions + attendance
  const sessions2026 = sessions.filter((e) => e.date?.startsWith("2026")).length
  const sessions2026Gi = sessions.filter((e) => e.date?.startsWith("2026") && ![...e.classTags, ...e.sparringTags].includes("NoGi")).length
  const sessions2026Nogi = sessions2026 - sessions2026Gi
  const lastCeremony = PROMOTION_CEREMONIES[0] || "2026-01-01"
  const daysSinceCeremony = Math.max(1, Math.ceil((Date.now() - new Date(lastCeremony).getTime()) / (1000 * 60 * 60 * 24)))
  const weekdaysSinceCeremony = Math.ceil(daysSinceCeremony * 5 / 7)
  const sessionsSinceCeremony = sessions.filter((e) => e.date && e.date >= lastCeremony).length
  const attendanceRate = Math.min(100, Math.round((sessionsSinceCeremony / weekdaysSinceCeremony) * 100))

  // Level & XP
  let level = 1
  while (xpForLevel(level + 1) <= totalSessions) level++
  const xpCurrent = totalSessions - xpForLevel(level)
  const xpToNext = xpForLevel(level + 1) - xpForLevel(level)

  // Gi ratio
  let giCount = 0
  let nogiCount = 0
  for (const entry of sessions) {
    if ([...entry.classTags, ...entry.sparringTags].includes("NoGi")) nogiCount++
    else giCount++
  }
  const giRatio = totalSessions > 0 ? giCount / totalSessions : 1

  // Recent focus
  const recentSessions = sessions.slice(0, 10)
  const recentTagCounts: Record<string, number> = {}
  for (const entry of recentSessions) {
    for (const tag of [...entry.classTags, ...entry.sparringTags, ...(entry.studyTags || [])]) {
      if (tag === "Gi" || tag === "NoGi") continue
      recentTagCounts[tag] = (recentTagCounts[tag] || 0) + 1
    }
  }
  const recentFocus = Object.entries(recentTagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([tag]) => tag)

  // Merge tag frequencies for export
  const allTagFreq: Record<string, number> = {}
  for (const [k, v] of Object.entries(giTagFreq)) allTagFreq[k] = (allTagFreq[k] || 0) + v
  for (const [k, v] of Object.entries(nogiTagFreq)) allTagFreq[k] = (allTagFreq[k] || 0) + v

  return {
    level,
    totalSessions,
    xpCurrent,
    xpToNext: Math.max(xpToNext, 1),
    belt: beltInfo.belt,
    beltStripes: beltInfo.stripes,
    trainingStartDate: DEFAULT_PROFILE.trainingStartDate,
    trainingMonths: trainingMonthsSince(DEFAULT_PROFILE.trainingStartDate),
    gi: buildStatsSet(giAttrs, "gi"),
    nogi: buildStatsSet(nogiAttrs, "nogi"),
    combined: buildStatsSet(combinedAttrs, "both"),
    playstyle: determinePlaystyle(combinedAttrs),
    recentFocus,
    streaks: calculateStreaks(entries),
    giRatio,
    sessions2026,
    sessions2026Gi,
    sessions2026Nogi,
    attendanceRate,
    lastCeremonyDate: lastCeremony,
    ...calculateLearningCycles(entries),
  }
}

export function getTagFrequencies(entries: SenseiEntry[]): Record<string, number> {
  const freq: Record<string, number> = {}
  for (const entry of entries) {
    if (entry.sessionType === "promotion") continue
    for (const tag of [...entry.classTags, ...entry.sparringTags, ...(entry.studyTags || [])]) {
      freq[tag] = (freq[tag] || 0) + 1
    }
  }
  return freq
}

export function getStudyTagFrequencies(entries: SenseiEntry[]): Record<string, number> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 14)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const freq: Record<string, number> = {}
  for (const entry of entries) {
    if (entry.sessionType === "promotion" || !entry.date || entry.date < cutoffStr) continue
    for (const tag of (entry.studyTags || [])) {
      if (tag === "Gi" || tag === "NoGi") continue
      freq[tag] = (freq[tag] || 0) + 1
    }
  }
  return freq
}

export function calculateLearningCycles(entries: SenseiEntry[]): {
  completedCycles: import("@/lib/types/sensei").LearningCycle[]
  inProgressCycles: import("@/lib/types/sensei").LearningCycle[]
} {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const tagPresence: Record<string, { study: boolean; class: boolean; sparring: boolean; lastDate: string }> = {}

  for (const entry of entries) {
    if (entry.sessionType === "promotion" || !entry.date || entry.date < cutoffStr) continue
    for (const tag of (entry.studyTags || [])) {
      if (tag === "Gi" || tag === "NoGi") continue
      if (!tagPresence[tag]) tagPresence[tag] = { study: false, class: false, sparring: false, lastDate: "" }
      tagPresence[tag].study = true
      if (entry.date > tagPresence[tag].lastDate) tagPresence[tag].lastDate = entry.date
    }
    for (const tag of entry.classTags) {
      if (tag === "Gi" || tag === "NoGi") continue
      if (!tagPresence[tag]) tagPresence[tag] = { study: false, class: false, sparring: false, lastDate: "" }
      tagPresence[tag].class = true
      if (entry.date > tagPresence[tag].lastDate) tagPresence[tag].lastDate = entry.date
    }
    for (const tag of entry.sparringTags) {
      if (tag === "Gi" || tag === "NoGi") continue
      if (!tagPresence[tag]) tagPresence[tag] = { study: false, class: false, sparring: false, lastDate: "" }
      tagPresence[tag].sparring = true
      if (entry.date > tagPresence[tag].lastDate) tagPresence[tag].lastDate = entry.date
    }
  }

  const completed: import("@/lib/types/sensei").LearningCycle[] = []
  const inProgress: import("@/lib/types/sensei").LearningCycle[] = []

  for (const [tag, p] of Object.entries(tagPresence)) {
    if (!p.study) continue
    const cycle = { tag, ...p }
    if (p.study && p.class && p.sparring) completed.push(cycle)
    else inProgress.push(cycle)
  }

  completed.sort((a, b) => b.lastDate.localeCompare(a.lastDate))
  inProgress.sort((a, b) => {
    const ac = [a.study, a.class, a.sparring].filter(Boolean).length
    const bc = [b.study, b.class, b.sparring].filter(Boolean).length
    return bc - ac
  })

  return { completedCycles: completed, inProgressCycles: inProgress.slice(0, 10) }
}
