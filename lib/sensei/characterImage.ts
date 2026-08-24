/**
 * 벨트 상태 → 캐릭터 포트레이트 이미지 매핑.
 *
 * 새 벨트 아트가 생기면 `public/characters/tak-{belt}.webp` 를 추가하고
 * 아래 AVAILABLE_BELTS 에 그 벨트를 넣기만 하면 된다.
 * 아직 아트가 없는 상위 벨트로 승급하면, 아트가 있는 가장 높은 하위 벨트로 폴백한다.
 * (승급 직후에 캐릭터 창이 비는 것보다 낫다)
 */

/** 흰띠 → 검은띠 순서. BELTS(statConfig) 와 같은 순서를 유지할 것. */
export const BELT_ORDER = ["white", "blue", "purple", "brown", "black"] as const

/** public/characters/ 에 실제 파일이 있는 벨트만 나열한다. */
const AVAILABLE_BELTS = new Set<string>(["blue"])

export function characterImageSrc(belt: string): string | null {
  const key = resolveBeltArt(belt)
  return key ? `/characters/tak-${key}.webp` : null
}

/** 요청한 벨트의 아트가 없으면, 아트가 존재하는 가장 높은 하위 벨트를 돌려준다. */
export function resolveBeltArt(belt: string): string | null {
  const idx = BELT_ORDER.indexOf(belt as (typeof BELT_ORDER)[number])
  // 알 수 없는 벨트 값이면 있는 것 중 가장 낮은 벨트로 시작한다
  const start = idx === -1 ? BELT_ORDER.length - 1 : idx
  for (let i = start; i >= 0; i--) {
    if (AVAILABLE_BELTS.has(BELT_ORDER[i])) return BELT_ORDER[i]
  }
  // 하위에 아무것도 없으면 상위라도 쓴다 (흰띠인데 블루 아트만 있는 경우)
  for (let i = start + 1; i < BELT_ORDER.length; i++) {
    if (AVAILABLE_BELTS.has(BELT_ORDER[i])) return BELT_ORDER[i]
  }
  return null
}
