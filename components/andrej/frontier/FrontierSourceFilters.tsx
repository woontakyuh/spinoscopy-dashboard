// 에피소드 출처 필터 한 줄 (전체 / AI Frontier / Dwarkesh).
// 훅 없는 표시 전용 모듈. 클라이언트 경계는 FrontierDashboard 가 연다.
// 개념 카테고리 필터와 같은 칩 규격을 써서 두 줄이 한 벌로 읽히게 한다.

import { cn } from "@/lib/utils"

import {
  frontierChipActiveClass,
  frontierChipClass,
  frontierChipCountClass,
  frontierChipIdleClass,
} from "./FrontierSourceState"
import {
  FRONTIER_SOURCE_FILTERS,
  frontierSourceFilterLabel,
  type FrontierSourceFilter,
} from "./frontier-source"

export interface FrontierSourceFiltersProps {
  readonly current: FrontierSourceFilter
  /** 검색 전 기준 개수. 필터를 걸어도 다른 칩이 0으로 사라지지 않게 한다. */
  readonly counts: Record<FrontierSourceFilter, number>
  readonly onChange: (filter: FrontierSourceFilter) => void
}

export function FrontierSourceFilters({ current, counts, onChange }: FrontierSourceFiltersProps) {
  return (
    <div
      data-testid="frontier-source-chips"
      role="group"
      aria-label="에피소드 출처 필터"
      className="flex flex-wrap gap-1.5"
    >
      {FRONTIER_SOURCE_FILTERS.map((filter) => {
        const active = filter === current
        return (
          <button
            key={filter}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(filter)}
            className={cn(frontierChipClass, active ? frontierChipActiveClass : frontierChipIdleClass)}
          >
            {frontierSourceFilterLabel(filter)}{" "}
            <span className={frontierChipCountClass(active)}>{counts[filter]}</span>
          </button>
        )
      })}
    </div>
  )
}
