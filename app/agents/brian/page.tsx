"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { TopBar } from "@/components/layout/TopBar"
import { AgentGreeter } from "@/components/layout/AgentGreeter"
import { MyPapers } from "@/components/scholar/MyPapers"
import { PaperDB } from "@/components/scholar/PaperDB"
import { ResearchPipeline } from "@/components/scholar/ResearchPipeline"
import { Editorial } from "@/components/scholar/Editorial"
import { MY_PAPERS } from "@/lib/data/my-papers"
import type { JournalStats } from "@/lib/types/journal"
import type { ResearchProject } from "@/lib/types/research"
import { dday } from "@/lib/greeterContext"
import type { EditorialItem } from "@/lib/types/editorial"
import { isActive } from "@/lib/editorial/status"

const TABS = [
  { id: "browse", label: "UpToDate", icon: "📚" },
  { id: "research", label: "My Research", icon: "🔬" },
  { id: "my-papers", label: "My Papers", icon: "📄" },
  { id: "editorial", label: "Editorial", icon: "✏️" },
] as const

type ScholarTab = (typeof TABS)[number]["id"]

const CURRENT_YEAR = new Date().getFullYear()

export default function ScholarPage() {
  const [activeTab, setActiveTab] = useState<ScholarTab>("browse")

  const { data: stats, isLoading: isStatsLoading } = useQuery<JournalStats>({
    queryKey: ["journal", "stats"],
    queryFn: async () => {
      const res = await fetch("/api/notion/journal?action=stats")
      if (!res.ok) throw new Error("통계 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: research, isLoading: isResearchLoading } = useQuery<ResearchProject[]>({
    queryKey: ["research-projects"],
    queryFn: async () => {
      const res = await fetch("/api/notion/research")
      if (!res.ok) throw new Error("연구 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: editorial, isLoading: isEditorialLoading } = useQuery<EditorialItem[]>({
    queryKey: ["editorial-items"],
    queryFn: async () => {
      const res = await fetch("/api/notion/editorial")
      if (!res.ok) throw new Error("심사 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // ─── 탭별 메시지 ───
  function getMessageForTab(tab: ScholarTab): string {
    if (tab === "browse") {
      if (!stats) return "여교수, 최신 저널들 좀 정리해두고 있네. 흥미로운 게 있으면 짚어주겠네."
      if (stats.recent_week === 0) {
        return `여교수, 이번 주엔 새로 들어온 게 없군. 그동안 모아둔 ${stats.total}편 중에 다시 들여다볼 만한 거 찾아볼까.`
      } else if (stats.recent_week >= 10) {
        return `여교수, 이번 주 ${stats.recent_week}편이나 올라왔네. 풍년이야 — spine 쪽 핵심부터 같이 보세.`
      } else {
        return `여교수, 이번 주 새 논문 ${stats.recent_week}편 들어왔네. 몇 편 눈여겨볼 만한 게 있던데, 한번 훑어보게.`
      }
    }

    if (tab === "research") {
      if (!research || research.length === 0) return "여교수, 연구 프로젝트 불러오고 있네. 잠깐만."
      const revisionList = research.filter((r) => r.status === "Revision")
      const revision = revisionList.length
      const submitted = research.filter((r) => r.status === "Submitted" || r.status === "2nd Review").length
      const accepted = research.filter((r) => r.status === "Accepted").length
      const drafting = research.filter((r) => r.status === "Drafting" || r.status === "Editing").length
      const idea = research.filter((r) => r.status === "Idea" || r.status === "Lit Review").length

      // 크로스 참조: revision 급하면서 editorial에도 급한 게 있는 경우
      if (revision > 0 && editorial) {
        const activeEditorial = editorial.filter((e) => isActive(e.status))
        const editorialUrgent = activeEditorial.filter((e) => {
          if (!e.deadline) return false
          const d = dday(e.deadline)
          return d >= 0 && d <= 7
        }).length
        if (editorialUrgent > 0) {
          const revTitle = revisionList[0].title ?? "Revision"
          return `여교수, "${revTitle}" Revision이 급하고, 심사 원고도 ${editorialUrgent}편 밀려 있네. Revision부터 치우게.`
        }
        return `여교수, Revision 중인 논문 ${revision}편 있던데, 마감 챙기게. 리뷰어 코멘트 한번 같이 보겠나?`
      }
      if (revision > 0) return `여교수, Revision 중인 논문 ${revision}편 있던데, 마감 챙기게. 리뷰어 코멘트 한번 같이 보겠나?`
      if (submitted > 0) return `여교수, Submitted 상태가 ${submitted}편이군. 결과 기다리는 게 제일 길지. 그동안 다음 거 준비해두세.`
      if (accepted > 0) return `여교수, Accepted ${accepted}편 — 축하하네. 잘하고 있어.`
      if (drafting > 0) return `여교수, Drafting 단계 ${drafting}편 있네. 막히는 부분 있으면 같이 보세.`
      if (idea > 0) return `여교수, Idea·Lit Review 단계가 ${idea}편이군. 그중 하나 골라서 본격적으로 굴려보는 건 어떤가.`
      return `여교수, 진행 중인 논문이 ${research.length}편이군. 새 주제 하나 잡아볼 때도 됐네.`
    }

    if (tab === "my-papers") {
      const thisYear = MY_PAPERS.filter((p) => p.year === CURRENT_YEAR)
      const firstAuthor = MY_PAPERS.filter((p) => p.role === "1st").length
      if (thisYear.length > 0) {
        return `여교수, 올해 벌써 ${thisYear.length}편 나갔군. 총 ${MY_PAPERS.length}편, 꾸준히 쌓이고 있어.`
      }
      return `여교수, 지금까지 ${MY_PAPERS.length}편 출판했네. 1저자 ${firstAuthor}편이야. 다음 거 준비해볼까.`
    }

    // editorial — API 기반 + 구체적 건명
    if (!editorial) return "여교수, 심사 목록 불러오고 있네. 잠깐만 기다리게."
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
    const active = editorial.filter((e) => isActive(e.status))
    const overdue = active.filter((e) => e.deadline && e.deadline < todayStr)
    const urgentEditorial = active.filter((e) => {
      if (!e.deadline || e.deadline < todayStr) return false
      const d = dday(e.deadline)
      return d <= 7
    })
    if (overdue.length > 0) {
      const first = overdue[0]
      const d = first.deadline ? Math.abs(dday(first.deadline)) : 0
      return `여교수, "${first.name}" 심사 마감이 ${d}일 지났네. 이건 빨리 처리하세.`
    }
    if (urgentEditorial.length > 0) {
      const first = urgentEditorial[0]
      const d = first.deadline ? dday(first.deadline) : 0
      return `여교수, "${first.name}" 심사가 D-${d}일이야. 이번 주 안에 끝내게.`
    }
    if (active.length > 0) return `여교수, 심사 중인 원고 ${active.length}편이야. 여유 있을 때 한번 보게.`
    return "여교수, 지금은 심사 요청 들어온 게 없군. 한가할 때 즐기게."
  }

  const message = getMessageForTab(activeTab)
  const isTabLoading =
    (activeTab === "browse" && isStatsLoading) ||
    (activeTab === "research" && isResearchLoading) ||
    (activeTab === "editorial" && isEditorialLoading)

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="" />

      {/* Tabs */}
      <div className="border-b border-border bg-background sticky top-0 z-10 overflow-x-auto">
        <div className="flex gap-0.5 px-3 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap
                ${activeTab === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground/90"}
              `}
            >
              <span className="flex items-center gap-1.5">
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </span>
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 p-3 md:p-6">
        <AgentGreeter image="/brian.png" name="Brian" message={message} loading={isTabLoading} />

        {activeTab === "browse" && <PaperDB />}
        {activeTab === "research" && <ResearchPipeline />}
        {activeTab === "my-papers" && <MyPapers />}
        {activeTab === "editorial" && <Editorial />}
      </div>
    </div>
  )
}
