import type { BjjAttributes, PositionLayer } from "@/lib/types/sensei"

export const LAYER_COLORS_MAP: Record<PositionLayer, string> = {
  standing: "#71717a",
  guard: "#3b82f6",
  passing: "#22c55e",
  control: "#f59e0b",
  submission: "#ef4444",
  leglock: "#dc2626",
}

export const STAT_BARS: { key: keyof BjjAttributes; name: string; color: string; hex: string }[] = [
  { key: "guard", name: "Guard", color: "bg-purple-500", hex: "#a855f7" },
  { key: "passing", name: "Passing", color: "bg-green-500", hex: "#22c55e" },
  { key: "control", name: "Control", color: "bg-orange-600", hex: "#ea580c" },
  { key: "finishing", name: "Submission", color: "bg-red-500", hex: "#ef4444" },
  { key: "takedowns", name: "Standing", color: "bg-cyan-500", hex: "#06b6d4" },
  { key: "legLocks", name: "Leg Locks", color: "bg-yellow-500", hex: "#eab308" },
]

export const DETAIL_LABEL = "text-[10px] font-medium tracking-wide text-muted-foreground"

export const BELTS = [
  { id: "white", color: "bg-zinc-200", hex: "#d4d4d8" },
  { id: "blue", color: "bg-blue-600", hex: "#3b82f6" },
  { id: "purple", color: "bg-purple-600", hex: "#a855f7" },
  { id: "brown", color: "bg-amber-800", hex: "#92400e" },
  { id: "black", color: "bg-card", hex: "#27272a" },
]

export type CatFilter = "all" | "gi-legend" | "gi-active" | "nogi" | "special"

export interface RadarDatum {
  subject: string
  value: number
  cap: number
  compare?: number
  fullMark: number
}

export function cosineSimilarity(a: BjjAttributes, b: BjjAttributes): number {
  const keys: (keyof BjjAttributes)[] = ["guard", "passing", "control", "finishing", "takedowns", "legLocks"]
  let dot = 0, magA = 0, magB = 0
  for (const k of keys) { dot += a[k] * b[k]; magA += a[k] ** 2; magB += b[k] ** 2 }
  if (magA === 0 || magB === 0) return 0
  return Math.round((dot / (Math.sqrt(magA) * Math.sqrt(magB))) * 100)
}
