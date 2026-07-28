/**
 * Dakota 운영 장부 테이블의 기간 필터 + 정체일수 계산.
 *
 * Asia/Seoul은 연중 고정 UTC+9(서머타임 없음)라서 "YYYY-MM-DDT00:00:00+09:00"
 * 형태로 인스턴트를 직접 구성해도 정확하다. 요일·월 경계 같은 달력 연산은
 * Date.UTC(y, m-1, d)로 순수 달력 날짜로만 다뤄 KST 오프셋과 섞이지 않게 한다.
 */

export const PERIOD_FILTERS = ["전체", "연", "분기", "월", "주", "일"] as const
export type PeriodFilter = (typeof PERIOD_FILTERS)[number]

export interface PeriodRange {
  /** 포함 (inclusive), KST 자정 */
  start: Date
  /** 배타 (exclusive), KST 자정 */
  end: Date
}

export interface SeoulYMD {
  y: number
  m: number
  d: number
}

export function seoulYMD(date: Date): SeoulYMD {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { y: get("year"), m: get("month"), d: get("day") }
}

/** KST 자정 인스턴트를 나타내는 Date를 만든다. */
export function seoulMidnight({ y, m, d }: SeoulYMD): Date {
  return new Date(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00+09:00`)
}

/** 순수 달력 연산용: y-m-d를 시간대 없이 UTC 기준 Date로 취급한다. */
function calendarUTC({ y, m, d }: SeoulYMD): Date {
  return new Date(Date.UTC(y, m - 1, d))
}

function fromCalendarUTC(date: Date): SeoulYMD {
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() }
}

export function addCalendarDays(ymd: SeoulYMD, days: number): SeoulYMD {
  return fromCalendarUTC(new Date(calendarUTC(ymd).getTime() + days * 86_400_000))
}

/** 월 단위로 달력 날짜를 이동한다. 일(day)은 그대로 유지한다 (버킷 경계용이라 말일 클램프는 하지 않는다). */
export function addCalendarMonths(ymd: SeoulYMD, months: number): SeoulYMD {
  const totalMonths = ymd.m - 1 + months
  const y = ymd.y + Math.floor(totalMonths / 12)
  const m = (((totalMonths % 12) + 12) % 12) + 1
  return { y, m, d: ymd.d }
}

/** 0=일 ... 6=토. 시간대와 무관한 순수 달력 요일. */
function calendarWeekday(ymd: SeoulYMD): number {
  return calendarUTC(ymd).getUTCDay()
}

/**
 * ISO 타임스탬프를 KST 기준 요일(0=일...6=토)과 시(0-23)로 분해한다.
 * "리듬" 히트맵(요일 x 시간대)의 유일한 근거 — KST 자정 근처에서 UTC 날짜와
 * 어긋나는 경우를 여기서 한 번에 바로잡는다.
 */
export function getSeoulWeekdayHour(iso: string): { weekday: number; hour: number } {
  const date = new Date(iso)
  const ymd = seoulYMD(date)
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hour12: false,
  }).format(date)
  const hour = Number(hourStr) % 24
  return { weekday: calendarWeekday(ymd), hour }
}

export function getSeoulQuarter(now: Date): number {
  const { m } = seoulYMD(now)
  return Math.floor((m - 1) / 3) + 1
}

export function getPeriodRange(period: Exclude<PeriodFilter, "전체">, now: Date): PeriodRange {
  const { y, m, d } = seoulYMD(now)

  switch (period) {
    case "연":
      return { start: seoulMidnight({ y, m: 1, d: 1 }), end: seoulMidnight({ y: y + 1, m: 1, d: 1 }) }

    case "분기": {
      const q = getSeoulQuarter(now)
      const startMonth = (q - 1) * 3 + 1
      const startY = y
      const endMonth = startMonth + 3
      const endY = endMonth > 12 ? y + 1 : y
      const endMonthNorm = endMonth > 12 ? endMonth - 12 : endMonth
      return { start: seoulMidnight({ y: startY, m: startMonth, d: 1 }), end: seoulMidnight({ y: endY, m: endMonthNorm, d: 1 }) }
    }

    case "월": {
      const endMonth = m + 1
      const endY = endMonth > 12 ? y + 1 : y
      const endMonthNorm = endMonth > 12 ? 1 : endMonth
      return { start: seoulMidnight({ y, m, d: 1 }), end: seoulMidnight({ y: endY, m: endMonthNorm, d: 1 }) }
    }

    case "주": {
      const today = { y, m, d }
      const weekday = calendarWeekday(today) // 0=일 ... 6=토
      const daysSinceMonday = (weekday + 6) % 7 // 월=0, 화=1, ..., 일=6
      const weekStart = addCalendarDays(today, -daysSinceMonday)
      const weekEnd = addCalendarDays(weekStart, 7)
      return { start: seoulMidnight(weekStart), end: seoulMidnight(weekEnd) }
    }

    case "일":
      return { start: seoulMidnight({ y, m, d }), end: seoulMidnight(addCalendarDays({ y, m, d }, 1)) }
  }
}

export function isWithinPeriod(lastTouched: string | null, period: PeriodFilter, now: Date): boolean {
  if (period === "전체") return true
  if (!lastTouched) return false

  const { start, end } = getPeriodRange(period, now)
  const touched = new Date(lastTouched)
  return touched >= start && touched < end
}

/**
 * last_touched부터 now까지 KST 달력 날짜 기준 whole-day 차이.
 * 자정을 한 번이라도 넘기면 1일로 센다 (실제 경과 시간이 24시간 미만이어도).
 */
export function computeStalledDays(lastTouched: string | null, now: Date): number | null {
  if (!lastTouched) return null

  const touchedYMD = seoulYMD(new Date(lastTouched))
  const nowYMD = seoulYMD(now)
  const diffMs = calendarUTC(nowYMD).getTime() - calendarUTC(touchedYMD).getTime()
  return Math.round(diffMs / 86_400_000)
}
