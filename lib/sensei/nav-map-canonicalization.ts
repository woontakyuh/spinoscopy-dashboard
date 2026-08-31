import type { Position, Transition } from "@/lib/types/sensei"

const POSITION_ID_ALIASES: Readonly<Record<string, string>> = {
  side_bottom: "side_top",
  kob_bottom: "kob_top",
  mount_bottom: "mount_top",
  back_bottom: "back_top",
  turtle_bottom: "turtle_top",
}

const CANONICAL_CONTROL_LABELS: Readonly<
  Record<string, Readonly<{ name: string; nameKr: string }>>
> = {
  side_top: { name: "Side Control", nameKr: "사이드 컨트롤" },
  kob_top: { name: "Knee on Belly", nameKr: "니온벨리" },
  mount_top: { name: "Mount", nameKr: "마운트" },
  back_top: { name: "Back Control", nameKr: "백 컨트롤" },
  turtle_top: { name: "Turtle", nameKr: "터틀" },
}

export interface CanonicalNavMapGraph {
  readonly positions: readonly Position[]
  readonly transitions: readonly Transition[]
}

export function canonicalizeNavMapPositionId(positionId: string): string {
  return POSITION_ID_ALIASES[positionId] ?? positionId
}

function mergeLessonNumbers(
  current: readonly number[] | undefined,
  incoming: readonly number[] | undefined,
): number[] | undefined {
  const merged = new Set([...(current ?? []), ...(incoming ?? [])])
  return merged.size > 0 ? [...merged].sort((left, right) => left - right) : undefined
}

export function canonicalizeNavMapGraph(
  positions: readonly Position[],
  transitions: readonly Transition[],
): CanonicalNavMapGraph {
  const positionsById = new Map<string, Position>()

  for (const position of positions) {
    const canonicalId = canonicalizeNavMapPositionId(position.id)
    const existing = positionsById.get(canonicalId)
    const labels = CANONICAL_CONTROL_LABELS[canonicalId]
    const prefersCanonicalSource = position.id === canonicalId
    const source = prefersCanonicalSource || !existing ? position : existing

    positionsById.set(canonicalId, {
      ...source,
      id: canonicalId,
      name: labels?.name ?? source.name,
      nameKr: labels?.nameKr ?? source.nameKr,
      perspective: labels ? "neutral" : source.perspective,
      lessonNumbers: mergeLessonNumbers(existing?.lessonNumbers, position.lessonNumbers),
    })
  }

  return {
    positions: [...positionsById.values()],
    transitions: transitions.map((transition) => ({
      ...transition,
      from: canonicalizeNavMapPositionId(transition.from),
      to: canonicalizeNavMapPositionId(transition.to),
    })),
  }
}
