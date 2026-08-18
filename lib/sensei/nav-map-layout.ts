import type { Position, PositionLayer } from "@/lib/types/sensei"
import type { NavMapPoint } from "@/lib/sensei/nav-map-focus"

export const NAV_MAP_WIDTH = 1200
export const GUARD_START_Y = 100
export const GUARD_HEIGHT = 380
export const PASSING_REGION_X = 820

export const GUARD_FAMILY_ORDER = ["closed", "half", "sitting", "open", "butterfly"] as const
export const GUARD_FAMILY_Y: Readonly<Record<string, number>> = {
  closed: 0,
  half: 70,
  sitting: 140,
  open: 210,
  butterfly: 310,
}

export const LAYER_Y_MAP: Readonly<Record<PositionLayer, number>> = {
  standing: 40,
  guard: GUARD_START_Y,
  passing: GUARD_START_Y,
  submission: GUARD_START_Y + GUARD_HEIGHT + 40,
  control: GUARD_START_Y + GUARD_HEIGHT + 160,
  leglock: GUARD_START_Y + GUARD_HEIGHT + 280,
}

export const NAV_MAP_HEIGHT = LAYER_Y_MAP.leglock + 80

const PASSING_ROW_Y = [
  GUARD_START_Y + GUARD_FAMILY_Y.closed,
  GUARD_START_Y + GUARD_FAMILY_Y.half,
  GUARD_START_Y + GUARD_FAMILY_Y.sitting,
  GUARD_START_Y + GUARD_FAMILY_Y.butterfly,
] as const
const OPEN_GUARD_ROW_Y = [GUARD_START_Y + 190, GUARD_START_Y + 250] as const

function placeRow(
  map: Record<string, NavMapPoint>,
  positions: readonly Position[],
  layout: Readonly<{ x: number; y: number; width: number }>,
): void {
  const gap = positions.length > 1
    ? layout.width / (positions.length + 1)
    : layout.width / 2

  positions.forEach((position, index) => {
    map[position.id] = {
      x: layout.x + gap * (index + 1),
      y: layout.y,
    }
  })
}

export function buildNavMapLayout(positions: readonly Position[]): Record<string, NavMapPoint> {
  const map: Record<string, NavMapPoint> = {}

  for (const layer of ["standing", "control", "leglock", "submission"] as const) {
    placeRow(
      map,
      positions.filter((position) => position.layer === layer),
      { x: 80, y: LAYER_Y_MAP[layer], width: NAV_MAP_WIDTH - 120 },
    )
  }

  const passingPositions = positions.filter((position) => position.layer === "passing")
  const passingColumnCount = Math.ceil(passingPositions.length / PASSING_ROW_Y.length)
  const passingColumnGap = (NAV_MAP_WIDTH - PASSING_REGION_X - 40) / (passingColumnCount + 1)
  passingPositions.forEach((position, index) => {
    const column = Math.floor(index / PASSING_ROW_Y.length)
    const row = index % PASSING_ROW_Y.length
    map[position.id] = {
      x: PASSING_REGION_X + 20 + passingColumnGap * (column + 1),
      y: PASSING_ROW_Y[row],
    }
  })

  const guardPositions = positions.filter((position) => position.layer === "guard")
  const byFamily: Record<string, Position[]> = {}
  for (const position of guardPositions) {
    const family = position.family || "other"
    byFamily[family] ??= []
    byFamily[family].push(position)
  }

  for (const family of [...GUARD_FAMILY_ORDER, "other"]) {
    const familyPositions = byFamily[family] ?? []
    if (familyPositions.length === 0) continue

    if (family === "open") {
      const rowSize = Math.ceil(familyPositions.length / OPEN_GUARD_ROW_Y.length)
      OPEN_GUARD_ROW_Y.forEach((y, row) => {
        placeRow(
          map,
          familyPositions.slice(row * rowSize, (row + 1) * rowSize),
          { x: 130, y, width: PASSING_REGION_X - 210 },
        )
      })
      continue
    }

    placeRow(
      map,
      familyPositions,
      {
        x: 130,
        y: GUARD_START_Y + (GUARD_FAMILY_Y[family] ?? 350),
        width: PASSING_REGION_X - 210,
      },
    )
  }

  return map
}
