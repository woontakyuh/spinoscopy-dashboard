import { cn } from "@/lib/utils"

import type { FrontierCategoryCount } from "./frontier-view"

const filterClass =
  "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"

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
          filterClass,
          current === null
            ? "border-purple-400/40 bg-purple-500/15 text-purple-700 dark:text-purple-200"
            : "border-border bg-muted text-foreground/80 hover:border-muted-foreground/50 hover:text-foreground"
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
            className={cn(
              filterClass,
              active
                ? "border-purple-400/40 bg-purple-500/15 text-purple-700 dark:text-purple-200"
                : "border-border bg-muted text-foreground/80 hover:border-muted-foreground/50 hover:text-foreground"
            )}
          >
            {category}{" "}
            <span className={cn("num", active ? "text-purple-700/80 dark:text-purple-100/80" : "text-muted-foreground")}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}
