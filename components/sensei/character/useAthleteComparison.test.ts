// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useAthleteComparison } from "./useAthleteComparison"
import type { Archetype } from "@/lib/types/sensei"

const base = { flag: "Brazil", nickname: "", team: "", stats: { guard: 1, passing: 1, control: 1, finishing: 1, takedowns: 1, legLocks: 1 }, tags: [], playstyle: "", gameplan: [] }
const a = (name: string, ruleSet: Archetype["ruleSet"], category: Archetype["category"]): Archetype =>
  ({ ...base, name, ruleSet, category } as Archetype)

const roster = [
  a("GiLegend", "gi", "gi-legend"),
  a("NogiGuy", "nogi", "nogi"),
  a("BothGuy", "both", "gi-active"),
  a("Sensei", "gi", "special"),
]

describe("useAthleteComparison — 모드별 선수 필터", () => {
  it("기 탭이면 기 선수 + 둘 다 하는 선수", () => {
    const { result } = renderHook(() => useAthleteComparison(roster, null, "gi"))
    expect(result.current.filteredAthletes.map((x) => x.name)).toEqual(["GiLegend", "BothGuy", "Sensei"])
  })

  it("노기 탭이면 노기 선수 + 둘 다 하는 선수", () => {
    const { result } = renderHook(() => useAthleteComparison(roster, null, "nogi"))
    expect(result.current.filteredAthletes.map((x) => x.name)).toEqual(["NogiGuy", "BothGuy"])
  })

  it("카테고리 필터는 모드 필터 위에 겹친다", () => {
    const { result } = renderHook(() => useAthleteComparison(roster, null, "gi"))
    act(() => result.current.setCategory("special"))
    expect(result.current.filteredAthletes.map((x) => x.name)).toEqual(["Sensei"])
  })

  it("모드를 안 주면 기가 기본이다", () => {
    const { result } = renderHook(() => useAthleteComparison(roster, null))
    expect(result.current.filteredAthletes.some((x) => x.name === "NogiGuy")).toBe(false)
  })
})
