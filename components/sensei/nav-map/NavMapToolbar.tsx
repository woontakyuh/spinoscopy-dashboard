import type { Archetype } from "@/lib/types/sensei"
import type { FocusDepth } from "@/lib/sensei/nav-map-focus"
import { DEFAULT_LAYOUT_NAME, type NavMapLayoutPreset } from "@/lib/sensei/nav-map-presets"
import type { NavMapGamePlan } from "@/components/sensei/nav-map/nav-map-game-plans"
import { NavMapMapControls, type NavMapColorMode, type NavMapRuleSet } from "@/components/sensei/nav-map/NavMapMapControls"
import { NavMapAthleteControls } from "@/components/sensei/nav-map/NavMapAthleteControls"

export type { NavMapColorMode, NavMapRuleSet } from "@/components/sensei/nav-map/NavMapMapControls"

export type NavMapMode = "map" | "focus"

interface ViewControls {
  readonly mode: NavMapMode
  readonly selectedNodeId: string | null
  readonly focusDepth: FocusDepth
  readonly onModeChange: (mode: NavMapMode) => void
  readonly onFocusDepthChange: (depth: FocusDepth) => void
}

interface GamePlanControls {
  readonly plans: readonly NavMapGamePlan[]
  readonly selectedPlan: string
  readonly onPlanChange: (planId: string) => void
}

export interface AthleteControls {
  readonly archetypes: readonly Archetype[]
  readonly selectedAthleteName: string
  readonly isComparing: boolean
  readonly hasSelectedAthlete: boolean
  readonly onAthleteChange: (athleteName: string) => void
  readonly onComparingChange: () => void
}

interface LayoutControls {
  readonly presets: readonly NavMapLayoutPreset[]
  readonly activeName: string
  readonly name: string
  readonly isDirty: boolean
  readonly onPresetChange: (name: string) => void
  readonly onNameChange: (name: string) => void
  readonly onSave: () => void
}

interface MapControls {
  readonly colorMode: NavMapColorMode
  readonly ruleSetFilter: NavMapRuleSet
  readonly zoomLevel: number
  readonly minZoom: number
  readonly maxZoom: number
  readonly onColorModeChange: (mode: NavMapColorMode) => void
  readonly onRuleSetFilterChange: (ruleSet: NavMapRuleSet) => void
  readonly onZoomChange: (zoom: number) => void
  readonly onResetZoom: () => void
  readonly onResetLayout: () => void
}

interface NavMapToolbarProps {
  readonly view: ViewControls
  readonly gamePlan: GamePlanControls
  readonly athlete: AthleteControls
  readonly layout: LayoutControls
  readonly map: MapControls
}

export function NavMapToolbar({
  view,
  gamePlan,
  athlete,
  layout,
  map,
}: NavMapToolbarProps) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/60 p-3">
      <div className="flex items-end justify-between gap-2 border-b border-border pb-3">
        <div className="space-y-1">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            그래프 보기
          </span>
          <div
            className="inline-flex overflow-hidden rounded-lg border border-border"
            role="group"
            aria-label="그래프 보기 모드"
          >
            <button
              type="button"
              aria-label="Map 모드"
              aria-pressed={view.mode === "map"}
              onClick={() => view.onModeChange("map")}
              className={`min-h-9 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                view.mode === "map"
                  ? "bg-orange-500/15 text-orange-300"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Map
            </button>
            <button
              type="button"
              aria-label="Focus 모드"
              aria-pressed={view.mode === "focus"}
              disabled={!view.selectedNodeId}
              onClick={() => view.onModeChange("focus")}
              className={`min-h-9 border-l border-border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 ${
                view.mode === "focus"
                  ? "bg-orange-500/15 text-orange-300"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Focus
            </button>
          </div>
        </div>

        {view.mode === "focus" && (
          <div className="space-y-1">
            <span className="block text-[10px] font-medium text-muted-foreground">
              연결 깊이
            </span>
            <div
              className="inline-flex overflow-hidden rounded-lg border border-border"
              role="group"
              aria-label="Focus 연결 깊이"
            >
              {([1, 2] as const).map((depth) => (
                <button
                  key={depth}
                  type="button"
                  aria-label={`Focus depth ${depth}`}
                  aria-pressed={view.focusDepth === depth}
                  onClick={() => view.onFocusDepthChange(depth)}
                  className={`min-h-8 min-w-10 border-l border-border px-3 text-[11px] first:border-l-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                    view.focusDepth === depth
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {depth}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          게임 플랜
        </span>
        <div className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-1">
          {gamePlan.plans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              aria-pressed={gamePlan.selectedPlan === plan.id}
              onClick={() => gamePlan.onPlanChange(plan.id)}
              className={`min-h-9 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-[background-color,color,transform] duration-150 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                gamePlan.selectedPlan === plan.id
                  ? plan.isStrategy ? "bg-purple-600 text-white" : "bg-orange-600 text-white"
                  : plan.isStrategy
                    ? "border border-purple-500/20 bg-purple-500/10 text-purple-400/80 hover:text-purple-300"
                    : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {plan.isStrategy ? `📋 ${plan.label}` : plan.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 border-t border-border pt-3 md:grid-cols-2">
        <NavMapAthleteControls athlete={athlete} />

        <div className="space-y-1.5">
          <label htmlFor="navmap-layout-preset" className="block text-[10px] font-medium text-muted-foreground">
            저장된 배치
            {layout.isDirty && <span className="ml-1.5 text-amber-300">수정됨</span>}
          </label>
          <div className="flex flex-wrap gap-2">
            <select
              id="navmap-layout-preset"
              aria-label="저장된 배치"
              value={layout.activeName}
              onChange={(event) => layout.onPresetChange(event.target.value)}
              className="min-h-10 min-w-28 rounded-lg border border-border bg-background px-3 text-xs text-foreground"
            >
              <option value={DEFAULT_LAYOUT_NAME}>default</option>
              {layout.presets.map((preset) => (
                <option key={preset.name} value={preset.name}>
                  {preset.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              aria-label="배치 이름"
              maxLength={24}
              value={layout.name}
              onChange={(event) => layout.onNameChange(event.target.value)}
              placeholder="새 배치 이름"
              className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground"
            />
            <button
              type="button"
              aria-label="현재 배치 저장"
              onClick={layout.onSave}
              disabled={!layout.name.trim()}
              className="min-h-10 rounded-lg bg-orange-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              저장
            </button>
          </div>
        </div>
      </div>

      <NavMapMapControls
        colorMode={map.colorMode}
        ruleSetFilter={map.ruleSetFilter}
        zoomLevel={map.zoomLevel}
        minZoom={map.minZoom}
        maxZoom={map.maxZoom}
        onColorModeChange={map.onColorModeChange}
        onRuleSetFilterChange={map.onRuleSetFilterChange}
        onZoomChange={map.onZoomChange}
        onResetZoom={map.onResetZoom}
        onResetLayout={map.onResetLayout}
      />
    </div>
  )
}
