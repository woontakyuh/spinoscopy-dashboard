"use client"

import { useState } from "react"
import { TopBar } from "@/components/layout/TopBar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PatientSearch } from "@/components/clinicus/PatientSearch"
import { PromForm } from "@/components/clinicus/PromForm"
import { PromDisplay } from "@/components/clinicus/PromDisplay"
import { NewCaseForm } from "@/components/clinicus/NewCaseForm"
import type { PatientSearchResult } from "@/lib/types/patient"

export default function ClinicusPage() {
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null)

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="🩺 Clinicus" />
      <div className="p-6 max-w-2xl">
        <Tabs defaultValue="prom">
          <TabsList className="bg-zinc-800 border border-zinc-700 mb-6">
            <TabsTrigger value="prom" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-zinc-400">
              PROM 입력
            </TabsTrigger>
            <TabsTrigger value="newcase" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-zinc-400">
              새 케이스
            </TabsTrigger>
            <TabsTrigger value="search" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-zinc-400">
              환자 조회
            </TabsTrigger>
          </TabsList>

          <TabsContent value="prom" className="space-y-4">
            <div className="space-y-4">
              <div>
                <p className="text-zinc-300 text-sm font-medium mb-2">환자 검색</p>
                <PatientSearch
                  onSelect={(p) => setSelectedPatient(p)}
                  selectedId={selectedPatient?.page_id}
                />
              </div>
              {selectedPatient && (
                <>
                  <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900">
                    <p className="text-zinc-300 text-sm font-medium mb-3">{selectedPatient.name} — PROM 요약</p>
                    <PromDisplay patient={selectedPatient} />
                  </div>
                  <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900">
                    <p className="text-zinc-300 text-sm font-medium mb-3">점수 입력</p>
                    <PromForm patient={selectedPatient} />
                  </div>
                </>
              )}
              {!selectedPatient && (
                <p className="text-zinc-500 text-sm text-center py-8">
                  환자를 검색하여 선택하면 PROM 입력 양식이 나타납니다.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="newcase">
            <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900">
              <NewCaseForm />
            </div>
          </TabsContent>

          <TabsContent value="search">
            <div className="space-y-4">
              <PatientSearch
                onSelect={(p) => {
                  window.open(p.url, "_blank")
                }}
              />
              <p className="text-zinc-500 text-xs text-center">클릭하면 Notion 페이지가 열립니다.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
