import type { PointerEvent } from "react"
import type { BjjAttributes, Position, Transition } from "@/lib/types/sensei"
import type { FocusGraph, NavMapPoint } from "@/lib/sensei/nav-map-focus"
import { getNavMapLayer } from "@/lib/sensei/nav-map-layout"
import { getPositionScore, scoreToNodeRadius } from "@/lib/sensei/nav-map-scoring"
import {
  abbr,
  getSkillLevel,
  LAYER_COLORS,
  SKILL_LEVEL_COLORS,
} from "@/components/sensei/nav-map/nav-map-theme"
import type { NavMapColorMode } from "@/components/sensei/nav-map/NavMapMapControls"

export interface NavMapNodeLayerProps {
  readonly positions: readonly Position[]
  readonly nodePositions: Readonly<Record<string, NavMapPoint>>
  readonly focusGraph: FocusGraph | null
  readonly selectedTransition: Transition | undefined
  readonly viewMode: "map" | "focus"
  readonly selectedNodeId: string | null
  readonly hoveredNodeId: string | null
  readonly highlightIds: ReadonlySet<string> | null
  readonly positionSkillMap: Readonly<Record<string, number>>
  readonly activeAttributes: BjjAttributes
  readonly pinnedPositions: Readonly<Record<string, NavMapPoint>>
  readonly colorMode: NavMapColorMode
  readonly compactFocus: boolean
  readonly compactMap: boolean
  readonly nodeVisualScale: (positionId: string) => number
  readonly onNodePointerDown: (
    event: PointerEvent<SVGGElement>,
    positionId: string,
    point: NavMapPoint,
  ) => void
  readonly onSelectNode: (positionId: string) => void
  readonly onHoverNode: (positionId: string | null) => void
}

export function NavMapNodeLayer({
  positions,
  nodePositions,
  focusGraph,
  selectedTransition,
  viewMode,
  selectedNodeId,
  hoveredNodeId,
  highlightIds,
  positionSkillMap,
  activeAttributes,
  pinnedPositions,
  colorMode,
  compactFocus,
  compactMap,
  nodeVisualScale,
  onNodePointerDown,
  onSelectNode,
  onHoverNode,
}: NavMapNodeLayerProps) {
  return positions.map((position) => {
    const point = nodePositions[position.id]
    if (!point) return null

    const focusNode = focusGraph?.nodes.find((node) => node.position.id === position.id)
    const isTransitionEndpoint = !selectedTransition
      || selectedTransition.from === position.id
      || selectedTransition.to === position.id
    const isHighlighted = viewMode === "focus"
      ? isTransitionEndpoint
      : !highlightIds || highlightIds.has(position.id)
    const isSelected = position.id === selectedNodeId
    const isHovered = position.id === hoveredNodeId
    const isActive = isSelected || isHovered
    const skillCount = positionSkillMap[position.id] ?? 0
    const { level: skillLevel } = getSkillLevel(skillCount)
    const layerColor = LAYER_COLORS[getNavMapLayer(position)]
    const color = colorMode === "skill" ? SKILL_LEVEL_COLORS[skillLevel] : layerColor
    const skillOpacityScale = colorMode === "skill"
      ? skillLevel === 0 ? 0.15 : 0.3 + skillLevel * 0.14
      : 1
    const focusDepthOpacity = focusNode?.depth === 2 ? 0.62 : 1
    const opacity = isHighlighted ? skillOpacityScale * focusDepthOpacity : 0.1
    const score = getPositionScore(position, activeAttributes)
    const baseRadius = scoreToNodeRadius(score)
    const radius = isActive ? baseRadius + 4 : baseRadius
    const hasSkillGlow = colorMode === "skill" && skillLevel >= 4
    const isPinned = Boolean(pinnedPositions[position.id])
    const visualScale = nodeVisualScale(position.id)

    return (
      <g
        key={position.id}
        transform={`translate(${point.x}, ${point.y}) scale(${visualScale})`}
        role="button"
        tabIndex={0}
        aria-label={`${position.nameKr || position.name} 스킬 보기`}
        aria-pressed={isSelected}
        data-pinned={isPinned ? "true" : undefined}
        data-node-radius={baseRadius}
        data-score={score}
        onPointerDown={(event) => onNodePointerDown(event, position.id, point)}
        onClick={(event) => {
          event.stopPropagation()
          onSelectNode(position.id)
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          onSelectNode(position.id)
        }}
        onPointerEnter={() => onHoverNode(position.id)}
        onPointerLeave={() => onHoverNode(null)}
        onFocus={() => onHoverNode(position.id)}
        onBlur={() => onHoverNode(null)}
        className="cursor-grab outline-none active:cursor-grabbing focus-visible:[filter:drop-shadow(0_0_6px_var(--ring))]"
        opacity={opacity}
      >
        {hasSkillGlow && (
          <circle r={radius + 10} fill={color} fillOpacity={skillLevel === 5 ? 0.15 : 0.08} />
        )}
        {isActive && <circle r={radius + 6} fill={color} fillOpacity={0.12} />}
        <circle
          r={radius}
          fill={color}
          fillOpacity={isActive ? 0.25 : (colorMode === "skill" && skillLevel === 0 ? 0.05 : 0.12)}
          stroke={color}
          strokeWidth={isActive ? 2.5 : (hasSkillGlow ? 2 : 1.5)}
        />
        <text
          textAnchor="middle"
          dy={4}
          fill={color}
          fontSize={compactFocus ? 12 : compactMap ? 10 : 8}
          fontWeight={700}
          style={{ pointerEvents: "none" }}
        >
          {abbr(position)}
        </text>
        {!compactFocus && (
          <text
            textAnchor="middle"
            dy={radius + 12}
            fill="var(--foreground)"
            fontSize={compactMap ? 9 : 8}
            opacity={isActive ? 0.9 : (colorMode === "skill" && skillLevel === 0 ? 0.2 : 0.5)}
            fontWeight={isActive ? 600 : 400}
            style={{ pointerEvents: "none" }}
          >
            {position.nameKr || position.name}
          </text>
        )}
      </g>
    )
  })
}
