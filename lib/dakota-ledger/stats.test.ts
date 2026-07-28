import { describe, expect, it } from "vitest"
import type { OperationItem } from "@/lib/notion/operations"
import type { SessionLogItem } from "@/lib/notion/sessionLog"
import { getPeriodRange } from "./period"
import {
  aggregateTrend,
  bucketGranularityForPeriod,
  buildTimeBuckets,
  buildTimelineRows,
  computeDomainShare,
  computeLeadTimeByDomain,
  computeRhythmMatrix,
  computeStalledRanking,
} from "./stats"

function session(over: Partial<SessionLogItem> = {}): SessionLogItem {
  return {
    sessionKey: "k1", name: "세션", date: "2026-07-20T04:00:00.000Z",
    channel: "cli", origin: "수행", agent: "dakota", domain: "AI",
    tags: [], summary: "", outcome: "완료", msgCount: 3, operationPageId: null,
    surface: null,
    ...over,
  }
}

function operation(over: Partial<OperationItem> = {}): OperationItem {
  return {
    page_id: "p1", name: "과제", status: "In Progress", type: "Execution", domain: "AI",
    priority: "Medium", tags: [], context: "", action_taken: "", result: "", next_action: "다음 행동",
    linked_todo_url: null, source_url: null, started_at: "2026-07-01", last_touched: "2026-07-20",
    session_count: 1, msg_total: 1, created_at: "2026-07-01", updated_at: "2026-07-20",
    completed_at: null, notion_url: "https://notion.so/p1",
    ...over,
  }
}

describe("computeDomainShare", () => {
  it("도메인별 개수 합이 입력 세션 수와 같다", () => {
    const sessions = [
      session({ domain: "AI" }), session({ domain: "AI" }), session({ domain: "Research" }),
      session({ domain: "Personal" }),
    ]
    const shares = computeDomainShare(sessions)
    const total = shares.reduce((sum, s) => sum + s.count, 0)
    expect(total).toBe(sessions.length)
  })

  it("count 내림차순으로 정렬되고 pct를 계산한다", () => {
    const sessions = [
      session({ domain: "AI" }), session({ domain: "AI" }), session({ domain: "AI" }),
      session({ domain: "Research" }),
    ]
    const shares = computeDomainShare(sessions)
    expect(shares[0]).toEqual({ domain: "AI", count: 3, pct: 0.75 })
    expect(shares[1]).toEqual({ domain: "Research", count: 1, pct: 0.25 })
  })

  it("빈 입력은 빈 배열을 반환한다", () => {
    expect(computeDomainShare([])).toEqual([])
  })

  it("domain이 null인 세션은 건너뛴다", () => {
    const sessions = [session({ domain: "AI" }), session({ domain: null })]
    const shares = computeDomainShare(sessions)
    expect(shares.reduce((sum, s) => sum + s.count, 0)).toBe(1)
  })
})

describe("bucketGranularityForPeriod", () => {
  it("일 -> hour, 주/월 -> day, 분기 -> week, 연/전체 -> month", () => {
    expect(bucketGranularityForPeriod("일")).toBe("hour")
    expect(bucketGranularityForPeriod("주")).toBe("day")
    expect(bucketGranularityForPeriod("월")).toBe("day")
    expect(bucketGranularityForPeriod("분기")).toBe("week")
    expect(bucketGranularityForPeriod("연")).toBe("month")
    expect(bucketGranularityForPeriod("전체")).toBe("month")
  })
})

describe("buildTimeBuckets 경계", () => {
  const now = new Date("2026-07-20T04:00:00.000Z") // KST 2026-07-20(월) 13:00

  it("일: 24개의 1시간 버킷, 첫 시작=range.start, 마지막 끝=range.end", () => {
    const range = getPeriodRange("일", now)
    const buckets = buildTimeBuckets("일", range)
    expect(buckets).toHaveLength(24)
    expect(buckets[0].start.getTime()).toBe(range.start.getTime())
    expect(buckets.at(-1)!.end.getTime()).toBe(range.end.getTime())
    expect(buckets[0].end.getTime() - buckets[0].start.getTime()).toBe(3_600_000)
  })

  it("주: 7개의 1일 버킷", () => {
    const range = getPeriodRange("주", now)
    const buckets = buildTimeBuckets("주", range)
    expect(buckets).toHaveLength(7)
    expect(buckets[0].start.getTime()).toBe(range.start.getTime())
    expect(buckets.at(-1)!.end.getTime()).toBe(range.end.getTime())
  })

  it("월: 2026년 7월은 31일 -> 31개의 1일 버킷", () => {
    const range = getPeriodRange("월", now)
    const buckets = buildTimeBuckets("월", range)
    expect(buckets).toHaveLength(31)
  })

  it("분기: 92일짜리 Q3 -> 7일 버킷 14개, 마지막은 부분 버킷이라도 range.end를 넘지 않는다", () => {
    const range = getPeriodRange("분기", now)
    const buckets = buildTimeBuckets("분기", range)
    expect(buckets).toHaveLength(14)
    expect(buckets.at(-1)!.end.getTime()).toBe(range.end.getTime())
    for (const b of buckets) expect(b.end.getTime()).toBeLessThanOrEqual(range.end.getTime())
  })

  it("연: 12개의 월 버킷", () => {
    const range = getPeriodRange("연", now)
    const buckets = buildTimeBuckets("연", range)
    expect(buckets).toHaveLength(12)
    expect(buckets[0].start.getTime()).toBe(range.start.getTime())
    expect(buckets.at(-1)!.end.getTime()).toBe(range.end.getTime())
  })

  it("전체: 임의 범위(4개월)도 월 단위로 쪼갠다", () => {
    const range = { start: new Date("2026-04-01T00:00:00+09:00"), end: new Date("2026-08-01T00:00:00+09:00") }
    const buckets = buildTimeBuckets("전체", range)
    expect(buckets).toHaveLength(4)
  })
})

