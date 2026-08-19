import type {
  Archetype,
  BjjAttributes,
  Position,
  Transition,
} from "@/lib/types/sensei"
import { tagToPositionId } from "@/lib/sensei/nav-map-position-tags"

export type TransitionCategory =
  | "pass"
  | "sweep"
  | "advance"
  | "control"
  | "submission"
  | "takedown"
  | "recovery"

export interface TacticalMap {
  readonly positionIds: ReadonlySet<string>
  readonly transitionPairs: ReadonlySet<string>
  readonly unmappedSteps: readonly string[]
}

export const EMPTY_ATTRIBUTES: BjjAttributes = {
  guard: 0,
  passing: 0,
  control: 0,
  finishing: 0,
  takedowns: 0,
  legLocks: 0,
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score))
}

function assertNever(value: never): never {
  throw new Error(`Unhandled transition category: ${String(value)}`)
}

export function getPositionAttribute(position: Position): keyof BjjAttributes {
  switch (position.layer) {
    case "standing":
      return "takedowns"
    case "guard":
      return "guard"
    case "passing":
      return "passing"
    case "control":
      return "control"
    case "submission":
      return "finishing"
    case "leglock":
      return "legLocks"
  }
}

export function getTransitionCategory(
  transition: Transition,
  positionsById: ReadonlyMap<string, Position>,
): TransitionCategory {
  switch (transition.type) {
    case "pass":
      return "pass"
    case "sweep":
      return "sweep"
    case "submission":
      return "submission"
    case "takedown":
    case "guard_pull":
      return "takedown"
    case "escape":
    case "recovery":
      return "recovery"
    case "transition": {
      const destination = positionsById.get(transition.to)
      if (destination?.layer === "control") return "control"
      return "advance"
    }
  }
}

export function getPositionScore(
  position: Position,
  attributes: BjjAttributes,
): number {
  return clampScore(attributes[getPositionAttribute(position)])
}

export function getTransitionScore(
  transition: Transition,
  attributes: BjjAttributes,
  positionsById: ReadonlyMap<string, Position>,
): number {
  const category = getTransitionCategory(transition, positionsById)
  switch (category) {
    case "pass":
      return clampScore(attributes.passing)
    case "sweep":
      return clampScore(attributes.guard)
    case "control":
      return clampScore(attributes.control)
    case "submission": {
      const source = positionsById.get(transition.from)
      const destination = positionsById.get(transition.to)
      return clampScore(
        source?.layer === "leglock" || destination?.layer === "leglock"
          ? attributes.legLocks
          : attributes.finishing,
      )
    }
    case "takedown":
      return clampScore(attributes.takedowns)
    case "recovery":
      return clampScore(attributes.guard)
    case "advance": {
      const destination = positionsById.get(transition.to)
      return destination
        ? getPositionScore(destination, attributes)
        : clampScore(attributes.control)
    }
    default:
      return assertNever(category)
  }
}

export function scoreToNodeRadius(score: number): number {
  return 13 + clampScore(score) * 0.08
}

export function scoreToEdgeWidth(score: number): number {
  return 1.1 + clampScore(score) * 0.029
}

export function buildAthleteTacticalMap(
  archetype: Archetype,
  positions: readonly Position[],
): TacticalMap {
  const availableIds = new Set(positions.map((position) => position.id))
  const positionIds = new Set<string>()
  const transitionPairs = new Set<string>()
  const unmappedSteps = new Set<string>()

  for (const step of archetype.gameplan) {
    const sourceId = tagToPositionId(step.position)
    if (availableIds.has(sourceId)) {
      positionIds.add(sourceId)
    } else {
      unmappedSteps.add(step.position)
    }

    for (const next of step.next) {
      const destinationId = tagToPositionId(next)
      if (availableIds.has(destinationId)) {
        positionIds.add(destinationId)
        if (availableIds.has(sourceId)) {
          transitionPairs.add(`${sourceId}::${destinationId}`)
        }
      } else {
        unmappedSteps.add(next)
      }
    }
  }

  return {
    positionIds,
    transitionPairs,
    unmappedSteps: [...unmappedSteps],
  }
}
