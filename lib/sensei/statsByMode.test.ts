import { describe, it, expect } from "vitest"
import { calculateBjjStats } from "./stats"
import type { SenseiEntry } from "@/lib/types/sensei"

const y = new Date().getFullYear()
function entry(date: string, tags: string[] = [], sessionType: SenseiEntry["sessionType"] = "class"): SenseiEntry {
  return {
    id: date + tags.join(), title: "t", sessionType, date, instructor: "", gym: "",
    classTags: tags, sparringTags: [], studyTags: [], note: "", url: "",
  }
}

describe("byMode — Gi/NoGi 토글에 따라 갈리는 수련 요약", () => {
  const entries = [
    entry(`${y}-01-06`), entry(`${y}-01-13`), entry(`${y}-01-20`),          // gi 3
    entry(`${y}-01-08`, ["NoGi"]),                                          // nogi 1
    entry("2025-12-01"), entry("2025-11-03", ["NoGi"]),                      // 작년
    entry(`${y}-02-01`, [], "study"),                                       // 체육관 아님
  ]
  const s = calculateBjjStats(entries, [])

  it("NoGi 태그로 모드를 가른다", () => {
    expect(s.byMode.gi.totalSessions).toBe(4)
    expect(s.byMode.nogi.totalSessions).toBe(2)
  })

  it("올해 세션은 기존 sessions2026Gi/Nogi 와 일치한다", () => {
    expect(s.byMode.gi.sessionsThisYear).toBe(s.sessions2026Gi)
    expect(s.byMode.nogi.sessionsThisYear).toBe(s.sessions2026Nogi)
  })

  it("study 는 어느 모드에도 세지 않는다", () => {
    expect(s.byMode.gi.totalSessions + s.byMode.nogi.totalSessions).toBe(6)
  })

  it("기록이 없으면 0", () => {
    const e = calculateBjjStats([], [])
    expect(e.byMode.gi).toEqual({ totalSessions: 0, sessionsThisYear: 0, streak: 0 })
    expect(e.byMode.nogi).toEqual({ totalSessions: 0, sessionsThisYear: 0, streak: 0 })
  })
})
