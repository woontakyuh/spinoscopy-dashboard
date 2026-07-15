"use client"

const KNOWLEDGE_LANES = [
  {
    title: "Notion",
    subtitle: "현재형 운영 DB",
    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    items: ["일정", "할 일", "환자", "연구 상태", "리뷰어 업무"],
    rule: "지금 무엇을 해야 하는가를 남깁니다.",
  },
  {
    title: "Obsidian",
    subtitle: "장기 의미 / 전략 / 시스템 설계",
    tone: "border-violet-500/30 bg-violet-500/10 text-violet-200",
    items: ["Agent OS", "전략 원칙", "강의/논문 synthesis", "SpineTrack/KSOR 큰 그림"],
    rule: "왜 이 판단을 했고 다음에 어떻게 재사용할지를 남깁니다.",
  },
  {
    title: "Memory",
    subtitle: "짧고 안정적인 사실",
    tone: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
    items: ["사용자 선호", "발음/말투", "기본 캘린더", "안정적 환경 사실"],
    rule: "다음 세션에도 항상 알아야 할 최소 사실만 남깁니다.",
  },
  {
    title: "Skills",
    subtitle: "반복 가능한 SOP",
    tone: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    items: ["브리핑 절차", "문서 처리", "검증 루틴", "반복 자동화"],
    rule: "다시 실행할 수 있는 절차와 검증 방법을 남깁니다.",
  },
] as const

const PROMOTION_CANDIDATES = [
  {
    label: "Agent federation 운영 원칙",
    destination: "Obsidian / Agent_OS",
    reason: "Dakota 아래 specialist들이 병렬로 움직이기 위한 장기 설계 원칙",
  },
  {
    label: "Dashboard ERP = spinoscopy-dashboard Dakota 탭",
    destination: "Project rule / Memory",
    reason: "별도 앱으로 분산하지 않기 위한 고정 원칙",
  },
  {
    label: "Morning briefing 실패 복구 절차",
    destination: "Skill",
    reason: "반복 가능한 운영 장애 대응 SOP 후보",
  },
] as const

export function KnowledgeInbox() {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-[0.18em] text-violet-300/80">Knowledge Inbox</p>
          <h2 className="text-lg font-semibold text-white">Notion과 Obsidian을 2중 입력하지 않기 위한 분류함</h2>
          <p className="text-sm text-zinc-400">
            같은 내용을 두 군데에 쓰지 않고, 상태는 Notion에, 해석은 Obsidian에, 반복 절차는 Skill에 보냅니다.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {KNOWLEDGE_LANES.map((lane) => (
          <div key={lane.title} className={`rounded-2xl border p-4 ${lane.tone}`}>
            <div>
              <h3 className="font-semibold text-white">{lane.title}</h3>
              <p className="text-xs opacity-80 mt-1">{lane.subtitle}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {lane.items.map((item) => (
                <span key={item} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-zinc-100">
                  {item}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-zinc-200/90">{lane.rule}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">승격 후보</h2>
            <p className="text-xs text-zinc-500 mt-1">Dakota가 장기 저장소로 보낼지 판단해야 하는 항목</p>
          </div>
          <span className="text-[11px] text-zinc-500">1차 정적 큐</span>
        </div>

        <div className="mt-4 space-y-3">
          {PROMOTION_CANDIDATES.map((candidate) => (
            <div key={candidate.label} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium text-white">{candidate.label}</h3>
                <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-200">
                  {candidate.destination}
                </span>
              </div>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">{candidate.reason}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
