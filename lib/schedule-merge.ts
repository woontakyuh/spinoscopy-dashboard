import type { ScheduleItem } from "./types/schedule"
import type { GoogleCalendarEventSummary } from "./google/calendar"

export interface DashboardScheduleItem {
  id: string
  title: string
  start: string
  end: string | null
  location: string
  category: string
  source: "notion" | "gcal" | "both"
  notionUrl?: string
  gcalUrl?: string
}

const GENERIC_TITLE_WORDS = new Set([
  "회의", "모임", "미팅", "zoom", "줌", "online", "온라인",
  "meeting", "development", "개발미팅", "개발회의",
])

const TITLE_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["salted", "솔티드"],
]

function normalizeTitle(text: string): string {
  let normalized = text
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .replace(/(\d+)\s*회차/gu, "$1")
    .replace(/\s+/gu, " ")

  for (const [alias, canonical] of TITLE_ALIASES) {
    normalized = normalized.replaceAll(alias, canonical)
  }
  return normalized
}

function titleFingerprint(text: string): string {
  return normalizeTitle(text).replace(/[^a-z0-9가-힣]+/gu, "")
}

function meaningfulTitleWords(text: string): string[] {
  return normalizeTitle(text)
    .split(/[^a-z0-9가-힣]+/u)
    .filter((word) => word.length > 0 && !GENERIC_TITLE_WORDS.has(word))
}

function titleMatchStrength(firstTitle: string, secondTitle: string): number {
  const firstWords = meaningfulTitleWords(firstTitle)
  const secondWords = meaningfulTitleWords(secondTitle)
  if (firstWords.length === 0 || secondWords.length === 0) return 0

  const secondWordSet = new Set(secondWords)
  const overlap = firstWords.filter((word) => secondWordSet.has(word)).length
  return overlap / Math.min(firstWords.length, secondWords.length)
}

function sharesMeaning(firstTitle: string, secondTitle: string): boolean {
  return titleMatchStrength(firstTitle, secondTitle) >= 0.5
}

function normalizeLocation(text: string): string {
  return normalizeTitle(text).replace(/\s+/gu, "")
}

function startsWithinMinutes(first: string, second: string, minutes: number): boolean {
  if (!first.includes("T") || !second.includes("T")) return first === second
  const firstTime = Date.parse(first)
  const secondTime = Date.parse(second)
  if (Number.isNaN(firstTime) || Number.isNaN(secondTime)) return false
  return Math.abs(firstTime - secondTime) <= minutes * 60 * 1000
}

function sameTimeAndLocation(notion: ScheduleItem, event: GoogleCalendarEventSummary): boolean {
  return Boolean(notion.date_start)
    && normalizeLocation(notion.place) !== ""
    && normalizeLocation(notion.place) === normalizeLocation(event.location)
    && startsWithinMinutes(notion.date_start!, event.start, 5)
}

function sameSchedule(notion: ScheduleItem, event: GoogleCalendarEventSummary): boolean {
  if (!notion.date_start || notion.date_start.slice(0, 10) !== event.start.slice(0, 10)) {
    return false
  }

  const normalizedNotion = normalizeTitle(notion.name)
  const normalizedGcal = normalizeTitle(event.title)
  if (normalizedNotion === normalizedGcal) return true

  if (sameTimeAndLocation(notion, event)) return true

  if (!sharesMeaning(notion.name, event.title)) return false

  // A matching title on the same day is not sufficient for two independent meetings.
  // Timed records must also begin within two hours of one another.
  if (!notion.date_start.includes("T") || !event.start.includes("T")) return true
  const notionTime = Date.parse(notion.date_start)
  const gcalTime = Date.parse(event.start)
  const timeDifference = Math.abs(notionTime - gcalTime)
  if (timeDifference <= 2 * 60 * 60 * 1000) return true

  // Notion items without an end time often carry a placeholder start time.
  // Only a full semantic title match earns this wider reconciliation window.
  return !notion.date_end
    && titleMatchStrength(notion.name, event.title) === 1
    && timeDifference <= 6 * 60 * 60 * 1000
}

function canonicalTitle(notionTitle: string, gcalTitle: string): string {
  const notionScore = meaningfulTitleWords(notionTitle).length
  const gcalScore = meaningfulTitleWords(gcalTitle).length
  if (gcalScore > notionScore) return gcalTitle
  return notionTitle
}

function dedupeGoogleEvents(events: GoogleCalendarEventSummary[]): GoogleCalendarEventSummary[] {
  return events.reduce<GoogleCalendarEventSummary[]>((unique, event) => {
    const duplicate = unique.some((candidate) => (
      (titleFingerprint(candidate.title) === titleFingerprint(event.title)
        || sharesMeaning(candidate.title, event.title))
      && startsWithinMinutes(candidate.start, event.start, 5)
    ))
    if (!duplicate) unique.push(event)
    return unique
  }, [])
}

function toMillis(dateValue: string): number {
  const value = Date.parse(dateValue)
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value
}

export function mergeSchedules(
  notionSchedules: ScheduleItem[],
  gcalEvents: GoogleCalendarEventSummary[],
  filterFn: (dateValue: string | null) => boolean
): DashboardScheduleItem[] {
  const filteredNotion = notionSchedules.filter((item) => filterFn(item.date_start))
  const filteredGcal = dedupeGoogleEvents(gcalEvents.filter((event) => filterFn(event.start)))
  const usedNotionIds = new Set<string>()
  const merged: DashboardScheduleItem[] = []

  for (const event of filteredGcal) {
    const duplicateOfMergedSource = filteredNotion.some(
      (item) => usedNotionIds.has(item.page_id) && sameTimeAndLocation(item, event)
    )
    if (duplicateOfMergedSource) continue

    const matchedNotion = filteredNotion.find(
      (item) => !usedNotionIds.has(item.page_id) && sameSchedule(item, event)
    )

    if (matchedNotion) {
      usedNotionIds.add(matchedNotion.page_id)
      merged.push({
        id: matchedNotion.page_id,
        title: canonicalTitle(matchedNotion.name, event.title),
        start: matchedNotion.date_start ?? event.start,
        end: matchedNotion.date_end ?? event.end,
        location: matchedNotion.place || event.location,
        category: matchedNotion.category,
        source: "both",
        notionUrl: matchedNotion.url,
        gcalUrl: event.url,
      })
      continue
    }

    merged.push({
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      location: event.location,
      category: "",
      source: "gcal",
      gcalUrl: event.url,
    })
  }

  for (const item of filteredNotion) {
    if (usedNotionIds.has(item.page_id) || !item.date_start) continue
    merged.push({
      id: item.page_id,
      title: item.name,
      start: item.date_start,
      end: item.date_end,
      location: item.place,
      category: item.category,
      source: "notion",
      notionUrl: item.url,
    })
  }

  merged.sort((a, b) => toMillis(a.start) - toMillis(b.start))
  return merged
}
