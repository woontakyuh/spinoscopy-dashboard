import type { Position, Transition } from "@/lib/types/sensei"

export type FocusDepth = 1 | 2
export type FocusRelation = "center" | "incoming" | "outgoing" | "bidirectional"

export interface NavMapPoint {
  readonly x: number
  readonly y: number
}

export interface FocusGraphNode {
  readonly position: Position
  readonly depth: 0 | FocusDepth
  readonly relation: FocusRelation
}

export interface FocusGraphEdge {
  readonly key: string
  readonly transition: Transition
}

export interface FocusGraph {
  readonly nodes: readonly FocusGraphNode[]
  readonly edges: readonly FocusGraphEdge[]
}

export function getTransitionKey(transition: Transition): string {
  return [
    transition.from,
    transition.to,
    transition.type,
    transition.ruleSet,
    transition.actionEn || transition.action,
    transition.lessonNumber ?? "none",
  ].join("::")
}

function getDirectedDistances(
  focusId: string,
  transitions: readonly Transition[],
  direction: "incoming" | "outgoing",
  maxDepth: FocusDepth,
): Map<string, FocusDepth> {
  const distances = new Map<string, FocusDepth>()
  let frontier = new Set([focusId])

  for (let depth = 1 as FocusDepth; depth <= maxDepth; depth += 1) {
    const next = new Set<string>()
    for (const transition of transitions) {
      const source = direction === "outgoing" ? transition.from : transition.to
      const target = direction === "outgoing" ? transition.to : transition.from
      if (!frontier.has(source) || target === focusId || distances.has(target)) continue
      distances.set(target, depth)
      next.add(target)
    }
    frontier = next
  }

  return distances
}

function relationFor(
  positionId: string,
  incoming: ReadonlyMap<string, FocusDepth>,
  outgoing: ReadonlyMap<string, FocusDepth>,
): Exclude<FocusRelation, "center"> | null {
  const incomingDepth = incoming.get(positionId)
  const outgoingDepth = outgoing.get(positionId)
  if (incomingDepth === undefined) return outgoingDepth === undefined ? null : "outgoing"
  if (outgoingDepth === undefined) return "incoming"
  if (incomingDepth < outgoingDepth) return "incoming"
  if (outgoingDepth < incomingDepth) return "outgoing"
  return "bidirectional"
}

export function buildFocusGraph(
  positions: readonly Position[],
  transitions: readonly Transition[],
  focusId: string,
  maxDepth: FocusDepth,
): FocusGraph {
  const positionIds = new Set(positions.map((position) => position.id))
  const eligibleTransitions = transitions.filter(
    (transition) => positionIds.has(transition.from) && positionIds.has(transition.to),
  )
  const incoming = getDirectedDistances(focusId, eligibleTransitions, "incoming", maxDepth)
  const outgoing = getDirectedDistances(focusId, eligibleTransitions, "outgoing", maxDepth)

  const nodes = positions.flatMap<FocusGraphNode>((position) => {
    if (position.id === focusId) {
      return [{ position, depth: 0, relation: "center" }]
    }
    const relation = relationFor(position.id, incoming, outgoing)
    if (!relation) return []
    const depth = Math.min(
      incoming.get(position.id) ?? Number.POSITIVE_INFINITY,
      outgoing.get(position.id) ?? Number.POSITIVE_INFINITY,
    ) as FocusDepth
    return [{ position, depth, relation }]
  })

  const visibleIds = new Set(nodes.map((node) => node.position.id))
  const edges = eligibleTransitions
    .filter((transition) => visibleIds.has(transition.from) && visibleIds.has(transition.to))
    .map((transition) => ({ key: getTransitionKey(transition), transition }))

  return { nodes, edges }
}