describe("aggregateTrend", () => {
  it("세션을 버킷과 도메인별로 집계한다", () => {
    const now = new Date("2026-07-20T04:00:00.000Z")
    const range = getPeriodRange("주", now)
    const buckets = buildTimeBuckets("주", range)
    const sessions = [
      session({ date: "2026-07-20T05:00:00+09:00", domain: "AI" }), // 월요일 버킷
      session({ date: "2026-07-20T10:00:00+09:00", domain: "Research" }),
      session({ date: "2026-07-22T10:00:00+09:00", domain: "AI" }), // 수요일 버킷
    ]
    const rows = aggregateTrend(sessions, buckets)
    expect(rows).toHaveLength(7)
    expect(rows[0].byDomain.AI).toBe(1)
    expect(rows[0].byDomain.Research).toBe(1)
    expect(rows[0].total).toBe(2)
    expect(rows[2].byDomain.AI).toBe(1)
    expect(rows[2].total).toBe(1)
  })
})

describe("computeRhythmMatrix", () => {
  it("KST 자정 근처 타임스탬프는 KST 기준 요일·시간대로 배치된다", () => {
    // UTC 2026-07-18T15:30 (토) = KST 2026-07-19T00:30 (일, 새벽)
    const sessions = [session({ date: "2026-07-18T15:30:00.000Z" })]
    const cells = computeRhythmMatrix(sessions)
    const sundayDawn = cells.find((c) => c.weekdayLabel === "일" && c.band === "새벽")
    const saturdayNight = cells.find((c) => c.weekdayLabel === "토" && c.band === "밤")
    expect(sundayDawn?.count).toBe(1)
    expect(saturdayNight?.count).toBe(0)
  })

  it("28칸(7요일 x 4시간대)을 모두 반환한다", () => {
    const cells = computeRhythmMatrix([])
    expect(cells).toHaveLength(28)
    expect(cells.every((c) => c.count === 0)).toBe(true)
  })
})

describe("computeLeadTimeByDomain", () => {
  it("홀수 개: 중앙값", () => {
    const ops = [
      operation({ domain: "AI", started_at: "2026-07-01", completed_at: "2026-07-03", status: "Completed" }), // 2
      operation({ domain: "AI", started_at: "2026-07-01", completed_at: "2026-07-06", status: "Completed" }), // 5
      operation({ domain: "AI", started_at: "2026-07-01", completed_at: "2026-07-11", status: "Completed" }), // 10
    ]
    const result = computeLeadTimeByDomain(ops)
    expect(result).toEqual([{ domain: "AI", medianDays: 5, count: 3 }])
  })

  it("짝수 개: 중간 두 값의 평균", () => {
    const ops = [
      operation({ domain: "AI", started_at: "2026-07-01", completed_at: "2026-07-03", status: "Completed" }), // 2
      operation({ domain: "AI", started_at: "2026-07-01", completed_at: "2026-07-05", status: "Completed" }), // 4
      operation({ domain: "AI", started_at: "2026-07-01", completed_at: "2026-07-06", status: "Completed" }), // 5
      operation({ domain: "AI", started_at: "2026-07-01", completed_at: "2026-07-09", status: "Completed" }), // 8
    ]
    const result = computeLeadTimeByDomain(ops)
    expect(result).toEqual([{ domain: "AI", medianDays: 4.5, count: 4 }])
  })

  it("완료 과제가 없는 도메인은 결과에서 제외한다 (0으로 그리지 않는다)", () => {
    const ops = [
      operation({ domain: "AI", started_at: "2026-07-01", completed_at: "2026-07-03", status: "Completed" }),
      operation({ domain: "Research", started_at: "2026-07-01", completed_at: null, status: "In Progress" }),
    ]
    const result = computeLeadTimeByDomain(ops)
    expect(result.map((r) => r.domain)).toEqual(["AI"])
  })
})

describe("computeStalledRanking", () => {
  const now = new Date("2026-07-28T00:00:00+09:00")

  it("Completed/Archived는 제외한다", () => {
    const ops = [
      operation({ page_id: "a", status: "Completed", last_touched: "2026-07-01" }),
      operation({ page_id: "b", status: "Archived", last_touched: "2026-07-01" }),
      operation({ page_id: "c", status: "In Progress", last_touched: "2026-07-01" }),
    ]
    const result = computeStalledRanking(ops, now)
    expect(result.map((r) => r.pageId)).toEqual(["c"])
  })

  it("정체일수 내림차순, null last_touched는 맨 뒤로 보낸다", () => {
    const ops = [
      operation({ page_id: "recent", status: "Waiting", last_touched: "2026-07-27" }), // 1일
      operation({ page_id: "stale", status: "In Progress", last_touched: "2026-06-01" }), // 여러 날
      operation({ page_id: "never", status: "Inbox", last_touched: null }),
    ]
    const result = computeStalledRanking(ops, now)
    expect(result.map((r) => r.pageId)).toEqual(["stale", "recent", "never"])
    expect(result.at(-1)!.stalledDays).toBeNull()
  })
})

describe("buildTimelineRows", () => {
  it("started_at이 있는 과제만, started_at 오름차순으로 정렬한다", () => {
    const ops = [
      operation({ page_id: "b", started_at: "2026-07-10", last_touched: "2026-07-15" }),
      operation({ page_id: "a", started_at: "2026-07-01", last_touched: "2026-07-05" }),
      operation({ page_id: "no-start", started_at: null }),
    ]
    const rows = buildTimelineRows(ops)
    expect(rows.map((r) => r.pageId)).toEqual(["a", "b"])
  })
})
