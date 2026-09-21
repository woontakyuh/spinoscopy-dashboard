import type { Journal } from "@/lib/types/editorial"

/**
 * 저널 배지 색. Notion DB 의 Journal 옵션 전체를 덮어야 한다.
 * 빠진 저널이 있으면 배지가 색 없이 나오므로 테스트가 잡는다.
 */
export const JOURNAL_BADGE: Record<Journal, string> = {
  "Neurospine": "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  "JMISST": "bg-purple-500/15 text-purple-300 border-purple-500/30",
  "KJNT": "bg-green-500/15 text-green-300 border-green-500/30",
  "Scientific Reports": "bg-orange-500/15 text-orange-300 border-orange-500/30",
  "PLOS ONE": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "World Neurosurgery": "bg-red-500/15 text-red-300 border-red-500/30",
  "BMC surgery": "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "BMC Cancer": "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  "JSOR": "bg-orange-800/20 text-orange-200 border-orange-700/40",
  "Book Review": "bg-pink-500/15 text-pink-300 border-pink-500/30",
}

export const JOURNAL_BADGE_FALLBACK =
  "bg-zinc-500/15 text-zinc-300 border-zinc-500/30"
