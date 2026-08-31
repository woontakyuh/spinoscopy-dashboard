import { describe, expect, it } from "vitest"
import {
  FOLLOWED_EVENTS,
  INTERNATIONAL_FOLLOWED_EVENTS,
  KOREAN_FOLLOWED_EVENTS,
} from "@/lib/sensei/competitions"

describe("verified competition calendar", () => {
  it("includes the verified FANTASIA X COS Bucheon event", () => {
    expect(KOREAN_FOLLOWED_EVENTS).toContainEqual(
      expect.objectContaining({
        name: "FANTASIA X COS",
        date: "2026-08-22",
        location: "부천체육관, 부천",
        ruleSet: "gi",
        url: "https://www.flowcomp.co.kr/championship/67",
      }),
    )
  })

  it("covers upcoming Korean and major international events with sources", () => {
    expect(KOREAN_FOLLOWED_EVENTS.length).toBeGreaterThanOrEqual(20)
    expect(INTERNATIONAL_FOLLOWED_EVENTS.length).toBeGreaterThanOrEqual(8)

    const ids = FOLLOWED_EVENTS.map((event) => event.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const event of FOLLOWED_EVENTS) {
      expect(event.date >= "2026-08-17").toBe(true)
      expect(event.url).toMatch(/^https:\/\//)
    }
  })
})
