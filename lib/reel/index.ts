import raw from "@/data/reel-index.json"

/** 수업 정리 릴의 한 장면. 원본은 BJJ 리포의 릴 스펙(claude/tools/reel/specs). */
export type ReelCut = {
  readonly no: number
  readonly title: string
  readonly quote: string
  readonly pos: readonly string[]
  readonly role: "bottom" | "top" | null
  readonly phase: ReelPhase | null
  readonly src: string
  readonly ss: number
  readonly dur: number
}

export type ReelEntry = {
  readonly date: string
  readonly title: string
  readonly subtitle: string
  readonly url: string | null
  readonly cuts: readonly ReelCut[]
}

export type ReelIndex = {
  readonly generatedAt: string
  readonly reels: readonly ReelEntry[]
  /** 슬러그 → 사람이 읽는 기술 이름 */
  readonly positions: Readonly<Record<string, string>>
}

export type ReelPhase =
  | "entry" | "maintain" | "grip" | "sweep" | "escape" | "back" | "sub" | "pass"

/** 한 장면에 그게 속한 릴 정보를 붙인 형태 — 화면에서 쓰기 편하게. */
export type ReelScene = ReelCut & {
  readonly date: string
  readonly reelTitle: string
  readonly reelUrl: string | null
}

export const PHASE_LABEL: Record<ReelPhase, string> = {
  entry: "진입",
  maintain: "유지",
  grip: "그립",
  sweep: "스윕",
  escape: "탈출",
  back: "백",
  sub: "서브미션",
  pass: "패스",
}

/** 기술의 흐름 순서 — 목록을 이 순서로 보여주면 읽기 쉽다. */
export const PHASE_ORDER: readonly ReelPhase[] = [
  "entry", "maintain", "grip", "sweep", "escape", "back", "sub", "pass",
]

export const ROLE_LABEL: Record<"bottom" | "top", string> = {
  bottom: "바텀",
  top: "탑",
}

export const reelIndex = raw as unknown as ReelIndex

/** 모든 장면을 평평하게 편다. */
export function allScenes(index: ReelIndex = reelIndex): ReelScene[] {
  return index.reels.flatMap((reel) =>
    reel.cuts.map((cut) => ({
      ...cut,
      date: reel.date,
      reelTitle: reel.title,
      reelUrl: reel.url,
    })),
  )
}

export type PositionSummary = {
  readonly slug: string
  readonly name: string
  readonly scenes: readonly ReelScene[]
}

/** 기술별로 묶고, 장면이 많은 순으로 돌려준다. */
export function scenesByPosition(index: ReelIndex = reelIndex): PositionSummary[] {
  const buckets = new Map<string, ReelScene[]>()
  for (const scene of allScenes(index)) {
    for (const slug of scene.pos) {
      buckets.set(slug, [...(buckets.get(slug) ?? []), scene])
    }
  }
  return [...buckets.entries()]
    .map(([slug, scenes]) => ({
      slug,
      name: index.positions[slug] ?? slug,
      scenes: [...scenes].sort((a, b) => {
        const pa = a.phase ? PHASE_ORDER.indexOf(a.phase) : 99
        const pb = b.phase ? PHASE_ORDER.indexOf(b.phase) : 99
        return pa !== pb ? pa - pb : a.date.localeCompare(b.date)
      }),
    }))
    .sort((a, b) => b.scenes.length - a.scenes.length || a.name.localeCompare(b.name))
}

/** 제목·인용·기술명에서 찾는다. */
export function matchesQuery(scene: ReelScene, query: string, positionName: string): boolean {
  if (!query.trim()) return true
  const haystack = [scene.title, scene.quote, positionName, scene.date].join(" ").toLowerCase()
  return haystack.includes(query.trim().toLowerCase())
}

export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}
