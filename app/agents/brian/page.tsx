"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { TopBar } from "@/components/layout/TopBar"
import { AgentChat } from "@/components/layout/AgentChat"
import { MyPapers } from "@/components/scholar/MyPapers"
import { PaperDB } from "@/components/scholar/PaperDB"
import { ResearchPipeline } from "@/components/scholar/ResearchPipeline"
import { Editorial } from "@/components/scholar/Editorial"
// 출판 논문 통계는 Research DB (status Published / Accepted) 에서 직접 derive.
const TAK_NAME = "여운탁"
import type { JournalStats } from "@/lib/types/journal"
import type { ResearchProject } from "@/lib/types/research"
import { dday } from "@/lib/greeterContext"
import type { EditorialItem } from "@/lib/types/editorial"
import { isPendingMyAction, isSubmittedAwaiting } from "@/lib/editorial/status"
import { isTakWorking, isWaitingOnJournal, isResearchTerminal } from "@/lib/research/status"

const TABS = [
  { id: "browse", label: "UpToDate", icon: "📚" },
  { id: "my-papers", label: "My Papers", icon: "📄" },
  { id: "research", label: "My Research", icon: "🔬" },
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
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  const { data: research, isLoading: isResearchLoading } = useQuery<ResearchProject[]>({
    queryKey: ["research-projects"],
    queryFn: async () => {
      const res = await fetch("/api/notion/research")
      if (!res.ok) throw new Error("연구 조회 실패")
      return res.json()
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  const { data: editorial, isLoading: isEditorialLoading } = useQuery<EditorialItem[]>({
    queryKey: ["editorial-items"],
    queryFn: async () => {
      const res = await fetch("/api/notion/editorial")
      if (!res.ok) throw new Error("심사 조회 실패")
      return res.json()
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
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

      // ── 내가 펜을 들고 있는 작업 ──
      const working = research.filter(isTakWorking)
      const revisionList = working.filter((r) => r.status === "Revision")
      const draftingList = working.filter((r) => r.status === "Drafting" || r.status === "Editing")
      const ideaList = working.filter((r) => r.status === "Idea" || r.status === "Lit Review")

      // ── 저널 응답 대기 ──
      const waiting = research.filter(isWaitingOnJournal)

      // 우선순위: Revision (마감 있을 가능성) → Drafting → Idea → Waiting → Terminal
      if (revisionList.length > 0) {
        const r = revisionList[0]
        // editorial 급한 게 함께 있으면 cross-reference
        if (editorial) {
          const editorialUrgent = editorial.filter(isPendingMyAction).filter((e) => {
            if (!e.deadline) return false
            const d = dday(e.deadline)
            return d >= 0 && d <= 7
          }).length
          if (editorialUrgent > 0) {
            return `여교수, "${r.title}" Revision 받으셨고, 심사 원고도 ${editorialUrgent}편 밀려 있네. Revision부터 치우게.`
          }
        }
        return `여교수, "${r.title}" Revision 받으셨네. 리뷰어 코멘트 정리부터 같이 볼까.`
      }
      if (draftingList.length > 0) {
        const d = draftingList[0]
        return `여교수, "${d.title}" ${d.status} 단계군. 한 번에 다 끝내려 하지 말고 섹션 하나씩 가세.`
      }
      if (waiting.length > 0 && working.length === 0) {
        // 내 손에 있는 작업 없이 전부 저널 대기만 있을 때
        return `여교수, 펜에 든 게 없군. 저널 답 기다리는 ${waiting.length}편, 그동안 다음 주제 굴려보세.`
      }
      if (ideaList.length > 0) {
        return `여교수, Idea·Lit Review 단계 ${ideaList.length}편 있네. 그중 하나 골라서 본격적으로 굴려보세.`
      }
      const recentTerminal = research.filter(isResearchTerminal).length
      if (recentTerminal > 0) {
        return `여교수, 완료된 ${recentTerminal}편 외에 진행 중인 게 없군. 새 주제 잡아볼 때야.`
      }
      return `여교수, 진행 중인 논문이 ${research.length}편이군. 새 주제 하나 잡아볼 때도 됐네.`
    }

    if (tab === "my-papers") {
      if (!research) return "여교수, 출판 목록 불러오고 있네. 잠깐만."
      const publishedOrAccepted = research.filter((p) => p.status === "Published" || p.status === "Accepted")
      const inPress = publishedOrAccepted.filter((p) => p.status === "Accepted").length
      const total = publishedOrAccepted.length
      const thisYear = publishedOrAccepted.filter((p) => {
        const y = p.publish_date?.slice(0, 4) ?? p.start_date?.slice(0, 4)
        return y === String(CURRENT_YEAR)
      })
      const firstAuthor = publishedOrAccepted.filter((p) => p.first_author.includes(TAK_NAME)).length

      if (inPress > 0) {
        return `여교수, In Press 가 ${inPress}편 있네 — 곧 출판될 거고, 누적 ${total}편이야. 꾸준히 쌓이고 있어.`
      }
      if (thisYear.length > 0) {
        return `여교수, 올해 벌써 ${thisYear.length}편 나갔군. 총 ${total}편, 꾸준히 쌓이고 있어.`
      }
      return `여교수, 지금까지 ${total}편 출판했네. 1저자 ${firstAuthor}편이야. 다음 거 준비해볼까.`
    }

    // editorial — pending (내 액션) vs awaiting (편집자 결정 대기 + 저자 수정 중) 분리
    if (!editorial) return "여교수, 심사 목록 불러오고 있네. 잠깐만 기다리게."
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
    const pending = editorial.filter(isPendingMyAction)
    const awaiting = editorial.filter(isSubmittedAwaiting)
    const overdue = pending.filter((e) => e.deadline && e.deadline < todayStr)
    const urgentEditorial = pending.filter((e) => {
      if (!e.deadline || e.deadline < todayStr) return false
      const d = dday(e.deadline)
      return d <= 7
    })

    // 1) 마감 지난 pending 이 최우선
    if (overdue.length > 0) {
      const first = overdue[0]
      const d = first.deadline ? Math.abs(dday(first.deadline)) : 0
      return `여교수, "${first.name}" 심사 마감이 ${d}일 지났네. 이건 빨리 처리하세.`
    }
    // 2) 일주일 내 마감
    if (urgentEditorial.length > 0) {
      const first = urgentEditorial[0]
      const d = first.deadline ? dday(first.deadline) : 0
      return `여교수, "${first.name}" 심사가 D-${d}일이야. 이번 주 안에 끝내게.`
    }
    // 3) 처리할 pending 이 있긴 한데 여유 있을 때
    if (pending.length > 0) {
      return `여교수, 처리할 심사 ${pending.length}편 있네. 여유 있을 때 보세${awaiting.length > 0 ? `. 따로 ${awaiting.length}편은 진행 중 (편집자·저자 대기) 이고.` : "."}`
    }
    // 4) pending 없고 awaiting 만 있는 경우 — 닦달 X, 정보 전달만
    if (awaiting.length > 0) {
      return `여교수, 처리할 심사는 없고 진행 중인 ${awaiting.length}편이 편집자·저자 측에서 굴러가는 중이네. 손 비었으니 다른 거 하세.`
    }
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
        <AgentChat agentId="brian" image="/brian.png" name="Brian" greeting={isTabLoading ? "..." : message} />

        {activeTab === "browse" && <PaperDB />}
        {activeTab === "research" && <ResearchPipeline />}
        {activeTab === "my-papers" && <MyPapers />}
        {activeTab === "editorial" && <Editorial />}
      </div>
    </div>
  )
}
