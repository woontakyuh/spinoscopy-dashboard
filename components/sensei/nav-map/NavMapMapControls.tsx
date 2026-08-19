export type NavMapColorMode = "layer" | "skill"
export type NavMapRuleSet = "all" | "gi" | "nogi"

interface NavMapMapControlsProps {
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

export function NavMapMapControls({
  colorMode,
  ruleSetFilter,
  zoomLevel,
  minZoom,
  maxZoom,
  onColorModeChange,
  onRuleSetFilterChange,
  onZoomChange,
  onResetZoom,
  onResetLayout,
}: NavMapMapControlsProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
      <div className="space-y-1">
        <span className="block text-[10px] font-medium text-muted-foreground">색상 기준</span>
        <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label="노드 색상 기준">
          <button
            type="button"
            aria-pressed={colorMode === "layer"}
            onClick={() => onColorModeChange("layer")}
            className={`min-h-8 px-3 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
              colorMode === "layer" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            포지션
          </button>
          <button
            type="button"
            aria-pressed={colorMode === "skill"}
            onClick={() => onColorModeChange("skill")}
            className={`min-h-8 border-l border-border px-3 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
              colorMode === "skill" ? "bg-amber-500/20 text-amber-300" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            숙련도
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <span className="block text-[10px] font-medium text-muted-foreground">룰셋</span>
        <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label="룰셋 필터">
          {(["all", "gi", "nogi"] as const).map((ruleSet) => (
            <button
              key={ruleSet}
              type="button"
              aria-pressed={ruleSetFilter === ruleSet}
              onClick={() => onRuleSetFilterChange(ruleSet)}
              className={`min-h-8 border-l border-border px-3 text-[11px] first:border-l-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                ruleSetFilter === ruleSet
                  ? "bg-orange-500/15 text-orange-300"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {ruleSet === "all" ? "전체" : ruleSet === "gi" ? "Gi" : "No-Gi"}
            </button>
          ))}
        </div>
      </div>

      <div className="ml-auto space-y-1">
        <span className="block text-[10px] font-medium text-muted-foreground">지도 크기</span>
        <div className="flex min-h-8 items-center gap-1 rounded-lg border border-border px-1.5">
          <button
            type="button"
            onClick={() => onZoomChange(zoomLevel / 1.2)}
            className="min-h-7 min-w-7 rounded text-foreground/80 hover:bg-muted hover:text-foreground disabled:opacity-40"
            disabled={zoomLevel <= minZoom + 0.01}
            aria-label="Zoom out"
          >−</button>
          <input
            type="range"
            min={minZoom}
            max={maxZoom}
            step={0.1}
            value={zoomLevel}
            onChange={(event) => onZoomChange(Number.parseFloat(event.target.value))}
            className="w-20 accent-orange-500"
            aria-label="Zoom level"
          />
          <button
            type="button"
            onClick={() => onZoomChange(zoomLevel * 1.2)}
            className="min-h-7 min-w-7 rounded text-foreground/80 hover:bg-muted hover:text-foreground disabled:opacity-40"
            disabled={zoomLevel >= maxZoom - 0.01}
            aria-label="Zoom in"
          >+</button>
          <span className="num w-9 text-right text-[10px] text-muted-foreground">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            type="button"
            onClick={onResetZoom}
            className="min-h-7 rounded px-1.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Reset zoom"
          >맞춤</button>
          <button
            type="button"
            onClick={onResetLayout}
            className="min-h-7 rounded border-l border-border px-2 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Reset node layout"
          >
            배치 초기화
          </button>
        </div>
      </div>
    </div>
  )
}
