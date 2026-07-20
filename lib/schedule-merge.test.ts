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
        place: "회의실 A",
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

  it("merges differently named records when start time and non-empty location are identical", () => {
    const result = mergeSchedules(
      [{
        page_id: "notion-1", url: "https://notion.so/ksor", name: "KSOR Steering Committee 회의",
        date_start: "2026-07-21T18:30:00+09:00", date_end: null, place: "Zoom", category: "회의", status: "",
      }],
      [{
        id: "gcal-1", title: "KSOR 미팅 — KOMISS data registry 연구",
        start: "2026-07-21T18:30:00+09:00", end: "2026-07-21T19:30:00+09:00", location: "Zoom", url: "https://calendar.google.com/ksor",
      }],
      includeAll
    )

    expect(result).toHaveLength(1)
    expect(result[0].source).toBe("both")
  })

  it("deduplicates identical events returned from multiple Google calendars", () => {
    const event = {
      title: "다이치산고 제주 캠프트리 — 저녁식사",
      start: "2026-07-25T17:30:00+09:00", end: "2026-07-25T19:30:00+09:00",
      location: "코리아참숯불정육식당", url: "https://calendar.google.com/event",
    }
    const result = mergeSchedules(
      [],
      [{ id: "gcal-1", ...event }, { id: "gcal-2", ...event, title: "다이치산고 제주 캠프트리" }],
      includeAll
    )

    expect(result).toHaveLength(1)
    expect(result[0].source).toBe("gcal")
  })

  it("merges numbered recurring meetings across PROM title variants", () => {
    const result = mergeSchedules(
      [{
        page_id: "notion-1", url: "https://notion.so/prom", name: "PROM 연구 7회차",
        date_start: "2026-07-19T20:00:00+09:00", date_end: null, place: "", category: "회의", status: "",
      }],
      [{
        id: "gcal-1", title: "PROM meeting #7", start: "2026-07-19T20:00:00+09:00",
        end: "2026-07-19T21:00:00+09:00", location: "", url: "https://calendar.google.com/prom",
      }],
      includeAll
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ title: "PROM 연구 7회차", source: "both" })
  })
})
