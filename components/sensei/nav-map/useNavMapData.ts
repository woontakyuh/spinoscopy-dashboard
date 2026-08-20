import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useSenseiData } from "@/lib/sensei/useSenseiData"
import { loadMyStrategies } from "@/lib/sensei/strategies"
import type {
  Archetype,
  BjjAttributes,
  BjjStats,
  Position,
  SenseiEntry,
  Strategy,
  Transition,
} from "@/lib/types/sensei"
import {
  buildEvidenceFinishTransitions,
  mergeEvidenceFinishTransitions,
  type ConceptEvidenceNote,
} from "@/lib/sensei/evidenceFinishConnections"
import { buildEvidencePositionTransitions } from "@/lib/sensei/evidencePositionConnections"
import { EMPTY_ATTRIBUTES } from "@/lib/sensei/nav-map-scoring"
import { mergeNavMapBaseline } from "@/lib/sensei/nav-map-baseline"
import {
  canonicalizeNavMapGraph,
  canonicalizeNavMapPositionId,
} from "@/lib/sensei/nav-map-canonicalization"
import { BUILTIN_GAME_PLANS, type NavMapGamePlan } from "@/components/sensei/nav-map/nav-map-game-plans"
import { buildPositionSkillMap } from "@/components/sensei/nav-map/nav-map-skill-tags"
import {
  buildPositionTrainingMap,
  type PositionTrainingInfo,
} from "@/components/sensei/nav-map/nav-map-training"

export interface NavMapData {
  readonly archetypes: readonly Archetype[]
  readonly positions: readonly Position[]
  readonly transitions: readonly Transition[]
  readonly gamePlans: readonly NavMapGamePlan[]
  readonly positionSkillMap: Readonly<Record<string, number>>
  readonly trainingMap: Readonly<Record<string, PositionTrainingInfo>>
  readonly selfAttributes: BjjAttributes
}

export function useNavMapData(): NavMapData {
  const { archetypes, positions, transitions: storedTransitions } = useSenseiData()
  const canonicalGraph = useMemo(
    () => {
      const baseline = mergeNavMapBaseline(positions, storedTransitions)
      return canonicalizeNavMapGraph(baseline.positions, baseline.transitions)
    },
    [positions, storedTransitions],
  )
  const { data: trainingEntries } = useQuery<SenseiEntry[]>({
    queryKey: ["sensei-entries-navmap"],
    queryFn: async () => {
      const response = await fetch("/api/notion/sensei")
      if (!response.ok) throw new Error("training log fetch failed")
      return response.json()
    },
    staleTime: 5 * 60 * 1000,
  })
  const { data: conceptNotes } = useQuery<ConceptEvidenceNote[]>({
    queryKey: ["sensei-concept-evidence"],
    queryFn: async () => {
      const response = await fetch("/api/notion/concept-notes")
      if (!response.ok) throw new Error("concept evidence fetch failed")
      return response.json()
    },
    staleTime: 5 * 60 * 1000,
  })
  const { data: statsData } = useQuery<{
    stats: BjjStats
    tagFrequencies: Record<string, number>
  }>({
    queryKey: ["sensei-stats"],
    queryFn: async () => {
      const response = await fetch("/api/notion/sensei/stats")
      if (!response.ok) throw new Error("스탯 조회 실패")
      return response.json()
    },
    staleTime: 5 * 60 * 1000,
  })
  const [myStrategies, setMyStrategies] = useState<Strategy[]>([])

  useEffect(() => {
    setMyStrategies(loadMyStrategies())
  }, [])

  const transitions = useMemo(() => {
    const finishTransitions = buildEvidenceFinishTransitions(
      trainingEntries ?? [],
      conceptNotes ?? [],
      canonicalGraph.positions,
    )
    const positionTransitions = buildEvidencePositionTransitions(
      trainingEntries ?? [],
      canonicalGraph.positions,
    )
    return mergeEvidenceFinishTransitions(
      canonicalGraph.transitions,
      [...finishTransitions, ...positionTransitions],
    )
  }, [canonicalGraph, conceptNotes, trainingEntries])
  const gamePlans = useMemo<readonly NavMapGamePlan[]>(() => {
    const customPlans = myStrategies.map((strategy) => ({
      id: `strat-${strategy.id}`,
      label: strategy.name,
      positionIds: strategy.flow.map((step) => canonicalizeNavMapPositionId(step.positionId)),
      isStrategy: true as const,
    }))
    return [
      ...BUILTIN_GAME_PLANS.map((plan) => ({ ...plan, isStrategy: false as const })),
      ...customPlans,
    ]
  }, [myStrategies])
  const positionSkillMap = useMemo(
    () => buildPositionSkillMap(statsData?.tagFrequencies ?? {}),
    [statsData?.tagFrequencies],
  )
  const trainingMap = useMemo(
    () => buildPositionTrainingMap(trainingEntries ?? [], canonicalGraph.positions),
    [canonicalGraph.positions, trainingEntries],
  )

  return {
    archetypes,
    positions: canonicalGraph.positions,
    transitions,
    gamePlans,
    positionSkillMap,
    trainingMap,
    selfAttributes: statsData?.stats?.combined?.attributes ?? EMPTY_ATTRIBUTES,
  }
}
