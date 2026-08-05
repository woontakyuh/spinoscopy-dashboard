export interface TrainingDateRange {
  readonly from: string
  readonly to: string
  readonly limit: 20
}

interface TrainingQuestionMessage {
  readonly role: "user" | "assistant"
  readonly content: string
}

const TRAINING_INTENT = /(?:수련|훈련|주짓수|bjj|세션)/iu
const EXPLICIT_MONTH = /(?:(20\d{2})년?\s*)?(1[0-2]|0?[1-9])\s*월/u

export function trainingDateRangeFromMessages(
  messages: readonly TrainingQuestionMessage[],
  now: Date,
): TrainingDateRange | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== "user") continue
    const range = trainingDateRangeFromQuestion(message.content, now)
    if (range) return range
  }
  return null
}

export function trainingDateRangeFromQuestion(
  question: string,
  now: Date,
): TrainingDateRange | null {
  if (!TRAINING_INTENT.test(question)) return null

  const current = seoulYearMonth(now)
  if (/(?:지난|저번)\s*달/u.test(question)) {
    const month = current.month === 1 ? 12 : current.month - 1
    const year = current.month === 1 ? current.year - 1 : current.year
    return monthRange(year, month)
  }
  if (/이번\s*달/u.test(question)) return monthRange(current.year, current.month)

  const match = EXPLICIT_MONTH.exec(question)
  if (!match) return null
  const month = Number(match[2])
  const statedYear = match[1] ? Number(match[1]) : null
  const year = statedYear ?? (month > current.month ? current.year - 1 : current.year)
  return monthRange(year, month)
}

function monthRange(year: number, month: number): TrainingDateRange {
  const prefix = `${year}-${String(month).padStart(2, "0")}`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    from: `${prefix}-01`,
    to: `${prefix}-${String(lastDay).padStart(2, "0")}`,
    limit: 20,
  }
}

function seoulYearMonth(now: Date): { readonly year: number; readonly month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now)
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  }
}
