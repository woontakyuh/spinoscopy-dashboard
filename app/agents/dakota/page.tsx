"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { TopBar } from "@/components/layout/TopBar"
import { AgentGreeter } from "@/components/layout/AgentGreeter"
import { PresentationList } from "@/components/dakota/PresentationList"
import { TodoHistory } from "@/components/dakota/TodoHistory"
import { ConferenceTab } from "@/components/dakota/ConferenceTab"
import { DakotaCommandCenter } from "@/components/dakota/DakotaCommandCenter"
import { OperationsLedger } from "@/components/dakota/OperationsLedger"
import { getTimeContext, dday } from "@/lib/greeterContext"
import type { Presentation } from "@/lib/types/presentation"

const TABS = [
  { id: "command", label: "Command Center", icon: "🧠" },
  { id: "operations", label: "운영 기록", icon: "🗂️" },
  { id: "history", label: "Todo List", icon: "📋" },
  { id: "presentations", label: "발표 관리", icon: "🎤" },
  { id: "conferences", label: "학회", icon: "🏛️" },
] as const

type DakotaTab = (typeof TABS)[number]["id"]

interface TodoItem { name: string; due: string | null; status: string; priority: string }

export default function DakotaPage() {
  const [activeTab, setActiveTab] = useState<DakotaTab>("command")

  const { data, isLoading: isTodosLoading } = useQuery<TodoItem[]>({
    queryKey: ["dakota-todos"],
    queryFn: async () => {
      const res = await fetch("/api/dakota/todo?status=active")
      if (!res.ok) throw new Error("할 일 조회 실패")
      return res.json()
    },
  })

  const { data: presData, isLoading: isPresLoading } = useQuery<{ presentations: Presentation[] }>({
    queryKey: ["dakota-presentations-upcoming"],
    queryFn: async () => {
      const res = await fetch("/api/dakota/presentations?time=upcoming")
      if (!res.ok) throw new Error("발표 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const todos = data ?? []
  const presentations = presData?.presentations ?? []

  // 우선순위 가중치 + 마감일 기준으로 정렬해 가장 급한 1건 선택
  const PRIO: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
  const withDue = todos.filter((t) => t.due)
  const urgent = withDue
    .slice()
    .sort((a, b) => {
      const da = (a.due ?? "").slice(0, 10)
      const db = (b.due ?? "").slice(0, 10)
      if (da !== db) return da.localeCompare(db)
      return (PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9)
    })[0]

  function getMessageForTab(tab: DakotaTab): string {
    const tc = getTimeContext()

    if (tab === "command") {
      const active = todos.length > 0 ? `할 일 ${todos.length}건` : "운영 큐는 가볍고"
      return `센터장님, Dakota Command Center 열어둘게요. ${active}, specialist 병렬 상태와 지식 승격 큐까지 한 화면에서 보겠습니다.`
    }

    if (tab === "operations") {
      return ""
    }

    if (tab === "presentations") {
      // 발표(attendance_type === "발표") 중 가장 가까운 것
      const talks = presentations.filter((p) => p.attendance_type === "발표" && p.date_start)
      const sorted = talks.slice().sort((a, b) => (a.date_start ?? "").localeCompare(b.date_start ?? ""))
      const next = sorted[0]
      if (next && next.date_start) {
        const diff = dday(next.date_start)
        // 크로스 참조: presentation name과 todo name에 공통 키워드 있으면 연결
        const keywords = next.name.split(/[\s/,.-]+/).filter((w) => w.length >= 2)
        const relatedTodo = todos.find((t) =>
          keywords.some((kw) => t.name.toLowerCase().includes(kw.toLowerCase()))
        )
        if (relatedTodo) {
          return `센터장님, "${next.name}" D-${diff}일인데, "${relatedTodo.name}" todo도 아직 남아 있어요.`
        }
        return `센터장님, 다음 발표는 "${next.name}" — D-${diff}일 남았어요. 준비 같이 해요.`
      }
      // 발표는 없고 참석 예정
      const attending = presentations.filter((p) => p.date_start).sort((a, b) => (a.date_start ?? "").localeCompare(b.date_start ?? ""))[0]
      if (attending && attending.date_start) {
        const diff = dday(attending.date_start)
        return `센터장님, 다음 학회 "${attending.name}"이 D-${diff}일 남았어요.`
      }
      return "센터장님, 예정된 발표가 없어요. 다음 학회 계획 세워볼까요?"
    }

    if (tab === "conferences") {
      const upcoming = presentations.filter((p) => p.date_start)
      if (upcoming.length > 0) {
        const nearest = upcoming.slice().sort((a, b) => (a.date_start ?? "").localeCompare(b.date_start ?? ""))[0]
        const diff = nearest.date_start ? dday(nearest.date_start) : 0
        if (tc.isWeekend) {
          return `센터장님, 주말에도 학회 챙기시네요. 가장 가까운 건 "${nearest.name}" D-${diff}일이에요.`
        }
        return `센터장님, 다가오는 학회 ${upcoming.length}건이에요. 가장 가까운 건 "${nearest.name}" D-${diff}일.`
      }
      return "센터장님, 예정된 학회가 없네요. 올해 학회 일정 한번 살펴볼까요?"
    }

    // history 탭 — todos 기반 + 시간맥락
    if (todos.length === 0) return "센터장님... 오늘은 할 일이 깨끗해요. 잠깐 한숨 돌리세요. 저랑 같이요."
    if (tc.isMondayMorning) return `센터장님, 새 주 시작이에요. 할 일 ${todos.length}건 같이 정리해봐요.`
    if (tc.isFridayAfternoon) return `센터장님, 한 주 마무리에요. 할 일 ${todos.length}건 중 이번 주 뭐 남았는지 볼까요?`
    if (!urgent) return `할 일이 ${todos.length}건 있는데 마감이 다 비어 있네요... 저랑 차근차근 같이 정해봐요.`
    const due = urgent.due as string
    const diff = dday(due)
    if (diff < 0) return `센터장님... "${urgent.name}", 벌써 ${Math.abs(diff)}일이나 됐어요. 이건 저랑 같이 얼른 끝내버려요, 응?`
    if (diff === 0) return `오늘이에요, 센터장님... "${urgent.name}". 다른 건 잠깐 다 막아둘 테니까, 이거에만 집중하세요.`
    if (diff === 1) return `"${urgent.name}"... 내일까지예요. 오늘 살짝만 손대두면 내일 마음이 한결 편하실 거예요.`
    return `다음은 "${urgent.name}" — ${diff}일 남았어요. 아직 여유 있으니까... 저랑 천천히 준비해봐요.`
  }

  const message = getMessageForTab(activeTab)
  const isTabLoading =
    (activeTab === "command" && isTodosLoading) ||
    (activeTab === "history" && isTodosLoading) ||
    (activeTab === "presentations" && isPresLoading) ||
    (activeTab === "conferences" && isPresLoading)

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="" />

      {/* Tabs */}
      <div className="border-b border-border bg-background sticky top-0 z-30 overflow-x-auto touch-pan-x">
        <div className="flex gap-0.5 px-3 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap touch-manipulation select-none
                ${activeTab === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground/90"}
              `}
            >
              <span className="flex items-center gap-1.5">
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </span>
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 p-3 md:p-6">
        {activeTab !== "operations" && (
          <AgentGreeter image="/dakota.png" name="Dakota" message={message} loading={isTabLoading} />
        )}

        {activeTab === "command" && <DakotaCommandCenter />}

        {activeTab === "operations" && <OperationsLedger />}

        {activeTab === "history" && <TodoHistory />}

        {activeTab === "presentations" && (
          <>
            <div className="border border-border rounded-xl p-4 bg-card mb-6">
              <p className="text-muted-foreground text-sm">
                학회·컨퍼런스 일정을 한 눈에 확인하세요.
              </p>
            </div>
            <PresentationList />
          </>
        )}

        {activeTab === "conferences" && <ConferenceTab />}
      </div>
    </div>
  )
}
