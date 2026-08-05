// lib/fulltext/access.ts
// 경북대 망으로도 원문에 닿을 수 없는 저널. 원문요청을 받아도 Aside 가 논문 페이지를
// 열기만 하고 PDF 를 못 찾아 계속 "실패" 로 쌓이므로, 요청 단계에서 걸러낸다.
//
// 2026-08-05 실측 — 원문요청 44건의 저널별 확보/실패:
//   ESJ 11/1 · JNS Spine 5/0 · Spine 3/0 · Neurospine 2/0  → 접근 정상
//   TSJ 0/8                                                 → 구독 없음
// (GSJ 0/5 는 접근권 문제가 아니라 SAGE 봇차단 문제라 여기 넣지 않는다)

/** 저널 표기 흔들림(대소문자·공백)을 흡수한 비교키. */
function key(name: string): string {
  return name.trim().toLowerCase()
}

/** Notion Journal Name select 에 같은 저널이 약칭·full name 두 가지로 들어있다. */
const NO_ACCESS = new Set(["tsj", "the spine journal"])

export function isNoAccessJournal(journal: string | null | undefined): boolean {
  if (!journal) return false
  return NO_ACCESS.has(key(journal))
}

export function NO_ACCESS_REASON(journal: string): string {
  return `${journal} 은(는) 경북대에서 구독하지 않아 원문을 받을 수 없습니다. 상호대차나 저자 요청이 필요합니다.`
}

/** 접근 불가로 판정된 행에 남기는 상태값. */
export const NO_ACCESS_STATUS = "접근불가"
