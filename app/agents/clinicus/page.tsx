"use client"

import { useState } from "react"
import { TopBar } from "@/components/layout/TopBar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PatientSearch } from "@/components/clinicus/PatientSearch"
import { PatientDetail } from "@/components/clinicus/PatientDetail"
import { ClinicsAnalytics } from "@/components/clinicus/ClinicsAnalytics"
import { IdeaMemo } from "@/components/clinicus/IdeaMemo"
import { PatientProfileView } from "@/components/clinicus/PatientProfileView"
import type { PatientSearchResult } from "@/lib/types/patient"

export default function ClinicusPage() {
  const [searchPatient, setSearchPatient] = useState<PatientSearchResult | null>(null)

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Op DB" icon="/opdb.png" />
      <div className="p-3 md:p-6 max-w-7xl w-full">
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
