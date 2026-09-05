import { describe, it, expect } from "vitest"
import { calculateBjjStats } from "./stats"
import type { Archetype, SenseiEntry } from "@/lib/types/sensei"

const stats = (o: Partial<Archetype["stats"]>): Archetype["stats"] =>
  ({ guard: 0, passing: 0, control: 0, finishing: 0, takedowns: 0, legLocks: 0, ...o }) as Archetype["stats"]
const arch = (name: string, ruleSet: Archetype["ruleSet"], s: Partial<Archetype["stats"]>): Archetype =>
  ({ name, flag: "", nickname: "", team: "", stats: stats(s), tags: [], playstyle: "", ruleSet, category: "gi-active", gameplan: [] }) as Archetype
const entry = (tags: string[]): SenseiEntry =>
  ({ id: tags.join("-") || "e", title: "", sessionType: "class", date: "2026-08-10", instructor: "", gym: "", classTags: tags, sparringTags: [], studyTags: [], note: "", url: "" })

describe("가장 닮은 선수 — 노션 선수 목록으로 고른다", () => {
  it("선수 목록이 비면 null (코드 안 사본으로 몰래 대체하지 않는다)", () => {
    const s = calculateBjjStats([entry(["HG"])], [])
    expect(s.gi.closestArchetype).toBeNull()
    expect(s.nogi.closestArchetype).toBeNull()
  })

  it("룰셋을 존중한다: 노기 스탯은 노기·both 선수 중에서만 고른다", () => {
    const roster = [
      arch("GiOnly", "gi", { guard: 1 }),
      arch("NogiOnly", "nogi", { guard: 1 }),
      arch("BothGuy", "both", { guard: 90 }),
    ]
    const s = calculateBjjStats([entry(["HG"]), entry(["NoGi", "HG"])], roster)
    expect(["NogiOnly", "BothGuy"]).toContain(s.nogi.closestArchetype)
    expect(s.nogi.closestArchetype).not.toBe("GiOnly")
    expect(s.gi.closestArchetype).not.toBe("NogiOnly")
  })
})
