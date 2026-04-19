"use client"

// Phase 1: persistent banner placeholder. Phase 2에서 Player Profile
// "Working hypothesis" 섹션 파싱해서 실제 문구 주입.

export function WorkingHypothesisBanner({ text }: { text?: string }) {
  const body =
    text ??
    "Working hypothesis 로드 중… (Player Profile 파서 Phase 2 연결)"

  return (
    <div className="rounded-xl border border-[#1D9E75]/30 bg-[#0F6E56]/10 px-4 py-3 mb-4">
      <div className="flex items-start gap-2">
        <span className="text-[11px] font-semibold tracking-wider text-[#1D9E75] uppercase shrink-0 mt-0.5">
          Hypothesis
        </span>
        <p className="text-[13px] text-foreground/90 leading-relaxed">{body}</p>
      </div>
    </div>
  )
}
