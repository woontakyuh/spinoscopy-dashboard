import { describe, expect, it } from "vitest"
import { competitionDday } from "@/lib/sensei/date"

describe("competitionDday", () => {
  it("calculates calendar-day differences without a UTC offset", () => {
    expect(competitionDday("2026-08-18", "2026-08-18")).toBe("D-Day")
    expect(competitionDday("2026-08-22", "2026-08-18")).toBe("D-4")
    expect(competitionDday("2026-08-17", "2026-08-18")).toBe("D+1")
  })
})
