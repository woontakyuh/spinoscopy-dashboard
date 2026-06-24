import type { SocialLang, SocialPlatform } from "@/lib/types/social"

export interface SocialAccount {
  platform: SocialPlatform
  account: string
  lang: SocialLang
  label: string
}

// 수집 대상 계정. 추가 시 여기 한 줄 + 수집기(scripts/social-collector)에 핸들 추가.
// 수집은 Aside CLI(로그인 세션)로 인증 상태 — X·Threads 모두 가능 (2026-06-24).
export const SOCIAL_ACCOUNTS: SocialAccount[] = [
  { platform: "threads", account: "choi.openai", lang: "ko", label: "Threads @choi.openai" },
  { platform: "threads", account: "unclejobs.ai", lang: "ko", label: "Threads @unclejobs.ai" },
  { platform: "threads", account: "roach_log", lang: "ko", label: "Threads @roach_log" },
  { platform: "threads", account: "tofukyung", lang: "ko", label: "Threads @tofukyung" },
  { platform: "threads", account: "asin_cartel", lang: "ko", label: "Threads @asin_cartel" },
  { platform: "threads", account: "darkest_alex", lang: "ko", label: "Threads @darkest_alex" },
  { platform: "threads", account: "aimaster3658", lang: "ko", label: "Threads @aimaster3658" },
  { platform: "x", account: "karpathy", lang: "en", label: "X @karpathy" },
]

// 계정 언어. 모르는 계정은 영문 가정(한글 요약 버튼 노출).
export function accountLang(account: string): SocialLang {
  return SOCIAL_ACCOUNTS.find((a) => a.account === account)?.lang ?? "en"
}

export function platformLabel(platform: SocialPlatform): string {
  return platform === "threads" ? "Threads" : "X"
}
