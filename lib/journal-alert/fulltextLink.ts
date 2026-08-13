// lib/journal-alert/fulltextLink.ts
// Journal Alert 메일의 "원문" 버튼이 여는 서명된 링크.
//
// 이 링크가 여는 /api/journal/fulltext 는 proxy.ts 에서 대시보드 로그인을 우회한다
// (메일 클라이언트에서 바로 눌러야 하므로). 그래서 서명이 유일한 방어선이다 —
// 없으면 Notion pageId 만 알아도 아무나 맥스튜디오에 수집 작업을 밀어넣을 수 있다.
//
// 만료는 두지 않는다. 지난주 메일을 열어 눌러도 동작해야 하고, 행위 자체가
// "논문 하나 받아둬라" 라 시간이 지나도 위험해지지 않는다.

import { createHmac, timingSafeEqual } from "node:crypto"

export const FULLTEXT_LINK_PATH = "/api/journal/fulltext"

export function signPageId(pageId: string, secret: string): string {
  return createHmac("sha256", secret).update(pageId).digest("hex")
}

/** 상수시간 비교. 길이가 다르거나 hex 가 아니면 던지지 말고 false. */
export function verifyPageToken(pageId: string, token: string, secret: string): boolean {
  if (!secret || !token) return false
  const expected = signPageId(pageId, secret)
  if (token.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"))
  } catch {
    return false
  }
}

/**
 * 메일에 넣을 절대 URL. 키나 baseUrl 이 없으면 null —
 * 호출부는 null 이면 버튼을 아예 그리지 않는다. 깨진 링크가 나가는 것보다 낫다.
 */
export function buildFulltextLink(
  baseUrl: string,
  pageId: string,
  secret: string
): string | null {
  if (!baseUrl || !secret || !pageId) return null
  const base = baseUrl.replace(/\/+$/, "")
  const token = signPageId(pageId, secret)
  return `${base}${FULLTEXT_LINK_PATH}?p=${encodeURIComponent(pageId)}&t=${token}`
}
