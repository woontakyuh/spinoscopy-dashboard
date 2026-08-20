import { describe, expect, it } from "vitest"
import { getNavMapLayer } from "@/lib/sensei/nav-map-layout"
import { POSITIONS } from "@/lib/sensei/skillConnections"

describe("Sensei position semantics", () => {
  it("keeps held controls separate from defensive escape starts", () => {
    const controls = POSITIONS.filter(
      (position) => getNavMapLayer(position) === "control",
    )
    const defensiveStarts = POSITIONS.filter((position) =>
      ["side_bottom", "kob_bottom", "mount_bottom", "back_bottom", "turtle_bottom"]
        .includes(position.id),
    )

    expect(controls).not.toHaveLength(0)
    expect(
      controls.every((position) => position.perspective === "top"),
    ).toBe(true)
    expect(
      defensiveStarts.every(
        (position) =>
          getNavMapLayer(position) === "defense" &&
          position.perspective === "bottom",
      ),
    ).toBe(true)
  })
})
