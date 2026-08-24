import type { NavMapLayer } from "@/lib/sensei/nav-map-layout"
import type { TransitionCategory } from "@/lib/sensei/nav-map-scoring"
import type { NavMapColorMode } from "@/components/sensei/nav-map/NavMapMapControls"
import {
  EDGE_COLORS,
  LAYER_COLORS,
  SKILL_LEVEL_COLORS,
} from "@/components/sensei/nav-map/nav-map-theme"

const NODE_LABELS: readonly {
  readonly key: NavMapLayer
  readonly label: string
}[] = [
  { key: "standing", label: "스탠딩" },
  { key: "guard", label: "가드" },
  { key: "passing", label: "패싱" },
  { key: "control", label: "컨트롤" },
  { key: "defense", label: "디펜스" },
  { key: "submission", label: "서브미션" },
  { key: "leglock", label: "레그락" },
]

const EDGE_LABELS: readonly {
  readonly key: TransitionCategory
  readonly label: string
}[] = [
  { key: "pass", label: "패스" },
  { key: "sweep", label: "스윕" },
  { key: "advance", label: "전개" },
  { key: "control", label: "컨트롤" },
  { key: "submission", label: "서브미션" },
  { key: "takedown", label: "테이크다운" },
  { key: "recovery", label: "리커버리" },
]

export function NavMapLegend({
  colorMode,
}: {
  readonly colorMode: NavMapColorMode
}) {
  return (
    <div
      aria-label="기술 지도 색상 범례"
      className="space-y-2 rounded-xl border border-border bg-card/40 px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[10px] font-semibold text-muted-foreground">노드</span>
        {colorMode === "layer"
          ? NODE_LABELS.map((item) => (
              <span key={item.key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LAYER_COLORS[item.key] }} />
                {item.label}
              </span>
            ))
          : [0, 1, 2, 3, 4, 5].map((level) => (
              <span key={level} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: SKILL_LEVEL_COLORS[level],
                    opacity: level === 0 ? 0.3 : 1,
                  }}
                />
                {level === 0 ? "Locked" : `Lv.${level}`}
              </span>
            ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[10px] font-semibold text-muted-foreground">화살표</span>
        {EDGE_LABELS.map((item) => (
          <span key={item.key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: EDGE_COLORS[item.key] }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}
