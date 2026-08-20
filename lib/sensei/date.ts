const DAY_MS = 24 * 60 * 60 * 1000

function dateKeyToUtc(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number)
  return Date.UTC(year, month - 1, day)
}

export function getSeoulDateKey(date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

export function competitionDday(
  targetDate: string,
  today = getSeoulDateKey(),
): string {
  const days = Math.round((dateKeyToUtc(targetDate) - dateKeyToUtc(today)) / DAY_MS)
  if (days > 0) return `D-${days}`
  if (days === 0) return "D-Day"
  return `D+${Math.abs(days)}`
}
