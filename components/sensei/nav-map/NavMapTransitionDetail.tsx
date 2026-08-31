import type { Position, Transition } from "@/lib/types/sensei"
import { EVIDENCE_KIND_LABELS } from "@/components/sensei/nav-map/nav-map-theme"

interface NavMapTransitionDetailProps {
  readonly transition: Transition
  readonly fromPosition: Position | null
  readonly toPosition: Position | null
  readonly onClose: () => void
}

export function NavMapTransitionDetail({
  transition,
  fromPosition,
  toPosition,
  onClose,
}: NavMapTransitionDetailProps) {
  return (
    <aside
      data-testid="navmap-transition-detail"
      className="w-full space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Transition
          </p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">
            {transition.action}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {fromPosition?.nameKr ?? transition.from}
            <span className="mx-1.5 text-orange-400">→</span>
            {toPosition?.nameKr ?? transition.to}
          </p>
        </div>
        <button
          type="button"
          aria-label="전이 상세 닫기"
          onClick={onClose}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ×
        </button>
      </div>

      {transition.condition && (
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/10 px-3 py-2">
          <p className="text-[10px] font-semibold text-orange-300">상황</p>
          <p className="mt-1 break-keep text-xs leading-5 text-foreground/85">
            {transition.condition}
          </p>
        </div>
      )}

      {transition.evidence && (
        <div className="space-y-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold text-cyan-300">
              내 기록 근거
            </p>
            <span className="text-[10px] text-cyan-200/80">
              {transition.evidence.count}회
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {transition.evidence.kinds.map((kind) => (
              <span
                key={kind}
                className="rounded-full border border-cyan-400/20 px-1.5 py-0.5 text-[9px] text-cyan-100/80"
              >
                {EVIDENCE_KIND_LABELS[kind]}
              </span>
            ))}
          </div>
          {transition.evidence.snippets.slice(0, 2).map((snippet) => (
            <p key={snippet} className="break-keep text-[10px] leading-4 text-foreground/70">
              {snippet}
            </p>
          ))}
        </div>
      )}

      {!transition.evidence && transition.source === "baseline" && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
          <p className="text-[10px] font-semibold text-foreground/80">기본 교본 연결</p>
          <p className="mt-1 break-keep text-[10px] leading-4 text-muted-foreground">
            수업 기록이 없어도 유지되는 기본 실선입니다. 관련 기록이 쌓이면 선 굵기와 근거가 강화됩니다.
          </p>
        </div>
      )}

      {!transition.evidence && transition.source === "stored" && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
          <p className="text-[10px] font-semibold text-foreground/80">내 전술맵 연결</p>
          <p className="mt-1 break-keep text-[10px] leading-4 text-muted-foreground">
            Notion에 저장된 연결입니다. 관련 수업 기록이 쌓이면 선 굵기와 근거가 강화됩니다.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 text-[10px]">
        <span className="rounded-full border border-border bg-muted px-2 py-1 text-muted-foreground">
          {transition.type}
        </span>
        <span className="rounded-full border border-border bg-muted px-2 py-1 text-muted-foreground">
          {transition.ruleSet === "common" ? "Gi · No-Gi" : transition.ruleSet}
        </span>
        {transition.lessonNumber && (
          <span className="rounded-full border border-border bg-muted px-2 py-1 text-muted-foreground">
            Lesson {transition.lessonNumber}
          </span>
        )}
      </div>

      {transition.videoUrl && (
        <a
          href={transition.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          관련 영상 보기 ↗
        </a>
      )}
    </aside>
  )
}
