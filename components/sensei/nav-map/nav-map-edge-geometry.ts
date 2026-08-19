import type { NavMapPoint } from "@/lib/sensei/nav-map-focus"
import type { Transition } from "@/lib/types/sensei"

export interface EdgeGeometryInput {
  readonly from: NavMapPoint
  readonly to: NavMapPoint
  /** Node radius × visual scale at the source, used to clear the node circle. */
  readonly fromOffset: number
  readonly toOffset: number
  readonly curvature: number
  readonly labelProgress: number
}

export interface EdgeGeometry {
  readonly path: string
  readonly labelX: number
  readonly labelY: number
}

export function buildEdgeGeometry({
  from,
  to,
  fromOffset,
  toOffset,
  curvature,
  labelProgress,
}: EdgeGeometryInput): EdgeGeometry {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.max(Math.hypot(dx, dy), 1)
  const unitX = dx / distance
  const unitY = dy / distance
  const start = {
    x: from.x + unitX * fromOffset,
    y: from.y + unitY * fromOffset,
  }
  const end = {
    x: to.x - unitX * toOffset,
    y: to.y - unitY * toOffset,
  }
  const normalX = -unitY
  const normalY = unitX
  const cx = ((start.x + end.x) / 2) + normalX * curvature
  const cy = ((start.y + end.y) / 2) + normalY * curvature
  const inverseLabelProgress = 1 - labelProgress
  const labelX = (inverseLabelProgress ** 2 * start.x)
    + (2 * inverseLabelProgress * labelProgress * cx)
    + (labelProgress ** 2 * end.x)
  const labelY = (inverseLabelProgress ** 2 * start.y)
    + (2 * inverseLabelProgress * labelProgress * cy)
    + (labelProgress ** 2 * end.y)

  return {
    path: `M${start.x},${start.y} Q${cx},${cy} ${end.x},${end.y}`,
    labelX,
    labelY,
  }
}

export function getEdgeCurvature(
  transition: Transition,
  reverseExists: boolean,
): number {
  const curveDirection = transition.from.localeCompare(transition.to) <= 0 ? 1 : -1
  return reverseExists ? 42 * curveDirection : 18
}

export function getEdgeLabelProgress(
  transition: Transition,
  selectedNodeId: string | null,
): number {
  if (transition.from === selectedNodeId) return 0.66
  if (transition.to === selectedNodeId) return 0.34
  return 0.5
}

export interface EdgeEmphasisInput {
  readonly isSelected: boolean
  readonly isHovered: boolean
  readonly isConnected: boolean
  readonly isPlanHighlighted: boolean
  readonly hasSelectedTransition: boolean
  readonly isFocusMode: boolean
}

export function getEdgeOpacity(emphasis: EdgeEmphasisInput): number {
  if (emphasis.isSelected || emphasis.isHovered) return 1
  if (emphasis.hasSelectedTransition) return 0.12
  if (emphasis.isConnected) return 0.9
  if (!emphasis.isPlanHighlighted) return 0.08
  return emphasis.isFocusMode ? 0.34 : 0.16
}

export function getEdgeLabelWidth(action: string): number {
  return Math.max(54, Array.from(action).length * 9 + 18)
}
