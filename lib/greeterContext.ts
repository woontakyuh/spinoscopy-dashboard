// 시간 맥락 유틸리티 — 에이전트 말풍선에서 공용

export interface TimeContext {
  hour: number           // 0-23 (Asia/Seoul)
  dayOfWeek: number      // 0(일) ~ 6(토)
  isWeekend: boolean
  isMondayMorning: boolean  // 월요일 06-11시
  isFridayAfternoon: boolean // 금요일 14시+
  bucket: "dawn" | "morning" | "afternoon" | "evening" | "night"
}

export function getTimeContext(): TimeContext {
  const now = new Date()
  const seoulStr = now.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  const seoul = new Date(seoulStr)
  const hour = seoul.getHours()
  const dayOfWeek = seoul.getDay()

  let bucket: TimeContext["bucket"]
  if (hour < 6) bucket = "dawn"
  else if (hour < 12) bucket = "morning"
  else if (hour < 17) bucket = "afternoon"
  else if (hour < 21) bucket = "evening"
  else bucket = "night"

  return {
    hour,
    dayOfWeek,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    isMondayMorning: dayOfWeek === 1 && hour >= 6 && hour < 12,
    isFridayAfternoon: dayOfWeek === 5 && hour >= 14,
    bucket,
  }
}

// D-day 계산 (Asia/Seoul 기준)
export function dday(dateStr: string): number {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
  const t = new Date(today + "T00:00:00+09:00")
  const d = new Date(dateStr.slice(0, 10) + "T00:00:00+09:00")
  return Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24))
}
