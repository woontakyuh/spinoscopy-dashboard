"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Play, Search, X } from "lucide-react"
import {
  PHASE_LABEL,
  PHASE_ORDER,
  ROLE_LABEL,
  formatClock,
  matchesQuery,
  reelIndex,
  scenesByPosition,
  type ReelPhase,
  type ReelScene,
} from "@/lib/reel"

const ROLE_STYLE: Record<"bottom" | "top", string> = {
  bottom: "border-blue-400/40 bg-blue-500/15 text-blue-200",
  top: "border-purple-400/40 bg-purple-500/15 text-purple-200",
}

function SceneRow({ scene }: { readonly scene: ReelScene }) {
  const [open, setOpen] = useState(false)

  return (
    <li className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-muted/50"
      >
        <ChevronDown
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
          aria-hidden="true"
        />
        {scene.role && (
          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${ROLE_STYLE[scene.role]}`}>
            {ROLE_LABEL[scene.role]}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{scene.title}</span>
        {scene.phase && (
          <span className="hidden shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            {PHASE_LABEL[scene.phase]}
          </span>
        )}
        <span className="hidden shrink-0 text-[10px] tabular-nums text-muted-foreground sm:inline">
          {scene.date.slice(2)}
        </span>
        {scene.reelUrl && (
          <a
            href={scene.reelUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="shrink-0 text-orange-300 transition hover:text-orange-200"
            aria-label={`${scene.title} 영상 열기`}
          >
            <Play className="size-3.5" aria-hidden="true" />
          </a>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 pl-9">
          {scene.quote && (
            <p className="whitespace-pre-line border-l-2 border-border pl-2.5 text-xs leading-6 text-foreground/80">
              {scene.quote}
            </p>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">
            {scene.date} · {scene.reelTitle} 릴 #{String(scene.no).padStart(2, "0")} · 원본 {scene.src} {formatClock(scene.ss)} ({scene.dur}초)
          </p>
        </div>
      )}
    </li>
  )
}

export function VideoWikiView() {
  const positions = useMemo(() => scenesByPosition(), [])
  const [selected, setSelected] = useState<string | null>(positions[0]?.slug ?? null)
  const [query, setQuery] = useState("")
  const [role, setRole] = useState<"bottom" | "top" | null>(null)
  const [phase, setPhase] = useState<ReelPhase | null>(null)

  const visiblePositions = useMemo(
    () =>
      positions
        .map((position) => ({
          ...position,
          scenes: position.scenes.filter(
            (scene) =>
              (role === null || scene.role === role) &&
              (phase === null || scene.phase === phase) &&
              matchesQuery(scene, query, position.name),
          ),
        }))
        .filter((position) => position.scenes.length > 0),
    [positions, query, role, phase],
  )

  const active =
    visiblePositions.find((position) => position.slug === selected) ?? visiblePositions[0] ?? null

  // 한 장면이 기술 여러 개에 걸릴 수 있어 중복을 제거하고 센다
  const totalScenes = new Set(
    visiblePositions.flatMap((p) => p.scenes.map((scene) => `${scene.date}-${scene.no}`)),
  ).size
  const phasesInUse = PHASE_ORDER.filter((p) =>
    positions.some((position) => position.scenes.some((scene) => scene.phase === p)),
  )

  return (
    <section className="mx-auto mt-4 w-full max-w-[1520px] space-y-3 sm:mt-5">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-400">
            Video wiki
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">영상 위키</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            날짜가 아니라 기술로 찾아. 각 장면은 수업 정리 릴의 한 컷이고 관장님 육성이 붙어 있어.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border bg-card px-3 py-1.5">
            기술 {visiblePositions.length}종
          </span>
          <span className="rounded-full border border-border bg-card px-3 py-1.5">
            장면 {totalScenes}개
          </span>
        </div>
      </header>

      {/* 검색 + 필터 */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="기술·문장 검색"
            aria-label="장면 검색"
            className="w-56 rounded-full border border-border bg-card py-1.5 pl-8 pr-7 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-orange-400/50"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="검색어 지우기"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex gap-1">
          {(["bottom", "top"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setRole(role === key ? null : key)}
              aria-pressed={role === key}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                role === key ? ROLE_STYLE[key] : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {ROLE_LABEL[key]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          {phasesInUse.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPhase(phase === key ? null : key)}
              aria-pressed={phase === key}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                phase === key
                  ? "border-orange-400/50 bg-orange-500/15 text-orange-200"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {PHASE_LABEL[key]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(14rem,1fr)_minmax(0,2.6fr)]">
        {/* 기술 목록 */}
        <nav className="rounded-xl border border-border bg-card p-2" aria-label="기술 목록">
          {visiblePositions.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              조건에 맞는 장면이 없어.
            </p>
          )}
          <ul className="max-h-[32rem] space-y-0.5 overflow-y-auto">
            {visiblePositions.map((position) => {
              const isActive = active?.slug === position.slug
              return (
                <li key={position.slug}>
                  <button
                    type="button"
                    onClick={() => setSelected(position.slug)}
                    aria-current={isActive}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                      isActive
                        ? "bg-orange-500/15 text-orange-100"
                        : "text-foreground/80 hover:bg-muted/60"
                    }`}
                  >
                    <span className="break-keep">{position.name}</span>
                    <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                      {position.scenes.length}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* 선택한 기술의 장면들 */}
        <div className="space-y-2">
          {active ? (
            <>
              <div className="flex items-baseline justify-between gap-2 px-1">
                <h3 className="text-base font-semibold text-foreground">{active.name}</h3>
                <span className="text-xs text-muted-foreground">{active.scenes.length}장면</span>
              </div>
              <ul className="overflow-hidden rounded-xl border border-border bg-card">
                {active.scenes.map((scene) => (
                  <SceneRow key={`${scene.date}-${scene.no}`} scene={scene} />
                ))}
              </ul>
            </>
          ) : (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">
              조건에 맞는 장면이 없어.
            </div>
          )}
        </div>
      </div>

      <p className="px-1 text-[10px] text-muted-foreground">
        BJJ 리포의 릴 스펙에서 자동 생성 · 갱신 {reelIndex.generatedAt}
      </p>
    </section>
  )
}
