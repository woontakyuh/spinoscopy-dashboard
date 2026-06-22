import type { SocialLang, SocialPlatform } from "@/lib/types/social"

export interface SocialAccount {
  platform: SocialPlatform
  account: string
  lang: SocialLang
  label: string
}

// 수집 대상 계정. 추가 시 여기 한 줄 + 수집기(scripts/social-collector)에 핸들 추가.
// (X는 로그아웃 syndication이 IP 레이트리밋으로 상시 막혀 제외 — 2026-06-22)
export const SOCIAL_ACCOUNTS: SocialAccount[] = [
  { platform: "threads", account: "choi.openai", lang: "ko", label: "Threads @choi.openai" },
]

// 계정 언어. 모르는 계정은 영문 가정(한글 요약 버튼 노출).
export function accountLang(account: string): SocialLang {
  return SOCIAL_ACCOUNTS.find((a) => a.account === account)?.lang ?? "en"
}

export function platformLabel(platform: SocialPlatform): string {
  return platform === "threads" ? "Threads" : "X"
}
