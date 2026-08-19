import { CountryFlag } from "@/components/sensei/character/CountryFlag"
import type { AthleteControls } from "@/components/sensei/nav-map/NavMapToolbar"

interface NavMapAthleteControlsProps {
  readonly athlete: AthleteControls
}

export function NavMapAthleteControls({
  athlete,
}: NavMapAthleteControlsProps) {
  const selectedAthlete = athlete.archetypes.find(
    (current) => current.name === athlete.selectedAthleteName,
  )

  return (
    <div className="space-y-1.5">
      <label
        htmlFor="navmap-athlete"
        className="block text-[10px] font-medium text-muted-foreground"
      >
        선수 전술맵
      </label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          {selectedAthlete && (
            <CountryFlag
              flag={selectedAthlete.flag}
              className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-6 -translate-y-1/2 rounded-[2px] shadow-sm"
            />
          )}
          <select
            id="navmap-athlete"
            aria-label="선수 전술맵"
            value={athlete.selectedAthleteName}
            onChange={(event) => athlete.onAthleteChange(event.target.value)}
            className={`min-h-10 w-full rounded-lg border border-border bg-background pr-3 text-xs text-foreground ${
              selectedAthlete ? "pl-12" : "pl-3"
            }`}
          >
            <option value="">내 전술맵</option>
            {athlete.archetypes.map((currentAthlete) => (
              <option key={currentAthlete.name} value={currentAthlete.name}>
                {currentAthlete.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          aria-label="선수와 비교"
          aria-pressed={athlete.isComparing}
          disabled={!athlete.hasSelectedAthlete}
          onClick={athlete.onComparingChange}
          className="min-h-10 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          비교
        </button>
      </div>
    </div>
  )
}
