import { cn } from "@/lib/utils"

import {
  frontierChipActiveClass,
  frontierChipClass,
  frontierChipCountClass,
  frontierChipIdleClass,
} from "./FrontierSourceState"
import type { FrontierCategoryCount } from "./frontier-view"

export function ConceptCategoryFilters({
  counts,
  current,
  onChange,
}: {
  readonly counts: FrontierCategoryCount[]
  readonly current: string | null
  readonly onChange: (category: string | null) => void
}) {
  return (
    <div data-testid="frontier-category-chips" className="flex flex-wrap gap-1.5">
      <button
        type="button"
        aria-pressed={current === null}
        onClick={() => onChange(null)}
        className={cn(
          frontierChipClass,
          current === null ? frontierChipActiveClass : frontierChipIdleClass
        )}
      >
        전체
      </button>

      {counts.map(({ category, count }) => {
        const active = category === current
        return (
          <button
            key={category}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(category)}
            className={cn(frontierChipClass, active ? frontierChipActiveClass : frontierChipIdleClass)}
          >
            {category} <span className={frontierChipCountClass(active)}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}
