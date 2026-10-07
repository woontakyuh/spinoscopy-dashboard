import type { SenseiEntry, SenseiSessionType } from "@/lib/types/sensei"

/** 세션 종류의 한글 라벨. Training 탭과 홈 히트맵이 같은 말을 쓰도록 한곳에 둔다 */
export const SESSION_LABELS: Record<SenseiSessionType, string> = {
  class: "수업",
  openmat: "오픈매트",
  promotion: "승급",
  study: "공부",
}

/** 체육관에서 몸으로 한 세션 — 히트맵 색과 연속 주차는 이것만 센다 */
export function isPhysicalSession(entry: SenseiEntry): boolean {
  return entry.sessionType === "class" || entry.sessionType === "openmat"
}

/**
 * 히트맵 툴팁용 한 줄 요약.
 * 노션 제목이 이미 "★루프초크 — 싯업가드 패스의 피니시…" 처럼 그날 내용을 담고 있어서
 * 그걸 그대로 쓰되, 제목이 날짜뿐이면(`주짓수 2026-08-28`) 태그로 대신한다.
 */
export function summarizeEntry(entry: SenseiEntry): string {
  const title = entry.title.trim()
  const dateOnly = /^(주짓수\s*)?\d{4}-\d{2}-\d{2}$/.test(title)
  const tags = [...entry.classTags, ...entry.sparringTags, ...entry.studyTags]
    .filter((t) => t !== "NoGi" && t !== "Gi")
  if (!dateOnly && title) return title
  if (tags.length) return tags.slice(0, 4).join(" · ")
  return title || "기록"
}

/** 클래스 태그에 NoGi 가 있으면 노기, 아니면 기 (몸으로 한 세션에만 의미 있음) */
export function ruleSetOf(entry: SenseiEntry): "Gi" | "NoGi" | null {
  if (!isPhysicalSession(entry)) return null
  return [...entry.classTags, ...entry.sparringTags].includes("NoGi") ? "NoGi" : "Gi"
}
