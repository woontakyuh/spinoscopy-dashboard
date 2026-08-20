import { describe, expect, it } from "vitest"
import { buildNavMapLayout, PASSING_REGION_X } from "@/lib/sensei/nav-map-layout"
import type { Position } from "@/lib/types/sensei"

const POSITIONS = [
  {
    id: "hg",
    name: "Half Guard",
    nameKr: "하프 가드",
    layer: "guard",
    family: "half",
    perspective: "bottom",
    ruleSet: "common",
  },
  {
    id: "hq",
    name: "Headquarters",
    nameKr: "본부 자세",
    layer: "passing",
    perspective: "top",
    ruleSet: "common",
  },
  {
    id: "triangle",
    name: "Triangle",
    nameKr: "삼각",
    layer: "submission",
    perspective: "neutral",
    ruleSet: "common",
  },
  {
    id: "side_top",
    name: "Side Control",
    nameKr: "사이드 컨트롤",
    layer: "control",
    perspective: "top",
    ruleSet: "common",
  },
] satisfies readonly Position[]

const OPEN_GUARDS = Array.from({ length: 12 }, (_, index) => ({
  id: `open-${index}`,
  name: `Open Guard ${index}`,
  nameKr: `오픈 가드 ${index}`,
  layer: "guard",
  family: "open",
  perspective: "bottom",
  ruleSet: "common",
} satisfies Position))

describe("buildNavMapLayout", () => {
  it("keeps passing inside the guard band and finishes before control", () => {
    const layout = buildNavMapLayout(POSITIONS)

    expect(Math.abs(layout.hq.y - layout.hg.y)).toBeLessThanOrEqual(240)
    expect(layout.triangle.y).toBeLessThan(layout.side_top.y)
  })

  it("keeps dense open guards inside the guard region", () => {
    const layout = buildNavMapLayout(OPEN_GUARDS)

    expect(Math.max(...Object.values(layout).map((point) => point.x))).toBeLessThan(
      PASSING_REGION_X,
    )
    expect(new Set(Object.values(layout).map((point) => point.y)).size).toBeGreaterThanOrEqual(2)
  })
})
