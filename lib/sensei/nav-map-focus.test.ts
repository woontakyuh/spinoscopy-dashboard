import { describe, expect, it } from "vitest"
import { TRANSITIONS } from "@/lib/sensei/skillConnections"
import type { Position, Transition } from "@/lib/types/sensei"
import {
  buildFocusGraph,
  getTransitionKey,
} from "./nav-map-focus"

const POSITIONS: Position[] = [
  { id: "a", name: "A", nameKr: "A", layer: "guard", ruleSet: "common" },
  { id: "b", name: "B", nameKr: "B", layer: "guard", ruleSet: "common" },
  { id: "c", name: "C", nameKr: "C", layer: "guard", ruleSet: "common" },
  { id: "d", name: "D", nameKr: "D", layer: "passing", ruleSet: "common" },
  { id: "e", name: "E", nameKr: "E", layer: "control", ruleSet: "common" },
]

const TRANSITION_FIXTURES: Transition[] = [
  {
    from: "a",
    to: "b",
    action: "A에서 B",
    actionEn: "A to B",
    type: "transition",
    ruleSet: "common",
  },
  {
    from: "c",
    to: "b",
    action: "C에서 B",
    actionEn: "C to B",
    type: "transition",
    ruleSet: "common",
  },
  {
    from: "b",
    to: "d",
    action: "B에서 D",
    actionEn: "B to D",
    type: "pass",
    ruleSet: "common",
  },
  {
    from: "d",
    to: "e",
    action: "D에서 E",
    actionEn: "D to E",
    type: "transition",
    ruleSet: "common",
  },
]

describe("buildFocusGraph", () => {
  it("classifies incoming and outgoing depth-one nodes without layout data", () => {
    const graph = buildFocusGraph(POSITIONS, TRANSITION_FIXTURES, "b", 1)

    expect(graph.nodes.map(({ position, depth, relation }) => ({
      id: position.id,
      depth,
      relation,
    }))).toEqual([
      { id: "a", depth: 1, relation: "incoming" },
      { id: "b", depth: 0, relation: "center" },
      { id: "c", depth: 1, relation: "incoming" },
      { id: "d", depth: 1, relation: "outgoing" },
    ])
    expect(graph.edges).toHaveLength(3)
  })

  it("adds second-degree transitions without leaking unrelated nodes", () => {
    const graph = buildFocusGraph(POSITIONS, TRANSITION_FIXTURES, "b", 2)

    expect(graph.nodes.map((node) => node.position.id)).toContain("e")
    expect(graph.edges).toHaveLength(4)
  })

  it("creates unique keys for the canonical transition set", () => {
    const keys = TRANSITIONS.map(getTransitionKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
