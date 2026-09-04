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
  mode: "gi" | "nogi" = "gi",
): AthleteComparisonController {
  const [selectedAthlete, setSelectedAthlete] = useState<Archetype | null>(null)
  const [hoveredAthlete, setHoveredAthlete] = useState<Archetype | null>(null)
  const [category, setCategory] = useState<AthleteCategory>("all")
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragState = useRef({ isDown: false, startX: 0, scrollLeft: 0 })

  // 기 탭이면 기 선수, 노기 탭이면 노기 선수. 둘 다 하는 선수(both)는 양쪽에 뜬다.
  // 22명이 항상 다 보이면 스크롤만 길어지고 눈에 안 들어온다.
  const filteredAthletes = useMemo(
    () => athletes.filter((athlete) =>
      (athlete.ruleSet === mode || athlete.ruleSet === "both")
      && (category === "all" || athlete.category === category)),
    [athletes, category, mode],
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
