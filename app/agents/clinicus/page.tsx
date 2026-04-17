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
    if (tab === "search") {
      if (patients.length > 0) {
        return `선생님, 현재 ${patients.length}명 등록돼 있어요. 이름이나 수술명으로 검색해보세요.`
      }
      return "선생님, 환자 데이터를 불러오고 있어요."
    }
    if (tab === "memo") {
      if (drafts && drafts.length > 0) {
        const latest = drafts[0]
        return `선생님, 메모 ${drafts.length}건 있어요. 최근 건: "${latest.title}".`
      }
      if (drafts && drafts.length === 0) {
        return "선생님, 아직 메모가 없어요. 임상 아이디어 떠오르면 남겨두세요."
      }
      return "선생님, 메모 불러오고 있어요."
    }
    // analytics 탭 — patients 기반
    if (patients.length === 0) return "환자 데이터 불러오고 있습니다. 잠시만요, 선생님."
    if (recent === 0) return `누적 ${patients.length}명. 최근 1주일은 신규 케이스 없었어요. 기존 환자분들 PROM 추이 한번 훑어보시죠.`
    if (recent >= 5) return `이번 주 ${recent}건 새로 들어왔어요. 바쁘셨겠어요. 새 케이스 PROM 입력 빠뜨리지 마시구요.`
    return `누적 ${patients.length}명, 이번 주 +${recent}건이에요. 새 환자분들 차트 정리부터 도와드릴까요?`
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
