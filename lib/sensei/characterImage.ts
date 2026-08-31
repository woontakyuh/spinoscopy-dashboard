/**
 * 벨트 상태 + Gi/NoGi 모드 → 캐릭터 전신 이미지 매핑.
 *
 * Gi  — 벨트가 그림에 보이므로 벨트별 아트가 필요하다: tak-gi-{belt}.webp
 * NoGi — 래쉬가드에 벨트가 없으므로 벨트와 무관한 한 장을 쓴다: tak-nogi.webp
 *
 * 새 벨트 아트가 생기면 public/characters/tak-gi-{belt}.webp 를 추가하고
 * AVAILABLE_GI_BELTS 에 그 벨트를 넣기만 하면 된다.
 * 아직 아트가 없는 상위 벨트로 승급하면, 아트가 있는 가장 높은 하위 벨트로 폴백한다.
 * (승급 직후에 캐릭터 창이 비는 것보다 낫다)
 */

import type { ConditionId } from "./characterCondition"

export type GiMode = "gi" | "nogi"

/** 흰띠 → 검은띠 순서. BELTS(statConfig) 와 같은 순서를 유지할 것. */
export const BELT_ORDER = ["white", "blue", "purple", "brown", "black"] as const

/** public/characters/ 에 실제 Gi 아트가 있는 벨트만 나열한다. */
const AVAILABLE_GI_BELTS = new Set<string>(["blue"])

/** NoGi 아트가 준비돼 있는지. */
const HAS_NOGI_ART = true

/**
 * 컨디션별 전용 아트가 있는 조합. 없으면 기본 아트에 CSS 보정만 걸린다.
 * 사진이 생기면 `${base}-${condition}` 을 여기 추가하고 파일을 넣으면 된다.
 */
const CONDITION_ART = new Set<string>([])

export function characterImageSrc(
  belt: string,
  mode: GiMode,
  condition?: ConditionId,
): string | null {
  const base = baseArtName(belt, mode)
  if (!base) return null
  if (condition && CONDITION_ART.has(`${base}-${condition}`)) {
    return `/characters/${base}-${condition}.webp`
  }
  return `/characters/${base}.webp`
}

function baseArtName(belt: string, mode: GiMode): string | null {
  if (mode === "nogi") return HAS_NOGI_ART ? "tak-nogi" : null
  const key = resolveBeltArt(belt)
  return key ? `tak-gi-${key}` : null
}

/** 요청한 벨트의 Gi 아트가 없으면, 아트가 존재하는 가장 높은 하위 벨트를 돌려준다. */
export function resolveBeltArt(belt: string): string | null {
  const idx = BELT_ORDER.indexOf(belt as (typeof BELT_ORDER)[number])
  // 알 수 없는 벨트 값이면 가장 높은 벨트부터 훑어 내려간다
  const start = idx === -1 ? BELT_ORDER.length - 1 : idx
  for (let i = start; i >= 0; i--) {
    if (AVAILABLE_GI_BELTS.has(BELT_ORDER[i])) return BELT_ORDER[i]
  }
  // 하위에 아무것도 없으면 상위라도 쓴다 (흰띠인데 블루 아트만 있는 경우)
  for (let i = start + 1; i < BELT_ORDER.length; i++) {
    if (AVAILABLE_GI_BELTS.has(BELT_ORDER[i])) return BELT_ORDER[i]
  }
  return null
}
