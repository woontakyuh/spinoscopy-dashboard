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
])

function normalizeTitle(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/gu, " ")
}

function meaningfulTitleWords(text: string): string[] {
  return normalizeTitle(text)
    .split(/[^a-z0-9가-힣]+/u)
    .filter((word) => word.length > 0 && !GENERIC_TITLE_WORDS.has(word))
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

function sameSchedule(notion: ScheduleItem, event: GoogleCalendarEventSummary): boolean {
  if (!notion.date_start || notion.date_start.slice(0, 10) !== event.start.slice(0, 10)) {
    return false
  }

  const normalizedNotion = normalizeTitle(notion.name)
  const normalizedGcal = normalizeTitle(event.title)
  if (normalizedNotion === normalizedGcal) return true

  const matchingLocation = normalizeLocation(notion.place) !== ""
    && normalizeLocation(notion.place) === normalizeLocation(event.location)
  if (matchingLocation && startsWithinMinutes(notion.date_start, event.start, 5)) return true

  const notionWords = meaningfulTitleWords(notion.name)
  const gcalWords = meaningfulTitleWords(event.title)
  if (notionWords.length === 0 || gcalWords.length === 0) return false

  const gcalWordSet = new Set(gcalWords)
  const overlap = notionWords.filter((word) => gcalWordSet.has(word)).length
  const sharedMeaning = overlap / Math.min(notionWords.length, gcalWords.length) >= 0.5
  if (!sharedMeaning) return false

  // A matching title on the same day is not sufficient for two independent meetings.
  // Timed records must also begin within two hours of one another.
  if (!notion.date_start.includes("T") || !event.start.includes("T")) return true
  const notionTime = Date.parse(notion.date_start)
  const gcalTime = Date.parse(event.start)
  return Math.abs(notionTime - gcalTime) <= 2 * 60 * 60 * 1000
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
      normalizeTitle(candidate.title) === normalizeTitle(event.title)
      && startsWithinMinutes(candidate.start, event.start, 5)
      && normalizeLocation(candidate.location) === normalizeLocation(event.location)
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
