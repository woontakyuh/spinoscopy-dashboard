"use client"

import { TopBar } from "@/components/layout/TopBar"
import { SenseiCapture } from "@/components/sensei/SenseiCapture"

export default function SenseiPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="🥋 Sensei" />
      <div className="p-3 md:p-6 max-w-4xl w-full">
        <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900 mb-4">
          <p className="text-zinc-300 text-sm">
            자연어로 수련 내용을 입력하면 Sensei가 Notion 태그(Class/Sparring)까지 자동으로 정리해서 저장합니다.
          </p>
        </div>
        <SenseiCapture />
      </div>
    </div>
  )
}
