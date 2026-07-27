import { describe, expect, it } from "vitest"
import {
  computeStalledDays,
  getPeriodRange,
  getSeoulQuarter,
  isWithinPeriod,
} from "./period"

describe("getPeriodRange 연", () => {
  it("올해 1월 1일 00:00 KST부터 다음 해 1월 1일 00:00 KST 전까지", () => {
    const now = new Date("2026-07-20T04:00:00.000Z") // 2026-07-20T13:00 KST
    const { start, end } = getPeriodRange("연", now)
    expect(start.toISOString()).toBe(new Date("2026-01-01T00:00:00+09:00").toISOString())
    expect(end.toISOString()).toBe(new Date("2027-01-01T00:00:00+09:00").toISOString())
  })
})

describe("getPeriodRange 분기", () => {
  it("2026-05-15는 Q2 → 4/1~7/1 KST", () => {
    const now = new Date("2026-05-15T00:00:00+09:00")
    const { start, end } = getPeriodRange("분기", now)
    expect(start.toISOString()).toBe(new Date("2026-04-01T00:00:00+09:00").toISOString())
    expect(end.toISOString()).toBe(new Date("2026-07-01T00:00:00+09:00").toISOString())
  })

  it("2026-07-01은 Q3 → 7/1~10/1 KST", () => {
    const now = new Date("2026-07-01T00:00:00+09:00")
    const { start, end } = getPeriodRange("분기", now)
    expect(start.toISOString()).toBe(new Date("2026-07-01T00:00:00+09:00").toISOString())
    expect(end.toISOString()).toBe(new Date("2026-10-01T00:00:00+09:00").toISOString())
  })

  it("Q4는 연도를 넘어간다 (2026-11-05 → 10/1~다음해 1/1)", () => {
    const now = new Date("2026-11-05T00:00:00+09:00")
    const { start, end } = getPeriodRange("분기", now)
    expect(start.toISOString()).toBe(new Date("2026-10-01T00:00:00+09:00").toISOString())
    expect(end.toISOString()).toBe(new Date("2027-01-01T00:00:00+09:00").toISOString())
  })
})

describe("getPeriodRange 월", () => {
  it("이번 달 1일 00:00 KST부터 다음 달 1일 00:00 KST 전까지", () => {
    const now = new Date("2026-07-20T04:00:00.000Z")
    const { start, end } = getPeriodRange("월", now)
    expect(start.toISOString()).toBe(new Date("2026-07-01T00:00:00+09:00").toISOString())
    expect(end.toISOString()).toBe(new Date("2026-08-01T00:00:00+09:00").toISOString())
  })

  it("12월은 다음 해 1월로 넘어간다", () => {
    const now = new Date("2026-12-15T00:00:00+09:00")
    const { start, end } = getPeriodRange("월", now)
    expect(start.toISOString()).toBe(new Date("2026-12-01T00:00:00+09:00").toISOString())
    expect(end.toISOString()).toBe(new Date("2027-01-01T00:00:00+09:00").toISOString())
  })
})

describe("getPeriodRange 주 (월요일 시작)", () => {
  it("2026-07-27(월요일) 자체가 그 주의 시작이다", () => {
    const now = new Date("2026-07-27T00:00:00+09:00")
    const { start, end } = getPeriodRange("주", now)
    expect(start.toISOString()).toBe(new Date("2026-07-27T00:00:00+09:00").toISOString())
    expect(end.toISOString()).toBe(new Date("2026-08-03T00:00:00+09:00").toISOString())
  })

  it("월 경계를 넘는 주: 2026-07-30(목)이 속한 주는 7/27~8/3", () => {
    const now = new Date("2026-07-30T18:00:00+09:00")
    const { start, end } = getPeriodRange("주", now)
    expect(start.toISOString()).toBe(new Date("2026-07-27T00:00:00+09:00").toISOString())
    expect(end.toISOString()).toBe(new Date("2026-08-03T00:00:00+09:00").toISOString())
  })

  it("KST 자정 근처: UTC로는 전날이지만 KST로는 다음 날 → 같은 주(월요일)로 계산된다", () => {
    // UTC 2026-07-19T16:00 = KST 2026-07-20T01:00 (월요일)
    const now = new Date("2026-07-19T16:00:00.000Z")
    const { start, end } = getPeriodRange("주", now)
    expect(start.toISOString()).toBe(new Date("2026-07-20T00:00:00+09:00").toISOString())
    expect(end.toISOString()).toBe(new Date("2026-07-27T00:00:00+09:00").toISOString())
  })

  it("일요일은 그 주의 마지막 날 → 시작은 그 전주 월요일", () => {
    const now = new Date("2026-08-02T12:00:00+09:00") // 일요일
    const { start, end } = getPeriodRange("주", now)
    expect(start.toISOString()).toBe(new Date("2026-07-27T00:00:00+09:00").toISOString())
    expect(end.toISOString()).toBe(new Date("2026-08-03T00:00:00+09:00").toISOString())
  })
})

