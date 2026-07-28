/**
 * Dakota 운영 장부 대시보드의 순수 집계 함수들.
 *
 * 여기 있는 모든 함수는 (데이터, [기간/now]) -> 결과 형태의 순수 함수다.
 * 컴포넌트는 이 함수들이 반환한 값을 그리기만 하고, 집계 로직을 직접 갖지 않는다.
 * 날짜 산수는 전부 period.ts의 KST 유틸을 재사용한다 — 여기서 새로 만들지 않는다.
 */
import type { OperationItem } from "@/lib/notion/operations"
import type { SessionLogItem } from "@/lib/notion/sessionLog"
import {
  addCalendarMonths,
  computeStalledDays,
  getSeoulWeekdayHour,
  seoulMidnight,
  seoulYMD,
  type PeriodFilter,
  type PeriodRange,
} from "./period"

// ── 비중 (도메인별 세션 점유율) ────────────────────────────────────────────

export interface DomainShareSlice {
  domain: string
  count: number
  pct: number
}

export function computeDomainShare(sessions: Array<Pick<SessionLogItem, "domain">>): DomainShareSlice[] {
  const counts = new Map<string, number>()
  let total = 0
  for (const s of sessions) {
    if (!s.domain) continue
    counts.set(s.domain, (counts.get(s.domain) ?? 0) + 1)
    total += 1
  }
  if (total === 0) return []

  return [...counts.entries()]
    .map(([domain, count]) => ({ domain, count, pct: count / total }))
    .sort((a, b) => b.count - a.count)
}

// ── 추세 (기간 선택에 따른 버킷 폭의 시계열) ────────────────────────────────

export type BucketGranularity = "hour" | "day" | "week" | "month"

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

export function bucketGranularityForPeriod(period: PeriodFilter): BucketGranularity {
  switch (period) {
    case "일":
      return "hour"
    case "주":
    case "월":
      return "day"
    case "분기":
      return "week"
    case "연":
    case "전체":
      return "month"
  }
}

export interface TimeBucket {
  start: Date
  end: Date
  label: string
}

function hourLabel(d: Date): string {
  const { hour } = getSeoulWeekdayHour(d.toISOString())
  return `${hour}시`
}

function dayLabel(d: Date): string {
  const { m, d: day } = seoulYMD(d)
  return `${m}/${day}`
}

function monthLabel(ymd: { y: number; m: number }): string {
  return `${ymd.y}.${String(ymd.m).padStart(2, "0")}`
}

/** 고정폭(시/일/주) 버킷: range 안을 stepMs 간격으로 잘게 썬다. 마지막 버킷은 range.end에서 클램프된다. */
function buildFixedStepBuckets(range: PeriodRange, stepMs: number, label: (start: Date) => string): TimeBucket[] {
  const buckets: TimeBucket[] = []
  const endMs = range.end.getTime()
  let cursor = range.start.getTime()
  while (cursor < endMs) {
    const start = new Date(cursor)
    const end = new Date(Math.min(cursor + stepMs, endMs))
    buckets.push({ start, end, label: label(start) })
    cursor += stepMs
  }
  return buckets
}

function buildMonthlyBuckets(range: PeriodRange): TimeBucket[] {
  const buckets: TimeBucket[] = []
  const endMs = range.end.getTime()
  const startYMD = seoulYMD(range.start)
  let cursorYMD = { y: startYMD.y, m: startYMD.m, d: 1 }
  while (seoulMidnight(cursorYMD).getTime() < endMs) {
    const start = seoulMidnight(cursorYMD)
    const nextYMD = addCalendarMonths(cursorYMD, 1)
    const end = new Date(Math.min(seoulMidnight(nextYMD).getTime(), endMs))
    buckets.push({ start, end, label: monthLabel(cursorYMD) })
    cursorYMD = nextYMD
  }
  return buckets
}

export function buildTimeBuckets(period: PeriodFilter, range: PeriodRange): TimeBucket[] {
  const granularity = bucketGranularityForPeriod(period)
  switch (granularity) {
    case "hour":
      return buildFixedStepBuckets(range, HOUR_MS, hourLabel)
    case "day":
      return buildFixedStepBuckets(range, DAY_MS, dayLabel)
    case "week":
      return buildFixedStepBuckets(range, WEEK_MS, dayLabel)
    case "month":
      return buildMonthlyBuckets(range)
  }
}

export interface TrendBucketRow {
  label: string
  start: string
  end: string
  total: number
  byDomain: Record<string, number>
}

