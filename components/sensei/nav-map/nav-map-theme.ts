import type { FinishEvidenceKind, Position } from "@/lib/types/sensei"
import {
  NAV_MAP_HEIGHT,
  NAV_MAP_WIDTH,
  type NavMapLayer,
} from "@/lib/sensei/nav-map-layout"
import type { TransitionCategory } from "@/lib/sensei/nav-map-scoring"

export const SVG_W = NAV_MAP_WIDTH
export const SVG_H = NAV_MAP_HEIGHT
export const FULL_VIEW_BOX = { x: 0, y: 0, w: SVG_W, h: SVG_H }

export const LAYER_COLORS: Record<NavMapLayer, string> = {
  standing: "#71717a",
  guard: "#3b82f6",
  passing: "#22c55e",
  control: "#f59e0b",
  defense: "#eab308",
  submission: "#ef4444",
  leglock: "#dc2626",
}

export const EDGE_COLORS: Readonly<Record<TransitionCategory, string>> = {
  pass: "var(--nav-pass)",
  sweep: "var(--nav-sweep)",
  advance: "var(--nav-advance)",
  control: "var(--nav-control)",
  submission: "var(--nav-submission)",
  takedown: "var(--nav-takedown)",
  recovery: "var(--nav-recovery)",
}

export const EVIDENCE_KIND_LABELS: Readonly<Record<FinishEvidenceKind, string>> = {
  class: "수업",
  study: "공부",
  sparring: "스파링",
  research: "연구",
  discussion: "논의",
  concept: "개념",
}

export const SKILL_LEVEL_COLORS: Record<number, string> = {
  0: "#3f3f46",  // zinc-700 — very dim
  1: "#a1a1aa",  // zinc-400
  2: "#22c55e",  // green
  3: "#3b82f6",  // blue
  4: "#a855f7",  // purple
  5: "#f59e0b",  // amber/gold
}

export function getSkillLevel(count: number): { level: number; label: string } {
  if (count === 0) return { level: 0, label: "Locked" }
  if (count <= 2) return { level: 1, label: "Lv.1" }
  if (count <= 5) return { level: 2, label: "Lv.2" }
  if (count <= 10) return { level: 3, label: "Lv.3" }
  if (count <= 20) return { level: 4, label: "Lv.4" }
  return { level: 5, label: "Lv.5" }
}

// Use id for short names (they're already abbrs like "hg", "dlr", "kob"),
// otherwise the first 3 chars of nameKr.
export function abbr(pos: Position): string {
  if (pos.id.length <= 4) return pos.id.toUpperCase()
  return (pos.nameKr || pos.name).slice(0, 3)
}
