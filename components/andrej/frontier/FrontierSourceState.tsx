// AI Frontier 의 로딩/실패 자리와 두 목록이 공유하는 표시 토큰.
// 훅이 없는 표시 전용 모듈이라 "use client" 를 붙이지 않는다. 클라이언트 경계는
// 이 파일들을 쓰는 FrontierDashboard 한 곳에서만 연다.
// 목록 컴포넌트와 같은 상자 규격을 써서, 상태가 바뀌어도 화면이 튀지 않게 한다.

import type { AiFrontierSource } from "@/lib/types/ai-frontier-import"
import { cn } from "@/lib/utils"

import { frontierSourceLabel } from "./frontier-source"
import type { FrontierMobileSection } from "./frontier-view"

/** 두 목록은 화면 어디서든 이 순서로 나온다. */
export const SECTIONS: readonly FrontierMobileSection[] = ["episodes", "concepts"]

export const SECTION_LABEL: Record<FrontierMobileSection, string> = {
  episodes: "에피소드",
  concepts: "개념",
}

/** Andrej 액센트(purple)에 맞춘 공통 초점 링. */
export const frontierFocusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"

/**
 * 목록 위 필터 칩 한 벌. 개념 카테고리 필터와 소스 필터가 같은 규격을 쓴다.
 * 두 줄이 나란히 서는 자리라, 한쪽만 다른 여백/색을 쓰면 바로 티가 난다.
 */
export const frontierChipClass = cn(
  "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
  frontierFocusRing
)

export const frontierChipActiveClass =
  "border-purple-400/40 bg-purple-500/15 text-purple-700 dark:text-purple-200"

export const frontierChipIdleClass =
  "border-border bg-muted text-foreground/80 hover:border-muted-foreground/50 hover:text-foreground"

/**
 * 한국어 본문 줄바꿈 규칙. keep-all 로 어절을 통째로 지키고, 줄 하나에도 못 들어가는
 * 긴 라틴 토큰(모델명·URL)만 접는다. keep-all 만 쓰면 그런 토큰이 가로로 넘치고,
 * break-words 만 쓰면 "놀라운 변/화" 처럼 낱말 가운데가 갈린다.
 *
 * 서로 다른 CSS 속성(word-break / overflow-wrap)이지만 tailwind-merge 는 한 그룹으로 보고
 * 뒤엣것만 남긴다. 그래서 이 토큰은 cn() 이 아니라 문자열로 이어 붙인다.
 */
export const frontierProseClass = "break-keep break-words"

/** 칩 안의 숫자. 활성/비활성에 따라 대비만 낮춘다. */
export function frontierChipCountClass(active: boolean): string {
  return cn("num", active ? "text-purple-700/80 dark:text-purple-100/80" : "text-muted-foreground")
}

const cardClass = "rounded-xl border border-border bg-card p-4"

function RetryButton({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className={cn(
        "mt-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/70",
        frontierFocusRing
      )}
    >
      재시도
    </button>
  )
}

function PaneSkeleton({ section }: { readonly section: FrontierMobileSection }) {
  return (
    <div data-testid={`frontier-skeleton-${section}`} className={cn("space-y-1.5", cardClass)}>
      <div className="h-4 w-20 animate-pulse rounded bg-muted" />
      {[0, 1, 2].map((row) => (
        <div key={row} className="h-11 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  )
}

/**
 * 목록 자리를 미리 잡아 두어 데이터가 도착할 때 화면이 튀지 않게 한다.
 * 실제 목록 자리(frontier-columns)와 이름을 나눠 써서 서로 헷갈리지 않게 한다.
 */
export function FrontierSkeletonColumns() {
  return (
    <div data-testid="frontier-loading-columns" className="grid gap-3 md:grid-cols-2">
      {SECTIONS.map((section) => (
        <PaneSkeleton key={section} section={section} />
      ))}
    </div>
  )
}

/** 한쪽 Notion DB만 못 읽은 자리. 반대쪽 목록은 그대로 살아 있어야 한다. */
export function FrontierSourceError({
  section,
  onRetry,
}: {
  readonly section: FrontierMobileSection
  readonly onRetry: () => void
}) {
  return (
    <section data-testid={`frontier-error-${section}`} className={cardClass}>
      <h2 className="mb-2 text-sm font-semibold text-foreground">{SECTION_LABEL[section]}</h2>
      {/* 비어 있음과 못 읽음을 섞지 않는다. 이 자리는 언제나 "못 읽음"이다. */}
      <p className="text-xs leading-relaxed text-red-700 dark:text-red-300">{SECTION_LABEL[section]} 데이터를 불러오지 못했습니다.</p>
      <RetryButton onRetry={onRetry} />
    </section>
  )
}

/**
 * 응답 자체를 못 받은 경우. 소스별로 나눌 정보는 없지만, 제목만은 지금 열려 있는 탭의
 * 출처를 그대로 부른다 — Dwarkesh 를 보다 실패했는데 "AI Frontier" 가 뜨면 남의 실패로 읽힌다.
 */
export function FrontierIndexError({
  source,
  onRetry,
}: {
  readonly source: AiFrontierSource
  readonly onRetry: () => void
}) {
  return (
    <section data-testid="frontier-error-index" className={cardClass}>
      <h2 className="mb-2 text-sm font-semibold text-foreground">{frontierSourceLabel(source)}</h2>
      <p className="text-xs leading-relaxed text-red-700 dark:text-red-300">Frontier 데이터를 불러오지 못했습니다.</p>
      <RetryButton onRetry={onRetry} />
    </section>
  )
}
