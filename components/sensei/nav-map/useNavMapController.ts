import { useCallback, useMemo, useState } from "react"
import { buildFocusGraph, getTransitionKey, type FocusDepth } from "@/lib/sensei/nav-map-focus"
import { buildNavMapLayout } from "@/lib/sensei/nav-map-layout"
import { buildAthleteTacticalMap } from "@/lib/sensei/nav-map-scoring"
import type { NavMapColorMode, NavMapRuleSet } from "@/components/sensei/nav-map/NavMapMapControls"
import type { NavMapMode } from "@/components/sensei/nav-map/NavMapToolbar"
import type { NavMapData } from "@/components/sensei/nav-map/useNavMapData"
import type { NavMapLayoutInteractions } from "@/components/sensei/nav-map/useNavMapLayoutInteractions"

interface UseNavMapControllerOptions {
  readonly data: NavMapData
  readonly layout: NavMapLayoutInteractions
}

export function useNavMapController({
  data,
  layout,
}: UseNavMapControllerOptions) {
  const [selectedPlan, setSelectedPlan] = useState("all")
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedTransitionKey, setSelectedTransitionKey] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [hoveredTransitionKey, setHoveredTransitionKey] = useState<string | null>(null)
  const [ruleSetFilter, setRuleSetFilter] = useState<NavMapRuleSet>("all")
  const [colorMode, setColorMode] = useState<NavMapColorMode>("layer")
  const [viewMode, setViewMode] = useState<NavMapMode>("map")
  const [focusDepth, setFocusDepth] = useState<FocusDepth>(1)
  const [selectedAthleteName, setSelectedAthleteName] = useState("")
  const [isComparing, setIsComparing] = useState(false)

  const filteredPositions = useMemo(() => {
    if (ruleSetFilter === "all") return data.positions
    return data.positions.filter(
      (position) => position.ruleSet === "common" || position.ruleSet === ruleSetFilter,
    )
  }, [data.positions, ruleSetFilter])
  const filteredTransitions = useMemo(() => {
    if (ruleSetFilter === "all") return data.transitions
    return data.transitions.filter(
      (transition) => transition.ruleSet === "common" || transition.ruleSet === ruleSetFilter,
    )
  }, [data.transitions, ruleSetFilter])
  const activePlan = data.gamePlans.find((plan) => plan.id === selectedPlan)
  const highlightIds = useMemo(() => {
    if (!activePlan || activePlan.id === "all") return null
    return new Set(activePlan.positionIds)
  }, [activePlan])
  const mapNodePositions = useMemo(
    () => buildNavMapLayout(filteredPositions),
    [filteredPositions],
  )
  const focusGraph = useMemo(
    () => selectedNodeId
      ? buildFocusGraph(filteredPositions, filteredTransitions, selectedNodeId, focusDepth)
      : null,
    [filteredPositions, filteredTransitions, focusDepth, selectedNodeId],
  )
  const displayedPositions = useMemo(
    () => viewMode === "focus" && focusGraph
      ? focusGraph.nodes.map((node) => node.position)
      : filteredPositions,
    [filteredPositions, focusGraph, viewMode],
  )
  const nodePositions = useMemo(
    () => ({ ...mapNodePositions, ...layout.pinnedPositions }),
    [layout.pinnedPositions, mapNodePositions],
  )
  const positionsById = useMemo(
    () => new Map(filteredPositions.map((position) => [position.id, position])),
    [filteredPositions],
  )
  const selectedAthlete = useMemo(
    () => data.archetypes.find((athlete) => athlete.name === selectedAthleteName) ?? null,
    [data.archetypes, selectedAthleteName],
  )
  const athleteTacticalMap = useMemo(
    () => selectedAthlete ? buildAthleteTacticalMap(selectedAthlete, filteredPositions) : null,
    [filteredPositions, selectedAthlete],
  )
  const activeAttributes = selectedAthlete && !isComparing
    ? selectedAthlete.stats
    : data.selfAttributes
  const comparisonGraph = useMemo(
    () => ({
      positions: filteredPositions,
      transitions: filteredTransitions,
      nodePositions,
    }),
    [filteredPositions, filteredTransitions, nodePositions],
  )
  const visibleTransitions = useMemo(() => {
    if (viewMode === "focus" && focusGraph) {
      return focusGraph.edges.map((edge) => edge.transition)
    }
    const nodeIds = new Set(Object.keys(nodePositions))
    return filteredTransitions.filter(
      (transition) => nodeIds.has(transition.from) && nodeIds.has(transition.to),
    )
  }, [filteredTransitions, focusGraph, nodePositions, viewMode])
  const selectedNode = filteredPositions.find((position) => position.id === selectedNodeId)
  const selectedTransition = visibleTransitions.find(
    (transition) => getTransitionKey(transition) === selectedTransitionKey,
  )
  const selectedTransitionFrom = selectedTransition
    ? filteredPositions.find((position) => position.id === selectedTransition.from)
    : null
  const selectedTransitionTo = selectedTransition
    ? filteredPositions.find((position) => position.id === selectedTransition.to)
    : null
  const outgoing = useMemo(
    () => selectedNodeId
      ? visibleTransitions.filter((transition) => transition.from === selectedNodeId)
      : [],
    [selectedNodeId, visibleTransitions],
  )
  const incoming = useMemo(
    () => selectedNodeId
      ? visibleTransitions.filter((transition) => transition.to === selectedNodeId)
      : [],
    [selectedNodeId, visibleTransitions],
  )
  const clearSelection = useCallback(() => {
    setSelectedNodeId(null)
    setSelectedTransitionKey(null)
    setViewMode("map")
  }, [])
  const selectNode = useCallback((positionId: string) => {
    if (layout.consumeSuppressedNodeClick()) return
    if (positionId === selectedNodeId) {
      if (selectedTransitionKey) {
        setSelectedTransitionKey(null)
        return
      }
      clearSelection()
      return
    }
    setSelectedNodeId(positionId)
    setSelectedTransitionKey(null)
    setViewMode("focus")
  }, [clearSelection, layout, selectedNodeId, selectedTransitionKey])
  const selectGamePlan = useCallback((planId: string) => {
    setSelectedPlan(planId)
    setSelectedNodeId(null)
    setSelectedTransitionKey(null)
    setViewMode("map")
  }, [])
  const selectAthlete = useCallback((athleteName: string) => {
    setSelectedAthleteName(athleteName)
    if (!athleteName) setIsComparing(false)
  }, [])
  const nodeVisualScale = useCallback((positionId: string) => {
    if (viewMode !== "focus") return 1
    if (layout.isCompact) return positionId === selectedNodeId ? 2.5 : 1.75
    return positionId === selectedNodeId ? 1.8 : 1.45
  }, [layout.isCompact, selectedNodeId, viewMode])
  const compactFocus = viewMode === "focus" && layout.isCompact

  return {
    selectedPlan,
    selectedNodeId,
    selectedTransitionKey,
    hoveredNodeId,
    hoveredTransitionKey,
    ruleSetFilter,
    colorMode,
    viewMode,
    focusDepth,
    selectedAthleteName,
    isComparing,
    filteredPositions,
    filteredTransitions,
    highlightIds,
    focusGraph,
    displayedPositions,
    nodePositions,
    positionsById,
    selectedAthlete,
    athleteTacticalMap,
    activeAttributes,
    comparisonGraph,
    visibleTransitions,
    activeNodeId: selectedNodeId ?? hoveredNodeId,
    selectedNode,
    selectedTransition,
    selectedTransitionFrom,
    selectedTransitionTo,
    outgoing,
    incoming,
    compactFocus,
    compactMap: viewMode === "map" && layout.isCompact,
    focusLabelScale: compactFocus ? 1.75 : 1,
    nodeVisualScale,
    setViewMode,
    setFocusDepth,
    setSelectedTransitionKey,
    setHoveredNodeId,
    setHoveredTransitionKey,
    setRuleSetFilter,
    setColorMode,
    clearSelection,
    selectNode,
    selectGamePlan,
    selectAthlete,
    toggleComparing: () => setIsComparing((current) => !current),
  }
}
