import type { BjjAttributes, Position, Transition } from "@/lib/types/sensei"
import { getTransitionKey, type NavMapPoint } from "@/lib/sensei/nav-map-focus"
import {
  getPositionScore,
  getTransitionCategory,
  getTransitionScore,
  scoreToEdgeWidth,
  scoreToNodeRadius,
} from "@/lib/sensei/nav-map-scoring"
import {
  buildEdgeGeometry,
  getEdgeCurvature,
  getEdgeLabelProgress,
  getEdgeLabelWidth,
  getEdgeOpacity,
} from "@/components/sensei/nav-map/nav-map-edge-geometry"
import { EDGE_COLORS, SVG_W } from "@/components/sensei/nav-map/nav-map-theme"

export interface NavMapEdgeLayerProps {
  readonly transitions: readonly Transition[]
  readonly nodePositions: Readonly<Record<string, NavMapPoint>>
  readonly positionsById: ReadonlyMap<string, Position>
  readonly activeAttributes: BjjAttributes
  readonly viewMode: "map" | "focus"
  readonly selectedNodeId: string | null
  readonly selectedTransitionKey: string | null
  readonly hoveredTransitionKey: string | null
  readonly activeNodeId: string | null
  readonly highlightIds: ReadonlySet<string> | null
  readonly focusLabelScale: number
  readonly nodeVisualScale: (positionId: string) => number
  readonly onSelectTransition: (transitionKey: string) => void
  readonly onHoverTransition: (transitionKey: string | null) => void
}

export function NavMapEdgeLayer({
  transitions,
  nodePositions,
  positionsById,
  activeAttributes,
  viewMode,
  selectedNodeId,
  selectedTransitionKey,
  hoveredTransitionKey,
  activeNodeId,
  highlightIds,
  focusLabelScale,
  nodeVisualScale,
  onSelectTransition,
  onHoverTransition,
}: NavMapEdgeLayerProps) {
  return transitions.map((transition) => {
    const from = nodePositions[transition.from]
    const to = nodePositions[transition.to]
    const sourcePosition = positionsById.get(transition.from)
    const destinationPosition = positionsById.get(transition.to)
    if (!from || !to || !sourcePosition || !destinationPosition) return null

    const transitionKey = getTransitionKey(transition)
    const isPlanHighlighted = !highlightIds || (
      highlightIds.has(transition.from) && highlightIds.has(transition.to)
    )
    const isConnected = Boolean(
      activeNodeId && (transition.from === activeNodeId || transition.to === activeNodeId),
    )
    const isSelected = transitionKey === selectedTransitionKey
    const isHovered = transitionKey === hoveredTransitionKey
    const category = getTransitionCategory(transition, positionsById)
    const color = EDGE_COLORS[category]
    const score = getTransitionScore(transition, activeAttributes, positionsById)
    const evidenceCount = transition.evidence?.count ?? 0
    const width = scoreToEdgeWidth(score, evidenceCount)
    const reverseExists = transitions.some(
      (candidate) => candidate.from === transition.to && candidate.to === transition.from,
    )
    const geometry = buildEdgeGeometry({
      from,
      to,
      fromOffset: scoreToNodeRadius(getPositionScore(sourcePosition, activeAttributes))
        * nodeVisualScale(transition.from),
      toOffset: scoreToNodeRadius(getPositionScore(destinationPosition, activeAttributes))
        * nodeVisualScale(transition.to),
      curvature: getEdgeCurvature(transition, reverseExists),
      labelProgress: getEdgeLabelProgress(transition, selectedNodeId),
    })
    const opacity = getEdgeOpacity({
      isSelected,
      isHovered,
      isConnected,
      isPlanHighlighted,
      hasSelectedTransition: Boolean(selectedTransitionKey),
      isFocusMode: viewMode === "focus",
    })
    const emphasis = isSelected || isHovered || isConnected ? "active" : "rest"

    return (
      <g
        key={transitionKey}
        role="button"
        tabIndex={0}
        aria-label={`${transition.action} 전이 보기`}
        aria-pressed={isSelected}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          onSelectTransition(transitionKey)
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          onSelectTransition(transitionKey)
        }}
        onPointerEnter={() => onHoverTransition(transitionKey)}
        onPointerLeave={() => onHoverTransition(null)}
        className="cursor-pointer outline-none focus-visible:[filter:drop-shadow(0_0_5px_var(--ring))]"
        opacity={opacity}
        data-transition-category={category}
        data-score={score}
        data-evidence-count={evidenceCount}
        data-edge-width={width}
        data-emphasis={emphasis}
      >
        <title>{transition.condition ? `${transition.action} · ${transition.condition}` : transition.action}</title>
        <path d={geometry.path} stroke="transparent" strokeWidth={16} fill="none" />
        <path
          d={geometry.path}
          stroke={color}
          strokeWidth={isSelected ? width + 1.5 : isConnected ? width + 0.8 : width}
          fill="none"
          markerEnd={`url(#arrowhead-${category})`}
          vectorEffect="non-scaling-stroke"
          className="transition-[stroke-width,opacity] duration-150"
        />
        {viewMode === "focus" && (isSelected || isHovered) && (
          <g
            transform={`translate(${geometry.labelX}, ${geometry.labelY}) scale(${focusLabelScale})`}
            style={{ pointerEvents: "none" }}
          >
            <rect
              x={-getEdgeLabelWidth(transition.action) / 2}
              y={-10}
              width={getEdgeLabelWidth(transition.action)}
              height={20}
              rx={7}
              fill="var(--card)"
              stroke={color}
              strokeOpacity={isSelected || isHovered ? 0.8 : 0.35}
            />
            <text textAnchor="middle" dy={3} fill="var(--foreground)" fontSize={9} fontWeight={600}>
              {transition.action}
            </text>
          </g>
        )}
        {isHovered && transition.condition && (
          <foreignObject
            x={Math.max(8, Math.min(SVG_W - 248, geometry.labelX - 120))}
            y={geometry.labelY + 14}
            width={240}
            height={58}
            style={{ pointerEvents: "none" }}
          >
            <div className="rounded-lg border border-border bg-popover px-2.5 py-2 text-[11px] leading-4 text-popover-foreground shadow-xl">
              <span className="font-semibold text-foreground">상황</span>
              <span className="ml-1.5">{transition.condition}</span>
            </div>
          </foreignObject>
        )}
      </g>
    )
  })
}
