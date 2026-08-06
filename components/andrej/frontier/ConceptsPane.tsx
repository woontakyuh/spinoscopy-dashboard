"use client"

// AI Frontier Concepts 목록 패널.
// 데이터 fetch/전역 상태를 갖지 않는다. 필터링된 concepts와 콜백만 받아 렌더링한다.

import { useState } from "react"

import type { AiFrontierConcept, AiFrontierEpisodeRef } from "@/lib/types/ai-frontier"
import { cn } from "@/lib/utils"

import type { FrontierCategoryCount } from "./frontier-view"

export interface ConceptsPaneProps {
  /** 이미 검색/카테고리 필터가 적용된 목록 */
  readonly concepts: AiFrontierConcept[]
  readonly categoryCounts: FrontierCategoryCount[]
  readonly currentCategory: string | null
  readonly selectedConceptId: string | null
  readonly onCategoryChange: (category: string | null) => void
  readonly onEpisodeNavigate: (ref: AiFrontierEpisodeRef) => void
}

/** Notion 텍스트는 공백만 남는 경우가 있어, 표시 전에 비어 있음으로 접는다. */
function trimmed(value: string | null): string | null {
  if (value === null) return null
  const next = value.trim()
  return next === "" ? null : next
}

const chipBase =
  "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"

function CategoryChips({
  counts,
  current,
  onChange,
}: {
  readonly counts: FrontierCategoryCount[]
  readonly current: string | null
  readonly onChange: (category: string | null) => void
}) {
  return (
    <div data-testid="frontier-category-chips" className="flex flex-wrap gap-1.5">
      <button
        type="button"
        aria-pressed={current === null}
        onClick={() => onChange(null)}
        className={cn(
          chipBase,
          current === null
            ? "border-purple-400/40 bg-purple-500/15 text-purple-200"
            : "border-zinc-700 bg-zinc-900/70 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
        )}
      >
        전체
      </button>

      {counts.map(({ category, count }) => {
        const active = category === current
        return (
          <button
            key={category}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(category)}
            className={cn(
              chipBase,
              active
                ? "border-purple-400/40 bg-purple-500/15 text-purple-200"
                : "border-zinc-700 bg-zinc-900/70 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
            )}
          >
            {category}{" "}
            <span className={cn("num", active ? "text-purple-100/80" : "text-zinc-400")}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

function EpisodeChip({
  episodeRef,
  onNavigate,
}: {
  readonly episodeRef: AiFrontierEpisodeRef
  readonly onNavigate: (ref: AiFrontierEpisodeRef) => void
}) {
  // orphan 참조도 숨기지 않는다. 자료가 실제로 끊겨 있다는 사실 자체가 정보다.
  if (!episodeRef.available) {
    return (
      <button
        type="button"
        disabled
        className={cn(chipBase, "cursor-not-allowed border-zinc-800 bg-zinc-900/50 text-zinc-500")}
      >
        {episodeRef.ref} · 현재 DB에 없음
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onNavigate(episodeRef)}
      className={cn(
        chipBase,
        "border-purple-400/40 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20"
      )}
    >
      {episodeRef.ref}
    </button>
  )
}

function DetailBlock({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="text-xs leading-relaxed text-zinc-200">{value}</p>
    </div>
  )
}

function ConceptCard({
  concept,
  expanded,
  onToggle,
  onEpisodeNavigate,
}: {
  readonly concept: AiFrontierConcept
  readonly expanded: boolean
  readonly onToggle: () => void
  readonly onEpisodeNavigate: (ref: AiFrontierEpisodeRef) => void
}) {
  const korean = trimmed(concept.korean)
  const category = trimmed(concept.category)
  const verified = trimmed(concept.verified)
  const oneLine = trimmed(concept.oneLine)
  const intuition = trimmed(concept.intuition)
  const whyItMatters = trimmed(concept.whyItMatters)
  const source = trimmed(concept.source)

  const regionId = `concept-detail-${concept.id}`
  const termId = `concept-term-${concept.id}`

  return (
    <li
      className={cn(
        "rounded-lg border bg-muted transition-colors",
        expanded ? "border-purple-400/35" : "border-border"
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={onToggle}
        className="w-full rounded-lg px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
      >
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span id={termId} className="text-sm font-semibold text-foreground">
            {concept.term}
          </span>
          {korean !== null && <span className="text-xs text-zinc-300">{korean}</span>}
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {category !== null && (
            <span className="rounded border border-purple-400/30 bg-purple-500/10 px-1.5 py-0.5 text-[11px] text-purple-200">
              {category}
            </span>
          )}
          {verified !== null && (
            // Verified는 사실 검증이 아니라 출처 라벨이므로 초록 계열을 쓰지 않는다.
            <span
              data-testid={`concept-verified-${concept.id}`}
              className="rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1 text-[11px] text-zinc-300"
            >
              {verified}
            </span>
          )}
        </span>

        {oneLine !== null && (
          <span
            data-testid={`concept-oneline-${concept.id}`}
            className={cn(
              "mt-1 block text-xs leading-relaxed text-muted-foreground",
              "text-zinc-300",
              !expanded && "line-clamp-2"
            )}
          >
            {oneLine}
          </span>
        )}
      </button>

      {concept.episodes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {concept.episodes.map((episodeRef) => (
            <EpisodeChip
              key={`${episodeRef.ref}-${episodeRef.pageId ?? "orphan"}`}
              episodeRef={episodeRef}
              onNavigate={onEpisodeNavigate}
            />
          ))}
        </div>
      )}

      {expanded && (
        <div
          id={regionId}
          role="region"
          aria-labelledby={termId}
          className="space-y-2 border-t border-border px-3 py-2"
        >
          {intuition !== null && <DetailBlock label="Intuition" value={intuition} />}
          {whyItMatters !== null && <DetailBlock label="Why It Matters" value={whyItMatters} />}
          {source !== null && <DetailBlock label="Source" value={source} />}
        </div>
      )}
    </li>
  )
}

export function ConceptsPane({
  concepts,
  categoryCounts,
  currentCategory,
  selectedConceptId,
  onCategoryChange,
  onEpisodeNavigate,
}: ConceptsPaneProps) {
  const [expandedId, setExpandedId] = useState<string | null>(selectedConceptId)
  const [syncedSelection, setSyncedSelection] = useState<string | null>(selectedConceptId)

  // cross-link으로 선택이 바뀌면 그 개념을 펼친 채로 보여준다(렌더 중 상태 조정).
  if (selectedConceptId !== syncedSelection) {
    setSyncedSelection(selectedConceptId)
    setExpandedId(selectedConceptId)
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Concepts</h2>
        <CategoryChips counts={categoryCounts} current={currentCategory} onChange={onCategoryChange} />
      </div>

      {concepts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          표시할 개념이 없습니다.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {concepts.map((concept) => (
            <ConceptCard
              key={concept.id}
              concept={concept}
              expanded={concept.id === expandedId}
              onToggle={() => setExpandedId((current) => (current === concept.id ? null : concept.id))}
              onEpisodeNavigate={onEpisodeNavigate}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
