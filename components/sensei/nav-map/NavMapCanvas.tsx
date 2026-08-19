import type { PointerEventHandler, RefObject } from "react"
import type { Archetype, BjjAttributes, Position, Transition } from "@/lib/types/sensei"
import type { NavMapViewBox } from "@/lib/sensei/nav-map-presets"
import type { TacticalMap } from "@/lib/sensei/nav-map-scoring"
import { NavMapProfileCanvas, type NavMapGraph } from "@/components/sensei/NavMapProfileCanvas"
import {
  NavMapEdgeLayer,
  type NavMapEdgeLayerProps,
} from "@/components/sensei/nav-map/NavMapEdgeLayer"
import {
  NavMapNodeLayer,
  type NavMapNodeLayerProps,
} from "@/components/sensei/nav-map/NavMapNodeLayer"
import {
  NavMapNodeInspector,
  type NavMapNodeInspectorProps,
} from "@/components/sensei/nav-map/NavMapNodeInspector"
import { NavMapTransitionDetail } from "@/components/sensei/nav-map/NavMapTransitionDetail"
import { EDGE_COLORS, SVG_H, SVG_W } from "@/components/sensei/nav-map/nav-map-theme"

interface NavMapComparison {
  readonly isComparing: boolean
  readonly graph: NavMapGraph
  readonly selfAttributes: BjjAttributes
  readonly selectedAthlete: Archetype | null
  readonly athleteTacticalMap: TacticalMap | null
}

interface NavMapViewport {
  readonly svgRef: RefObject<SVGSVGElement | null>
  readonly viewBox: NavMapViewBox
  readonly zoomLevel: number
  readonly isPanning: boolean
  readonly viewMode: "map" | "focus"
  readonly onPointerDown: PointerEventHandler<SVGSVGElement>
  readonly onPointerMove: PointerEventHandler<SVGSVGElement>
  readonly onPointerUp: PointerEventHandler<SVGSVGElement>
}

interface NavMapTransitionOverlay {
  readonly transition: Transition | undefined
  readonly fromPosition: Position | null | undefined
  readonly toPosition: Position | null | undefined
  readonly onClose: () => void
}

interface NavMapCanvasProps {
  readonly comparison: NavMapComparison
  readonly viewport: NavMapViewport
  readonly edges: NavMapEdgeLayerProps
  readonly nodes: NavMapNodeLayerProps
  readonly transitionOverlay: NavMapTransitionOverlay
  readonly nodeInspector: NavMapNodeInspectorProps | null
}

export function NavMapCanvas({
  comparison,
  viewport,
  edges,
  nodes,
  transitionOverlay,
  nodeInspector,
}: NavMapCanvasProps) {
  return (
    <>
      {comparison.isComparing && comparison.selectedAthlete && comparison.athleteTacticalMap && (
        <div className="grid gap-4 xl:grid-cols-2">
          <NavMapProfileCanvas
            testId="navmap-pane-self"
            graph={comparison.graph}
            profile={{ label: "나", attributes: comparison.selfAttributes }}
          />
          <NavMapProfileCanvas
            testId="navmap-pane-athlete"
            graph={comparison.graph}
            profile={{
              label: comparison.selectedAthlete.name,
              flag: comparison.selectedAthlete.flag,
              attributes: comparison.selectedAthlete.stats,
              tacticalMap: comparison.athleteTacticalMap,
            }}
          />
        </div>
      )}

      <div className={`${comparison.isComparing ? "hidden" : "flex"} w-full flex-col items-stretch gap-4 lg:flex-row lg:items-start`}>
        <div className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden rounded-xl border border-border bg-card/60 p-1.5">
          <span className="pointer-events-none sticky left-2 top-2 z-10 ml-2 inline-block rounded-md border border-border bg-card/90 px-2 py-1 text-[10px] text-muted-foreground sm:hidden">
            좌우로 밀어 전체 지도 보기
          </span>
          <svg
            ref={viewport.svgRef}
            data-testid="sensei-navmap-canvas"
            viewBox={`${viewport.viewBox.x} ${viewport.viewBox.y} ${viewport.viewBox.w} ${viewport.viewBox.h}`}
            className="min-h-[420px] w-full min-w-[820px] touch-none sm:min-h-[520px] sm:min-w-0"
            style={{ cursor: viewport.isPanning ? "grabbing" : "grab" }}
            onPointerDown={viewport.onPointerDown}
            onPointerMove={viewport.onPointerMove}
            onPointerUp={viewport.onPointerUp}
          >
            <defs>
              {Object.entries(EDGE_COLORS).map(([type, color]) => {
                const markerScale = 1 / viewport.zoomLevel
                return (
                  <marker
                    key={type}
                    id={`arrowhead-${type}`}
                    markerWidth={9 * markerScale}
                    markerHeight={7 * markerScale}
                    refX={8 * markerScale}
                    refY={3.5 * markerScale}
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <polygon
                      points={`0 0, ${9 * markerScale} ${3.5 * markerScale}, 0 ${7 * markerScale}`}
                      fill={color}
                    />
                  </marker>
                )
              })}
            </defs>

            {viewport.viewMode === "focus" && (
              <text x={SVG_W - 18} y={SVG_H - 18} textAnchor="end" fill="var(--muted-foreground)" fontSize={9} opacity={0.32}>
                원래 지도 좌표 유지
              </text>
            )}

            <NavMapEdgeLayer {...edges} />
            <NavMapNodeLayer {...nodes} />
          </svg>

          {transitionOverlay.transition && (
            <NavMapTransitionDetail
              transition={transitionOverlay.transition}
              fromPosition={transitionOverlay.fromPosition ?? null}
              toPosition={transitionOverlay.toPosition ?? null}
              onClose={transitionOverlay.onClose}
            />
          )}
        </div>

        {nodeInspector ? <NavMapNodeInspector {...nodeInspector} /> : (
          <div aria-hidden="true" className="hidden w-72 shrink-0 lg:block" />
        )}
      </div>
    </>
  )
}
