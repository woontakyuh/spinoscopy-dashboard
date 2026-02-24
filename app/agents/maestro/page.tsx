"use client"

import { TopBar } from "@/components/layout/TopBar"
import { PresentationList } from "@/components/maestro/PresentationList"

export default function MaestroPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="🎓 Maestro" />
      <div className="p-3 md:p-6 max-w-4xl w-full">
        <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900 mb-6">
          <p className="text-zinc-400 text-sm">
            학회 발표 일정과 준비 상태를 한 눈에 확인하세요.
          </p>
        </div>
        <PresentationList />
      </div>
    </div>
  )
}
