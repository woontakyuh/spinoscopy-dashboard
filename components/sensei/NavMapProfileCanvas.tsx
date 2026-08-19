import type { BjjAttributes, Position, Transition } from "@/lib/types/sensei"
import type { NavMapPoint } from "@/lib/sensei/nav-map-focus"
import {
  getPositionScore,
  getTransitionCategory,
  getTransitionScore,
  scoreToEdgeWidth,
  scoreToNodeRadius,
  type TacticalMap,
  type TransitionCategory,
} from "@/lib/sensei/nav-map-scoring"
import {
  NAV_MAP_HEIGHT,
  NAV_MAP_WIDTH,
  getNavMapLayer,
} from "@/lib/sensei/nav-map-layout"
import { CountryFlag } from "@/components/sensei/character/CountryFlag"

const NODE_COLORS = {
  standing: "var(--nav-node-standing)",
  guard: "var(--nav-node-guard)",
  passing: "var(--nav-node-passing)",
  control: "var(--nav-node-control)",
  defense: "var(--nav-node-defense)",
  submission: "var(--nav-node-submission)",
  leglock: "var(--nav-node-leglock)",
} as const

const TRANSITION_COLORS: Readonly<Record<TransitionCategory, string>> = {
  pass: "var(--nav-pass)",
  sweep: "var(--nav-sweep)",
  advance: "var(--nav-advance)",
  control: "var(--nav-control)",
  submission: "var(--nav-submission)",
  takedown: "var(--nav-takedown)",
  recovery: "var(--nav-recovery)",
}

export interface NavMapGraph {
  readonly positions: readonly Position[]
  readonly transitions: readonly Transition[]
  readonly nodePositions: Readonly<Record<string, NavMapPoint>>
}

export interface NavMapProfile {
  readonly label: string
  readonly flag?: string
  readonly attributes: BjjAttributes
  readonly tacticalMap?: TacticalMap
}

interface NavMapProfileCanvasProps {
  readonly testId: string
  readonly graph: NavMapGraph
  readonly profile: NavMapProfile
}

function shortName(position: Position): string {
  if (position.id.length <= 4) return position.id.toUpperCase()
  return (position.nameKr || position.name).slice(0, 3)
}

export function NavMapProfileCanvas({
  testId,
  graph,
  profile,
}: NavMapProfileCanvasProps) {
  const positionsById = new Map(
    graph.positions.map((position) => [position.id, position]),
  )

  return (
    <section
      data-testid={testId}
      className="min-w-0 rounded-xl border border-border bg-card/60"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {profile.flag && (
            <CountryFlag flag={profile.flag} className="h-4 w-6 rounded-[2px] shadow-sm" />
          )}
          <span>{profile.label}</span>
        </h3>
        <span className="text-[10px] text-muted-foreground">
          {graph.transitions.length} transitions
        </span>
      </header>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${NAV_MAP_WIDTH} ${NAV_MAP_HEIGHT}`}
          className="min-h-[420px] w-full min-w-[720px]"
          aria-label={`${profile.label} 전술 지도`}
        >
          {graph.transitions.map((transition) => {
            const from = graph.nodePositions[transition.from]
            const to = graph.nodePositions[transition.to]
            const sourcePosition = positionsById.get(transition.from)
            const destinationPosition = positionsById.get(transition.to)
            if (!from || !to || !sourcePosition || !destinationPosition) return null

            const category = getTransitionCategory(transition, positionsById)
            const score = getTransitionScore(
              transition,
              profile.attributes,
              positionsById,
            )
            const width = scoreToEdgeWidth(score)
            const pair = `${transition.from}::${transition.to}`
            const isTactical = profile.tacticalMap?.transitionPairs.has(pair) ?? false
            const sourceRadius = scoreToNodeRadius(
              getPositionScore(sourcePosition, profile.attributes),
            )
            const destinationRadius = scoreToNodeRadius(
              getPositionScore(destinationPosition, profile.attributes),
            )
            const distance = Math.max(Math.hypot(to.x - from.x, to.y - from.y), 1)
            const unitX = (to.x - from.x) / distance
            const unitY = (to.y - from.y) / distance
            const startX = from.x + unitX * sourceRadius
            const startY = from.y + unitY * sourceRadius
            const endX = to.x - unitX * destinationRadius
            const endY = to.y - unitY * destinationRadius
            const curve = graph.transitions.some(
              (candidate) => candidate.from === transition.to && candidate.to === transition.from,
            ) ? 36 : 16
            const curveDirection = transition.from.localeCompare(transition.to) <= 0 ? 1 : -1
            const normalX = -unitY
            const normalY = unitX
            const controlX = (startX + endX) / 2 + normalX * curve * curveDirection
            const controlY = (startY + endY) / 2 + normalY * curve * curveDirection

            return (
              <path
                key={`${pair}:${transition.actionEn}`}
                d={`M${startX},${startY} Q${controlX},${controlY} ${endX},${endY}`}
                fill="none"
                stroke={TRANSITION_COLORS[category]}
                strokeWidth={width}
                strokeLinecap="round"
                strokeDasharray={isTactical ? undefined : "2 5"}
                opacity={isTactical ? 0.88 : 0.16}
                vectorEffect="non-scaling-stroke"
                data-transition-category={category}
                data-score={score}
              />
            )
          })}
          {graph.positions.map((position) => {
            const point = graph.nodePositions[position.id]
            if (!point) return null
            const score = getPositionScore(position, profile.attributes)
            const radius = scoreToNodeRadius(score)
            const isTactical = profile.tacticalMap?.positionIds.has(position.id) ?? true
            const color = NODE_COLORS[getNavMapLayer(position)]

            return (
              <g
                key={position.id}
                transform={`translate(${point.x}, ${point.y})`}
                role="button"
                tabIndex={0}
                aria-label={`${position.nameKr || position.name} 스킬 보기`}
                data-node-id={position.id}
                data-node-radius={radius}
                data-score={score}
                opacity={isTactical ? 1 : 0.38}
              >
                <circle
                  r={radius}
                  fill={color}
                  fillOpacity={0.16}
                  stroke={color}
                  strokeWidth={isTactical ? 2 : 1}
                />
                <text
                  textAnchor="middle"
                  dy={4}
                  fill={color}
                  fontSize={9}
                  fontWeight={700}
                  style={{ pointerEvents: "none" }}
                >
                  {shortName(position)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      {profile.tacticalMap && profile.tacticalMap.unmappedSteps.length > 0 && (
        <div className="border-t border-border px-3 py-2">
          <p className="text-[10px] font-semibold text-amber-300">
            매핑되지 않은 게임플랜
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {profile.tacticalMap.unmappedSteps.join(" · ")}
          </p>
        </div>
      )}
    </section>
  )
}
