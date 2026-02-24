import { describe, it, expect } from "vitest"
import { calculateDday, getDdayColor } from "@/lib/utils/dday"

describe("calculateDday", () => {
  it("returns '날짜 미정' for null input", () => {
    const result = calculateDday(null)
    expect(result).toEqual({ days: null, label: "날짜 미정", isPast: false })
  })

  it("returns D-DAY for today", () => {
    const today = new Date().toISOString().slice(0, 10)
    const result = calculateDday(today)
    expect(result).toEqual({ days: 0, label: "D-DAY", isPast: false })
  })

  it("returns positive days for future date", () => {
    const future = new Date()
    future.setDate(future.getDate() + 10)
    const result = calculateDday(future.toISOString().slice(0, 10))
    expect(result.days).toBe(10)
    expect(result.label).toBe("D-10")
    expect(result.isPast).toBe(false)
  })

  it("returns negative days for past date", () => {
    const past = new Date()
    past.setDate(past.getDate() - 5)
    const result = calculateDday(past.toISOString().slice(0, 10))
    expect(result.days).toBe(-5)
    expect(result.label).toBe("D+5")
    expect(result.isPast).toBe(true)
  })
})

describe("getDdayColor", () => {
  it("returns zinc for null days", () => {
    expect(getDdayColor({ days: null, label: "날짜 미정", isPast: false })).toContain("zinc-700")
  })

  it("returns red for D-DAY", () => {
    expect(getDdayColor({ days: 0, label: "D-DAY", isPast: false })).toContain("red")
  })

  it("returns amber for D-1 to D-7", () => {
    expect(getDdayColor({ days: 3, label: "D-3", isPast: false })).toContain("amber")
  })

  it("returns cyan for D-8 to D-30", () => {
    expect(getDdayColor({ days: 15, label: "D-15", isPast: false })).toContain("cyan")
  })

  it("returns faded zinc for past dates", () => {
    expect(getDdayColor({ days: -5, label: "D+5", isPast: true })).toContain("zinc-500")
  })
})
