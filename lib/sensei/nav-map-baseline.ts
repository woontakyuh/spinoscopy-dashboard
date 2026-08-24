import { getTransitionKey } from "@/lib/sensei/nav-map-focus"
import { POSITIONS, TRANSITIONS } from "@/lib/sensei/skillConnections"
import type { Position, Transition } from "@/lib/types/sensei"

export interface NavMapBaseline {
  readonly positions: readonly Position[]
  readonly transitions: readonly Transition[]
}

function mergeLessonNumbers(
  baseline: readonly number[] | undefined,
  stored: readonly number[] | undefined,
): number[] | undefined {
  const merged = new Set([...(baseline ?? []), ...(stored ?? [])])
  return merged.size > 0 ? [...merged].sort((left, right) => left - right) : undefined
}

export function mergeNavMapBaseline(
  storedPositions: readonly Position[],
  storedTransitions: readonly Transition[],
): NavMapBaseline {
  const positionsById = new Map(POSITIONS.map((position) => [position.id, position]))

  for (const position of storedPositions) {
    const baseline = positionsById.get(position.id)
    positionsById.set(position.id, {
      ...baseline,
      ...position,
      lessonNumbers: mergeLessonNumbers(baseline?.lessonNumbers, position.lessonNumbers),
    })
  }

  const transitionsByKey = new Map<string, Transition>(
    TRANSITIONS.map((transition) => [
      getTransitionKey(transition),
      { ...transition, source: "baseline" as const },
    ]),
  )
  for (const transition of storedTransitions) {
    const key = getTransitionKey(transition)
    transitionsByKey.set(key, {
      ...transitionsByKey.get(key),
      ...transition,
      source: "stored",
    })
  }

  return {
    positions: [...positionsById.values()],
    transitions: [...transitionsByKey.values()],
  }
}
