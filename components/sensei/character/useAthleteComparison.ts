import { useCallback, useMemo, useRef, useState } from "react"
import type { Archetype } from "@/lib/types/sensei"

export type AthleteCategory =
  | "all"
  | "gi-legend"
  | "gi-active"
  | "nogi"
  | "special"

export interface AthleteComparisonController {
  readonly activeAthlete: Archetype | null
  readonly selectedAthlete: Archetype | null
  readonly filteredAthletes: readonly Archetype[]
  readonly category: AthleteCategory
  readonly scrollRef: React.RefObject<HTMLDivElement | null>
  readonly setCategory: (category: AthleteCategory) => void
  readonly selectAthlete: (athlete: Archetype) => void
  readonly hoverAthlete: (athlete: Archetype | null) => void
  readonly onMouseDown: (event: React.MouseEvent) => void
  readonly onMouseUp: () => void
  readonly onMouseMove: (event: React.MouseEvent) => void
}

export function useAthleteComparison(
  athletes: readonly Archetype[],
  fallbackAthlete: Archetype | null,
): AthleteComparisonController {
  const [selectedAthlete, setSelectedAthlete] = useState<Archetype | null>(null)
  const [hoveredAthlete, setHoveredAthlete] = useState<Archetype | null>(null)
  const [category, setCategory] = useState<AthleteCategory>("all")
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragState = useRef({ isDown: false, startX: 0, scrollLeft: 0 })

  const filteredAthletes = useMemo(
    () => category === "all"
      ? athletes
      : athletes.filter((athlete) => athlete.category === category),
    [athletes, category],
  )

  const selectAthlete = useCallback((athlete: Archetype) => {
    setSelectedAthlete((current) => current?.name === athlete.name ? null : athlete)
  }, [])

  const onMouseDown = useCallback((event: React.MouseEvent) => {
    const element = scrollRef.current
    if (!element) return
    dragState.current = {
      isDown: true,
      startX: event.pageX - element.offsetLeft,
      scrollLeft: element.scrollLeft,
    }
    element.style.cursor = "grabbing"
  }, [])

  const onMouseUp = useCallback(() => {
    if (scrollRef.current) scrollRef.current.style.cursor = "grab"
    dragState.current.isDown = false
  }, [])

  const onMouseMove = useCallback((event: React.MouseEvent) => {
    if (!dragState.current.isDown) return
    event.preventDefault()
    const element = scrollRef.current
    if (!element) return
    const x = event.pageX - element.offsetLeft
    element.scrollLeft = dragState.current.scrollLeft
      - (x - dragState.current.startX)
  }, [])

  return {
    activeAthlete: selectedAthlete ?? hoveredAthlete ?? fallbackAthlete,
    selectedAthlete,
    filteredAthletes,
    category,
    scrollRef,
    setCategory,
    selectAthlete,
    hoverAthlete: setHoveredAthlete,
    onMouseDown,
    onMouseUp,
    onMouseMove,
  }
}
