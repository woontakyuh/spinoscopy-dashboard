"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { Archetype, Position, Transition } from "@/lib/types/sensei"
import type { SenseiDataResult } from "@/lib/notion/senseiData"
// fallback (hardcoded)
import { ARCHETYPES } from "./archetypes"
import { POSITIONS, TRANSITIONS } from "./skillConnections"

async function fetchData(): Promise<SenseiDataResult> {
  const res = await fetch("/api/notion/sensei/data")
  if (!res.ok) throw new Error("sensei data fetch failed")
  return res.json()
}

export interface UseSenseiDataReturn {
  archetypes: Archetype[]
  positions: Position[]
  transitions: Transition[]
  source: "notion" | "fallback"
  loading: boolean
  error: Error | null
  refresh: () => void
}

export function useSenseiData(): UseSenseiDataReturn {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery<SenseiDataResult>({
    queryKey: ["sensei-data"],
    queryFn: fetchData,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const hasData = data && data.archetypes.length > 0

  return {
    archetypes: hasData ? data.archetypes : ARCHETYPES,
    positions: hasData ? data.positions : POSITIONS,
    transitions: hasData && data.transitions.length > 0 ? data.transitions : TRANSITIONS,
    source: hasData ? "notion" : "fallback",
    loading: isLoading,
    error: error as Error | null,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["sensei-data"] }),
  }
}
