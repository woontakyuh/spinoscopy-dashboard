/**
 * 수련 기록 → 캐릭터 컨디션.
 *
 * HANDOFF §6 이 이 인계의 실질 이유라고 못박은 것: 노션 수련 DB 가
 * 캐릭터를 움직이게 하는 것. BJJ 리포에서는 못 하고 대시보드에서만 된다.
 *
 * 판정 기준은 "지금 붙고 있나"다. 마지막 수련 이후 공백이 우선이고,
 * 연속 주차는 그 다음이다. 4주 연속이었어도 일주일 쉬었으면 지금은
 * 녹슨 상태로 보여야 한다 — 과거의 성적이 아니라 현재 상태를 비추는 게
 * 캐릭터의 일이다.
 */

export type ConditionId = "forged" | "steady" | "rusty" | "dormant"

export interface Condition {
  id: ConditionId
  /** 화면에 뜨는 짧은 한글 라벨 */
  label: string
  /** 라벨 밑에 붙는 한 줄 */
  tone: string
  /** Tailwind 색 토큰 (배지) */
  accent: string
  /** 포트레이트에 거는 CSS filter — 상태가 그림에도 드러나게 */
  imageFilter: string
}

export const CONDITIONS: Condition[] = [
  {
    id: "forged",
    label: "단련",
    tone: "불붙었다",
    accent: "text-orange-400 border-orange-500/40 bg-orange-500/10",
    imageFilter: "saturate(1.08) contrast(1.04) brightness(1.03)",
  },
  {
    id: "steady",
    label: "유지",
    tone: "페이스 좋다",
    accent: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
    imageFilter: "none",
  },
  {
    id: "rusty",
    label: "녹슴",
    tone: "슬슬 매트 그립다",
    accent: "text-amber-400 border-amber-500/40 bg-amber-500/10",
    imageFilter: "saturate(0.82) brightness(0.96)",
  },
  {
    id: "dormant",
    label: "휴면",
    tone: "돌아올 때다",
    accent: "text-zinc-400 border-zinc-500/40 bg-zinc-500/10",
    imageFilter: "saturate(0.45) brightness(0.9)",
  },
]

const BY_ID = new Map(CONDITIONS.map((c) => [c.id, c]))

export interface ConditionInput {
  /** 마지막 체육관 세션 이후 며칠. 기록이 없으면 null */
  daysSinceLastSession: number | null
  /** 연속 수련 주차 */
  currentStreak: number
}

/** 공백 일수 경계 — 이 값이 곧 상태 정의다 */
const RUSTY_AFTER_DAYS = 6
const DORMANT_AFTER_DAYS = 14
const FORGED_STREAK_WEEKS = 4

export function deriveCondition({ daysSinceLastSession, currentStreak }: ConditionInput): Condition {
  if (daysSinceLastSession === null) return BY_ID.get("dormant")!

  // 시계가 어긋나 음수가 와도 "오늘 했다"로 본다
  const days = Math.max(0, daysSinceLastSession)

  if (days >= DORMANT_AFTER_DAYS) return BY_ID.get("dormant")!
  if (days >= RUSTY_AFTER_DAYS) return BY_ID.get("rusty")!
  if (currentStreak >= FORGED_STREAK_WEEKS) return BY_ID.get("forged")!
  return BY_ID.get("steady")!
}
