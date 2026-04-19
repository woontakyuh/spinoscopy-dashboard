"use client"

// Phase 1: 7-card placeholder grid. Phase 2에서 실제 데이터 채움.
//   1. Character preview (radar + belt + closest archetype)
//   2. Current Focus block (progress bar)
//   3. NavMap preview (lit nodes)
//   4. Next target competition (countdown)
//   5. Recent training (3 세션)
//   6. Recent concept notes (3 노트)
//   7. Medical exclusions rail (하단)

export function HomeOverview({
  goTo,
}: {
  goTo?: (tab: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card title="Character" onClick={() => goTo?.("character")}>
          <Placeholder label="radar · belt · archetype" />
        </Card>
        <Card title="Current Focus" onClick={() => goTo?.("navmap")}>
          <Placeholder label="block N progress · 누적 세션" />
        </Card>
        <Card title="NavMap" onClick={() => goTo?.("navmap")}>
          <Placeholder label="lit nodes preview" />
        </Card>
        <Card title="Next Target" onClick={() => goTo?.("competitions")}>
          <Placeholder label="countdown · title · status" />
        </Card>
        <Card title="Recent Training" onClick={() => goTo?.("training")}>
          <Placeholder label="최근 3 세션" />
        </Card>
        <Card title="Recent Concepts" onClick={() => goTo?.("concepts")}>
          <Placeholder label="최근 3 노트 · type 배지" />
        </Card>
      </div>
      <div className="rounded-xl border border-[#993C1D]/25 bg-[#FAECE7]/5 px-4 py-3">
        <div className="flex items-start gap-2">
          <span className="text-[11px] font-semibold tracking-wider text-[#993C1D] uppercase shrink-0 mt-0.5">
            Medical
          </span>
          <p className="text-[13px] text-foreground/80 leading-relaxed">
            Medical exclusions 섹션 Phase 2에서 Player Profile 파싱해 연결.
          </p>
        </div>
      </div>
    </div>
  )
}

function Card({
  title,
  onClick,
  children,
}: {
  title: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-border bg-card/50 p-4 text-left hover:bg-muted/40 transition-colors"
    >
      <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase mb-2">
        {title}
      </h3>
      {children}
    </button>
  )
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="space-y-2">
      <div className="h-14 rounded-lg bg-muted/50 border border-dashed border-border/60 flex items-center justify-center">
        <span className="text-[11px] text-muted-foreground/70">{label}</span>
      </div>
      <p className="text-[10px] text-muted-foreground/60">Phase 2 데이터 연결 예정</p>
    </div>
  )
}
