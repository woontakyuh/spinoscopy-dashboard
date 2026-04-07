"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { TopBar } from "@/components/layout/TopBar"
import { AgentGreeter } from "@/components/layout/AgentGreeter"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PatientSearch } from "@/components/clinicus/PatientSearch"
import { PatientDetail } from "@/components/clinicus/PatientDetail"
import { ClinicsAnalytics } from "@/components/clinicus/ClinicsAnalytics"
import { IdeaMemo } from "@/components/clinicus/IdeaMemo"
import { PatientProfileView } from "@/components/clinicus/PatientProfileView"
import type { PatientSearchResult } from "@/lib/types/patient"

interface AnalyticsRow { op_date: string | null }
interface AnalyticsData { patients: AnalyticsRow[] }

export default function ClinicusPage() {
  const [searchPatient, setSearchPatient] = useState<PatientSearchResult | null>(null)

  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["clinicus-greeter"],
    queryFn: async () => {
      const res = await fetch("/api/notion/analytics")
      if (!res.ok) throw new Error("환자 데이터 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const patients = data?.patients ?? []
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const recent = patients.filter((p) => p.op_date && p.op_date.slice(0, 10) >= weekAgo).length
  let message: string
  if (patients.length === 0) {
    message = "환자 데이터 불러오고 있습니다. 잠시만요, 선생님."
  } else if (recent === 0) {
    message = `누적 ${patients.length}명. 최근 1주일은 신규 케이스 없었어요. 기존 환자분들 PROM 추이 한번 훑어보시죠.`
  } else if (recent >= 5) {
    message = `이번 주 ${recent}건 새로 들어왔어요. 바쁘셨겠어요. 새 케이스 PROM 입력 빠뜨리지 마시구요.`
  } else {
    message = `누적 ${patients.length}명, 이번 주 +${recent}건이에요. 새 환자분들 차트 정리부터 도와드릴까요?`
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="" />
      <div className="p-3 md:p-6 max-w-7xl w-full">
        <AgentGreeter image="/opdb.png" name="Op DB" message={message} loading={isLoading} />
        <Tabs defaultValue="analytics">
          <TabsList className="w-full bg-muted border border-border mb-4 md:mb-6 grid grid-cols-3 h-auto gap-1 p-1">
            <TabsTrigger value="analytics" className="min-h-9 data-[state=active]:bg-violet-600 data-[state=active]:text-white text-muted-foreground text-xs md:text-sm">
              📊 통계
            </TabsTrigger>
            <TabsTrigger value="search" className="min-h-9 data-[state=active]:bg-blue-600 data-[state=active]:text-white text-muted-foreground text-xs md:text-sm">
              환자 조회
            </TabsTrigger>
            <TabsTrigger value="memo" className="min-h-9 data-[state=active]:bg-amber-600 data-[state=active]:text-white text-muted-foreground text-xs md:text-sm">
              💡 메모
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analytics">
            <ClinicsAnalytics />
          </TabsContent>

          <TabsContent value="search" className="space-y-4">
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
          </TabsContent>

          <TabsContent value="memo">
            <IdeaMemo />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
