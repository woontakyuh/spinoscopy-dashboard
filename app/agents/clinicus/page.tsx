"use client"

import { useState } from "react"
import { TopBar } from "@/components/layout/TopBar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PatientSearch } from "@/components/clinicus/PatientSearch"
import { PromForm } from "@/components/clinicus/PromForm"
import { PromDisplay } from "@/components/clinicus/PromDisplay"
import { PromChart } from "@/components/clinicus/PromChart"
import { PatientDetail } from "@/components/clinicus/PatientDetail"
import { NewCaseForm } from "@/components/clinicus/NewCaseForm"
import { ClinicsAnalytics } from "@/components/clinicus/ClinicsAnalytics"
import { IdeaMemo } from "@/components/clinicus/IdeaMemo"
import { PatientProfileView } from "@/components/clinicus/PatientProfileView"
import { useQuery } from "@tanstack/react-query"
import type { PatientSearchResult } from "@/lib/types/patient"

function PromTabContent({ patient }: { patient: PatientSearchResult }) {
  const { data: promRecord } = useQuery({
    queryKey: ["prom", patient.page_id],
    queryFn: async () => {
      const res = await fetch(`/api/notion/patients?pageId=${patient.page_id}`)
      if (!res.ok) throw new Error("PROM 조회 실패")
      return res.json() as Promise<Record<string, string>>
    },
  })

  return (
    <>
      <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900">
        <p className="text-zinc-300 text-sm font-medium mb-3">{patient.name} — 환산 점수</p>
        <PromDisplay patient={patient} />
      </div>

      {promRecord && (
        <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900">
          <p className="text-zinc-300 text-sm font-medium mb-3">추이 그래프</p>
          <PromChart promRecord={promRecord} />
        </div>
      )}

      <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900">
        <p className="text-zinc-300 text-sm font-medium mb-3">점수 입력</p>
        <PromForm patient={patient} />
      </div>
    </>
  )
}

export default function ClinicusPage() {
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null)
  const [searchPatient, setSearchPatient] = useState<PatientSearchResult | null>(null)

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="🩺 Clinicus" />
      <div className="p-3 md:p-6 max-w-7xl w-full">
        <Tabs defaultValue="analytics">
          <TabsList className="w-full bg-zinc-800 border border-zinc-700 mb-4 md:mb-6 grid grid-cols-2 md:grid-cols-5 h-auto gap-1 p-1">
            <TabsTrigger value="analytics" className="min-h-9 data-[state=active]:bg-violet-600 data-[state=active]:text-white text-zinc-400 text-xs md:text-sm">
              📊 통계
            </TabsTrigger>
            <TabsTrigger value="search" className="min-h-9 data-[state=active]:bg-blue-600 data-[state=active]:text-white text-zinc-400 text-xs md:text-sm">
              환자 조회
            </TabsTrigger>
            <TabsTrigger value="newcase" className="min-h-9 data-[state=active]:bg-blue-600 data-[state=active]:text-white text-zinc-400 text-xs md:text-sm">
              새 케이스
            </TabsTrigger>
            <TabsTrigger value="prom" className="min-h-9 data-[state=active]:bg-blue-600 data-[state=active]:text-white text-zinc-400 text-xs md:text-sm">
              PROM 입력
            </TabsTrigger>
            <TabsTrigger value="memo" className="min-h-9 data-[state=active]:bg-amber-600 data-[state=active]:text-white text-zinc-400 text-xs md:text-sm">
              💡 메모
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analytics">
            <ClinicsAnalytics />
          </TabsContent>

          <TabsContent value="search" className="space-y-4">
            <div>
              <p className="text-zinc-300 text-sm font-medium mb-2">환자 검색</p>
              <PatientSearch
                onSelect={(p) => setSearchPatient(p)}
                selectedId={searchPatient?.page_id}
              />
            </div>
            {searchPatient ? (
              <div className="space-y-4">
                <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900">
                  <PatientDetail
                    patient={searchPatient}
                    onOpenNotion={() => window.open(searchPatient.url, "_blank")}
                  />
                </div>
                <PatientProfileView pageId={searchPatient.page_id} />
              </div>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-8">
                환자를 검색하여 선택하면 PROM 요약과 그래프가 표시됩니다.
              </p>
            )}
          </TabsContent>

          <TabsContent value="newcase">
            <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900">
              <NewCaseForm />
            </div>
          </TabsContent>

          <TabsContent value="prom" className="space-y-4">
            <div>
              <p className="text-zinc-300 text-sm font-medium mb-2">환자 검색</p>
              <PatientSearch
                onSelect={(p) => setSelectedPatient(p)}
                selectedId={selectedPatient?.page_id}
              />
            </div>
            {selectedPatient ? (
              <PromTabContent patient={selectedPatient} />
            ) : (
              <p className="text-zinc-500 text-sm text-center py-8">
                환자를 검색하여 선택하면 PROM 입력 양식이 나타납니다.
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
