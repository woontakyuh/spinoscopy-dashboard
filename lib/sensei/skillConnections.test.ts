import { describe, expect, it } from "vitest"
import { canonicalizeNavMapGraph } from "@/lib/sensei/nav-map-canonicalization"
import { POSITIONS, TRANSITIONS } from "@/lib/sensei/skillConnections"

describe("Sensei position semantics", () => {
  it("projects attack and defense perspectives onto one situation node", () => {
    const graph = canonicalizeNavMapGraph(POSITIONS, TRANSITIONS)
    const positionIds = graph.positions.map((position) => position.id)

    expect(positionIds).toEqual(
      expect.arrayContaining(["side_top", "kob_top", "mount_top", "back_top", "turtle_top"]),
    )
    expect(positionIds).not.toEqual(
      expect.arrayContaining([
        "side_bottom",
        "kob_bottom",
        "mount_bottom",
        "back_bottom",
        "turtle_bottom",
      ]),
    )
    expect(
      graph.positions.find((position) => position.id === "mount_top")?.lessonNumbers,
    ).toEqual([38, 39, 40, 41, 42])
    expect(graph.transitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "mount_top",
          to: "hg",
          type: "escape",
        }),
      ]),
    )
  })
})
