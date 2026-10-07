import { describe, expect, it } from "vitest"
import { calculateBjjStats } from "@/lib/sensei/stats"
import type { Archetype, SenseiEntry } from "@/lib/types/sensei"

const NO_ARCHETYPES: readonly Archetype[] = []

function entry(over: Partial<SenseiEntry> & { id: string; date: string }): SenseiEntry {
  return {
    title: "",
    sessionType: "class",
    instructor: "",
    gym: "",
    note: "",
    classTags: [],
    sparringTags: [],
    studyTags: [],
    focusApplied: false,
    url: "",
    ...over,
  } as SenseiEntry
}

function statsOf(entries: SenseiEntry[]) {
  return calculateBjjStats(entries, NO_ARCHETYPES)
}

describe("승급 기록에서 벨트를 읽는다", () => {
  it("[BELT:색:그랄] 마커를 읽는다", () => {
    const stats = statsOf([
      entry({
        id: "p1",
        date: "2026-09-18",
        sessionType: "promotion",
        note: "[BELT:blue:4] 승급: 블루벨트 4그랄",
      }),
    ])
    expect(stats.belt).toBe("blue")
    expect(stats.beltStripes).toBe(4)
  })

  it("마커가 없어도 한국어 표기를 읽는다", () => {
    const stats = statsOf([
      entry({
        id: "p2",
        date: "2026-09-18",
        sessionType: "promotion",
        note: "2026-09-18 승급: 블루벨트 4그랄. 수여: 조준용 관장님",
      }),
    ])
    expect(stats.belt).toBe("blue")
    expect(stats.beltStripes).toBe(4)
  })

  it("가장 최근 승급을 쓴다", () => {
    const stats = statsOf([
      entry({ id: "old", date: "2026-03-20", sessionType: "promotion", note: "블루벨트 3그랄" }),
      entry({ id: "new", date: "2026-09-18", sessionType: "promotion", note: "블루벨트 4그랄" }),
    ])
    expect(stats.beltStripes).toBe(4)
  })

  it("승급은 체육관 출석으로 세지 않는다", () => {
    const stats = statsOf([
      entry({ id: "c", date: "2026-09-17", sessionType: "class" }),
      entry({ id: "p", date: "2026-09-18", sessionType: "promotion", note: "블루벨트 4그랄" }),
    ])
    expect(stats.sessions2026).toBe(1)
  })

  it("승급일은 하드코딩 목록이 아니라 Notion 기록에서 온다", () => {
    const stats = statsOf([
      entry({ id: "p", date: "2026-09-18", sessionType: "promotion", note: "블루벨트 4그랄" }),
    ])
    expect(stats.lastCeremonyDate).toBe("2026-09-18")
  })

  it("Notion에 승급 기록이 없으면 기존 목록으로 되돌아간다", () => {
    const stats = statsOf([entry({ id: "c", date: "2026-09-17" })])
    expect(stats.lastCeremonyDate).toBe("2026-03-20")
  })
})
