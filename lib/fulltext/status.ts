// lib/fulltext/status.ts
// Notion 의 `원문 상태` select 값을 화면·쿼리가 함께 쓰는 4값으로 정규화한다.
// 상태 문자열을 여기저기서 직접 비교하면 select 에 값이 하나 늘 때마다 조용히 어긋난다.

export type FulltextState = "acquired" | "failed" | "pending" | "none"

/** 확보 완료로 보는 상태값. Notion 필터도 이 배열을 그대로 쓴다. */
export const ACQUIRED_STATUSES = ["OA 확보", "Aside 확보"] as const
export const FAILED_STATUS = "실패"
export const PENDING_STATUS = "요청됨"

/**
 * 원문 상태 + 요청 체크박스 → 4값.
 * `요청됨` 이 아직 안 찍힌 갓 요청분(상태 비어있음)도 pending 으로 본다 —
 * queryFulltextQueue 가 큐로 집는 범위와 같게 맞춰야 "대기 N건인데 목록엔 없음" 이 안 생긴다.
 */
export function fulltextState(
  status: string | null | undefined,
  requested: boolean | null | undefined
): FulltextState {
  if (status && (ACQUIRED_STATUSES as readonly string[]).includes(status)) return "acquired"
  if (status === FAILED_STATUS) return "failed"
  if (status === PENDING_STATUS) return "pending"
  if (!status && requested) return "pending"
  // `접근불가`(구독 없음)와 모르는 값은 none. 재시도 대상이 아니다.
  return "none"
}

/** 목록 필터에서 고를 수 있는 값. `none` 은 노출하지 않는다 — "원문 안 받은 것" 만 보는 쓸모가 없다. */
export type FulltextFilterValue = "all" | "acquired" | "failed" | "pending"

const PROP = "원문 상태"

/**
 * 필터값 → Notion 쿼리 조건. `all` 이면 null(조건 없음).
 *
 * 목록은 커서 페이지네이션이라 클라이언트에서 거르면 확보 28편이 수천 편에 묻힌다.
 * 그래서 Notion 쿼리 단계에서 걸러야 하고, 그 범위는 fulltextState 와 반드시 같아야
 * 한다 — 다르면 화면 카운트(대시보드 데이터 기반)와 목록(쿼리 기반)이 어긋난다.
 */
export function fulltextNotionFilter(
  value: FulltextFilterValue
): Record<string, unknown> | null {
  if (value === "acquired") {
    return { or: ACQUIRED_STATUSES.map((s) => ({ property: PROP, select: { equals: s } })) }
  }
  if (value === "failed") {
    return { property: PROP, select: { equals: FAILED_STATUS } }
  }
  if (value === "pending") {
    return {
      or: [
        { property: PROP, select: { equals: PENDING_STATUS } },
        {
          and: [
            { property: "원문 요청", checkbox: { equals: true } },
            { property: PROP, select: { is_empty: true } },
          ],
        },
      ],
    }
  }
  return null
}