describe("getPeriodRange 일", () => {
  it("오늘 00:00 KST부터 내일 00:00 KST 전까지", () => {
    const now = new Date("2026-07-20T04:00:00.000Z") // 2026-07-20T13:00 KST
    const { start, end } = getPeriodRange("일", now)
    expect(start.toISOString()).toBe(new Date("2026-07-20T00:00:00+09:00").toISOString())
    expect(end.toISOString()).toBe(new Date("2026-07-21T00:00:00+09:00").toISOString())
  })

  it("KST 자정 근처에도 올바른 KST 날짜로 계산된다", () => {
    // UTC 2026-07-19T15:30 = KST 2026-07-20T00:30
    const now = new Date("2026-07-19T15:30:00.000Z")
    const { start, end } = getPeriodRange("일", now)
    expect(start.toISOString()).toBe(new Date("2026-07-20T00:00:00+09:00").toISOString())
    expect(end.toISOString()).toBe(new Date("2026-07-21T00:00:00+09:00").toISOString())
  })
})

describe("getSeoulQuarter", () => {
  it("2026-05-15 → Q2", () => {
    expect(getSeoulQuarter(new Date("2026-05-15T00:00:00+09:00"))).toBe(2)
  })

  it("2026-07-01 → Q3", () => {
    expect(getSeoulQuarter(new Date("2026-07-01T00:00:00+09:00"))).toBe(3)
  })

  it("2026-01-01 → Q1, 2026-12-31 → Q4", () => {
    expect(getSeoulQuarter(new Date("2026-01-01T00:00:00+09:00"))).toBe(1)
    expect(getSeoulQuarter(new Date("2026-12-31T23:00:00+09:00"))).toBe(4)
  })
})

describe("isWithinPeriod", () => {
  const now = new Date("2026-07-30T12:00:00+09:00")

  it("전체는 last_touched와 무관하게 항상 true", () => {
    expect(isWithinPeriod(null, "전체", now)).toBe(true)
    expect(isWithinPeriod("2020-01-01", "전체", now)).toBe(true)
  })

  it("last_touched가 null이면 전체가 아닌 모든 기간에서 false", () => {
    expect(isWithinPeriod(null, "일", now)).toBe(false)
    expect(isWithinPeriod(null, "주", now)).toBe(false)
    expect(isWithinPeriod(null, "월", now)).toBe(false)
    expect(isWithinPeriod(null, "분기", now)).toBe(false)
    expect(isWithinPeriod(null, "연", now)).toBe(false)
  })

  it("이번 주 안의 last_touched는 주 필터에 포함된다", () => {
    expect(isWithinPeriod("2026-07-27T10:00:00.000Z", "주", now)).toBe(true)
  })

  it("이번 주 밖의 last_touched는 주 필터에서 제외된다", () => {
    expect(isWithinPeriod("2026-07-01T10:00:00.000Z", "주", now)).toBe(false)
  })
})

describe("computeStalledDays", () => {
  it("last_touched가 null이면 null을 반환한다", () => {
    expect(computeStalledDays(null, new Date("2026-07-28T00:00:00+09:00"))).toBeNull()
  })

  it("3일 전이면 3을 반환한다 (whole days)", () => {
    const lastTouched = "2026-07-25T00:00:00.000Z"
    const now = new Date("2026-07-28T00:00:00.000Z")
    expect(computeStalledDays(lastTouched, now)).toBe(3)
  })

  it("KST 달력 날짜 기준: 2시간 차이라도 자정을 넘기면 1일로 센다", () => {
    const lastTouched = "2026-07-27T23:00:00+09:00"
    const now = new Date("2026-07-28T01:00:00+09:00")
    expect(computeStalledDays(lastTouched, now)).toBe(1)
  })

  it("같은 KST 날짜면 0을 반환한다", () => {
    const lastTouched = "2026-07-28T01:00:00+09:00"
    const now = new Date("2026-07-28T23:00:00+09:00")
    expect(computeStalledDays(lastTouched, now)).toBe(0)
  })
})
