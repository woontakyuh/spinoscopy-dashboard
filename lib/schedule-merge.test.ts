import { describe, expect, it } from "vitest"
import { mergeSchedules } from "./schedule-merge"

describe("mergeSchedules", () => {
  const includeAll = () => true

  it("merges same-time schedules when their titles differ only by meeting wording", () => {
    const result = mergeSchedules(
      [{
        page_id: "notion-1",
        url: "https://notion.so/ube",
        name: "UBE 종설 모임",
        date_start: "2026-07-20T19:30:00+09:00",
        date_end: "2026-07-20T21:30:00+09:00",
        place: "이화원 프라이빗",
        category: "회의",
        status: "",
      }],
      [{
        id: "gcal-1",
        title: "UBE 종설 회의",
        start: "2026-07-20T19:30:00+09:00",
        end: "2026-07-20T21:30:00+09:00",
        location: "이화원 프라이빗",
        url: "https://calendar.google.com/ube",
      }],
      includeAll
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      title: "UBE 종설 모임",
      source: "both",
      notionUrl: "https://notion.so/ube",
      gcalUrl: "https://calendar.google.com/ube",
    })
  })

  it("does not merge unrelated meetings that happen at the same time", () => {
    const result = mergeSchedules(
      [{
        page_id: "notion-1",
        url: "https://notion.so/ksor",
        name: "KSOR Steering Committee 회의",
        date_start: "2026-07-21T18:30:00+09:00",
        date_end: "2026-07-21T19:30:00+09:00",
        place: "Zoom",
        category: "회의",
        status: "",
      }],
      [{
        id: "gcal-1",
        title: "KOMISS data registry 연구 줌 회의",
        start: "2026-07-21T18:30:00+09:00",
        end: "2026-07-21T19:30:00+09:00",
        location: "Zoom",
        url: "https://calendar.google.com/komiss",
      }],
      includeAll
    )

    expect(result).toHaveLength(2)
    expect(result.map((item) => item.source).sort()).toEqual(["gcal", "notion"])
  })
})
