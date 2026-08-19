import type { BjjAttributes, Position } from "@/lib/types/sensei"
import {
  AthleteGameplan,
  AthleteIdentity,
  AthleteStrengths,
  AthleteStyle,
} from "@/components/sensei/character/AthleteDetailSections"
import { CountryFlag } from "@/components/sensei/character/CountryFlag"
import type {
  AthleteCategory,
  AthleteComparisonController,
} from "@/components/sensei/character/useAthleteComparison"

const FILTERS: readonly {
  readonly id: AthleteCategory
  readonly label: string
}[] = [
  { id: "all", label: "전체" },
  { id: "gi-legend", label: "Gi Legend" },
  { id: "gi-active", label: "Gi Active" },
  { id: "nogi", label: "NoGi" },
  { id: "special", label: "Special" },
]

interface AthleteComparisonPanelProps {
  readonly attributes: BjjAttributes
  readonly positions: readonly Position[]
  readonly controller: AthleteComparisonController
  readonly onNavigate: (tab: string) => void
}

export function AthleteComparisonPanel({
  attributes,
  positions,
  controller,
  onNavigate,
}: AthleteComparisonPanelProps) {
  const activeAthlete = controller.activeAthlete

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">선수 비교</h3>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => controller.setCategory(filter.id)}
              className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
                controller.category === filter.id
                  ? "bg-orange-600 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={controller.scrollRef}
        data-testid="athlete-roster"
        className="scrollbar-hide flex cursor-grab select-none gap-2 overflow-x-auto pb-2"
        onMouseDown={controller.onMouseDown}
        onMouseUp={controller.onMouseUp}
        onMouseLeave={controller.onMouseUp}
        onMouseMove={controller.onMouseMove}
      >
        {controller.filteredAthletes.map((athlete) => {
          const selected = controller.selectedAthlete?.name === athlete.name
          return (
            <button
              key={athlete.name}
              type="button"
              aria-pressed={selected}
              onClick={() => controller.selectAthlete(athlete)}
              onPointerEnter={() => controller.hoverAthlete(athlete)}
              onPointerLeave={() => controller.hoverAthlete(null)}
              className={`w-28 shrink-0 rounded-xl border p-2 text-center transition-all ${
                selected
                  ? "border-orange-500 bg-orange-500/10 ring-1 ring-orange-500/30"
                  : "border-border bg-muted/50 hover:border-foreground/20"
              }`}
            >
              <CountryFlag flag={athlete.flag} className="mx-auto block h-4 w-6 rounded-[2px] shadow-sm" />
              <p className="mt-1 text-[11px] font-semibold leading-tight text-foreground">
                {athlete.name}
              </p>
              <p className="text-[10px] leading-tight text-muted-foreground">
                {athlete.nickname}
              </p>
            </button>
          )
        })}
      </div>

      {activeAthlete && (
        <div
          data-testid="athlete-detail"
          className="mt-3 space-y-4 rounded-xl border border-border bg-muted/30 p-4"
        >
          <AthleteIdentity athlete={activeAthlete} attributes={attributes} />
          <AthleteStyle athlete={activeAthlete} attributes={attributes} />
          <AthleteStrengths athlete={activeAthlete} />
          <AthleteGameplan
            athlete={activeAthlete}
            positions={positions}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </div>
  )
}
