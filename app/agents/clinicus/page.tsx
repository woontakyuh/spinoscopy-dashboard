"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { TopBar } from "@/components/layout/TopBar"
import { AgentGreeter } from "@/components/layout/AgentGreeter"
import { PatientSearch } from "@/components/clinicus/PatientSearch"
import { PatientDetail } from "@/components/clinicus/PatientDetail"
import { ClinicsAnalytics } from "@/components/clinicus/ClinicsAnalytics"
import { IdeaMemo } from "@/components/clinicus/IdeaMemo"
import { PatientProfileView } from "@/components/clinicus/PatientProfileView"
import type { PatientSearchResult } from "@/lib/types/patient"
import { getTimeContext } from "@/lib/greeterContext"
import type { MemoDraft } from "@/lib/types/draft"

const TABS = [
  { id: "analytics", label: "통계", icon: "📊" },
  { id: "search", label: "환자 조회", icon: "🔍" },
  { id: "memo", label: "메모", icon: "💡" },
] as const

type ClinicusTab = (typeof TABS)[number]["id"]

interface AnalyticsRow { op_date: string | null }
interface AnalyticsData { patients: AnalyticsRow[] }

export default function ClinicusPage() {
  const [activeTab, setActiveTab] = useState<ClinicusTab>("analytics")
  const [searchPatient, setSearchPatient] = useState<PatientSearchResult | null>(null)

  const { data, isLoading: isAnalyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ["clinicus-greeter"],
    queryFn: async () => {
      const res = await fetch("/api/notion/analytics")
      if (!res.ok) throw new Error("환자 데이터 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: drafts, isLoading: isDraftsLoading } = useQuery<MemoDraft[]>({
    queryKey: ["clinicus-drafts"],
    queryFn: async () => {
      const res = await fetch("/api/notion/drafts")
      if (!res.ok) throw new Error("메모 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const patients = data?.patients ?? []
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const recent = patients.filter((p) => p.op_date && p.op_date.slice(0, 10) >= weekAgo).length

  function getMessageForTab(tab: ClinicusTab): string {
    const tc = getTimeContext()

    if (tab === "search") {
      if (patients.length > 0) {
        return `Tak, ${patients.length}명 DB에 있어. 누구 찾아?`
      }
      return "Tak, 환자 데이터 불러오고 있어."
    }

    if (tab === "memo") {
      if (drafts && drafts.length > 0) {
        const latest = drafts[0]
        return `Tak, 메모 ${drafts.length}건 쌓여 있어. 가장 최근 건 "${latest.title}" — 마무리하자.`
      }
      if (drafts && drafts.length === 0) {
        return "Tak, 아이디어 떠오르면 바로 메모해. 나중에 정리해줄게."
      }
      return "Tak, 메모 불러오고 있어."
    }

    // analytics 탭 — patients 기반 + 시간맥락
    if (patients.length === 0) return "Tak, 환자 데이터 불러오고 있어. 잠깐만."
    if (tc.bucket === "night" || tc.bucket === "dawn") {
      return "Tak, 이 시간에도 데이터 보는 거야? 내일 아침에 하자."
    }
    if (tc.isMondayMorning) {
      return `Tak, 새 주 시작이야. 이번 주 수술 일정부터 확인하지. 이번 주 새로 ${recent}건 들어왔어.`
    }
    if (recent === 0) return `Tak, 누적 ${patients.length}명. 이번 주는 신규 없었어. 기존 환자 PROM 추이 한번 훑어보자.`
    if (recent >= 5) return `Tak, 이번 주 ${recent}건 새로 들어왔어. 바빴겠다. 새 케이스 PROM 빠뜨리지 마.`
    return `Tak, 이번 주 새로 ${recent}건 들어왔어. 가장 최근 건부터 — PROM 아직 안 넣었으면 지금 하자.`
  }

  const message = getMessageForTab(activeTab)
  const isTabLoading =
    (activeTab === "analytics" && isAnalyticsLoading) ||
    (activeTab === "search" && isAnalyticsLoading) ||
    (activeTab === "memo" && isDraftsLoading)

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
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 p-3 md:p-6">
        <AgentGreeter image="/opdb.png" name="Op DB" message={message} loading={isTabLoading} />

        {activeTab === "analytics" && <ClinicsAnalytics />}

        {activeTab === "search" && (
          <div className="space-y-4">
            <div>
              <p className="text-foreground/90 text-sm font-medium mb-2">환자 검색</p>
              <PatientSearch
                onSelect={(p) => setSearchPatient(p)}
                selectedId={searchPatient?.page_id}
              />
            </div>
            {searchPatient ? (
              <div className="space-y-4">
                <div className="border border-border rounded-xl p-4 bg-card">
                  <PatientDetail
                    patient={searchPatient}
                    onOpenNotion={() => window.open(searchPatient.url, "_blank")}
                  />
                </div>
                <PatientProfileView pageId={searchPatient.page_id} />
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">
                환자를 검색하여 선택하면 PROM 요약과 그래프가 표시됩니다.
              </p>
            )}
          </div>
        )}

        {activeTab === "memo" && <IdeaMemo />}
      </div>
    </div>
  )
}