export function aggregateTrend(
  sessions: Array<Pick<SessionLogItem, "date" | "domain">>,
  buckets: TimeBucket[]
): TrendBucketRow[] {
  const rows: TrendBucketRow[] = buckets.map((b) => ({
    label: b.label,
    start: b.start.toISOString(),
    end: b.end.toISOString(),
    total: 0,
    byDomain: {},
  }))

  for (const session of sessions) {
    if (!session.date || !session.domain) continue
    const t = new Date(session.date).getTime()
    const index = buckets.findIndex((b, i) => t >= b.start.getTime() && (i === buckets.length - 1 ? t <= b.end.getTime() : t < b.end.getTime()))
    if (index === -1) continue
    const row = rows[index]
    row.total += 1
    row.byDomain[session.domain] = (row.byDomain[session.domain] ?? 0) + 1
  }

  return rows
}

// ── 리듬 (요일 x 시간대 히트맵) ─────────────────────────────────────────────

export const RHYTHM_BANDS = ["새벽", "오전", "오후", "밤"] as const
export type RhythmBand = (typeof RHYTHM_BANDS)[number]

/** 월요일 시작 표시 순서. */
export const RHYTHM_WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"] as const

function bandForHour(hour: number): RhythmBand {
  if (hour < 6) return "새벽"
  if (hour < 12) return "오전"
  if (hour < 18) return "오후"
  return "밤"
}

/** calendarWeekday 컨벤션(0=일...6=토)을 월요일 시작 인덱스(0=월...6=일)로 바꾼다. */
function toMondayFirstIndex(weekday: number): number {
  return (weekday + 6) % 7
}

export interface RhythmCell {
  weekdayLabel: (typeof RHYTHM_WEEKDAY_LABELS)[number]
  band: RhythmBand
  count: number
}

export function computeRhythmMatrix(sessions: Array<Pick<SessionLogItem, "date">>): RhythmCell[] {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(RHYTHM_BANDS.length).fill(0))

  for (const session of sessions) {
    if (!session.date) continue
    const { weekday, hour } = getSeoulWeekdayHour(session.date)
    const row = toMondayFirstIndex(weekday)
    const col = RHYTHM_BANDS.indexOf(bandForHour(hour))
    grid[row][col] += 1
  }

  const cells: RhythmCell[] = []
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < RHYTHM_BANDS.length; col++) {
      cells.push({ weekdayLabel: RHYTHM_WEEKDAY_LABELS[row], band: RHYTHM_BANDS[col], count: grid[row][col] })
    }
  }
  return cells
}

// ── 정체 (진행 중인데 오래 안 건드린 과제) ──────────────────────────────────

const OPEN_EXCLUDED_STATUSES = new Set<OperationItem["status"]>(["Completed", "Archived"])

export interface StalledRow {
  pageId: string
  name: string
  domain: string
  nextAction: string
  lastTouched: string | null
  stalledDays: number | null
}

export function computeStalledRanking(operations: OperationItem[], now: Date): StalledRow[] {
  const rows = operations
    .filter((op) => !OPEN_EXCLUDED_STATUSES.has(op.status))
    .map((op) => ({
      pageId: op.page_id,
      name: op.name,
      domain: op.domain,
      nextAction: op.next_action,
      lastTouched: op.last_touched,
      stalledDays: computeStalledDays(op.last_touched, now),
    }))

  return rows.sort((a, b) => {
    if (a.stalledDays === null && b.stalledDays === null) return 0
    if (a.stalledDays === null) return 1
    if (b.stalledDays === null) return -1
    return b.stalledDays - a.stalledDays
  })
}

// ── 리드타임 (도메인별 착수~완료 중앙값) ────────────────────────────────────

export interface LeadTimeRow {
  domain: string
  medianDays: number
  count: number
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

export function computeLeadTimeByDomain(operations: OperationItem[]): LeadTimeRow[] {
  const byDomain = new Map<string, number[]>()

  for (const op of operations) {
    if (!op.started_at || !op.completed_at) continue
    const days = Math.round((new Date(op.completed_at).getTime() - new Date(op.started_at).getTime()) / DAY_MS)
    const list = byDomain.get(op.domain) ?? []
    list.push(days)
    byDomain.set(op.domain, list)
  }

  return [...byDomain.entries()]
    .map(([domain, days]) => ({ domain, medianDays: median(days), count: days.length }))
    .sort((a, b) => b.medianDays - a.medianDays)
}

// ── 타임라인 (과제별 착수~최근 접촉 구간) ───────────────────────────────────

export interface TimelineRow {
  pageId: string
  name: string
  domain: string
  start: string
  end: string
}

export function buildTimelineRows(operations: OperationItem[]): TimelineRow[] {
  return operations
    .filter((op): op is OperationItem & { started_at: string } => Boolean(op.started_at))
    .map((op) => ({
      pageId: op.page_id,
      name: op.name,
      domain: op.domain,
      start: op.started_at,
      end: op.last_touched ?? op.started_at,
    }))
    .sort((a, b) => a.start.localeCompare(b.start))
}
