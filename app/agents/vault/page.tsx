"use client"

import { TopBar } from "@/components/layout/TopBar"
import { VaultDashboard } from "@/components/vault/VaultDashboard"

export default function VaultPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Warren" icon="/warren.png" />
      <div className="p-3 md:p-6 max-w-4xl w-full">
        <div className="border border-border rounded-xl p-4 bg-card mb-4">
          <p className="text-foreground/90 text-sm">
            주요 자산 시세와 시장 지표를 실시간으로 추적하고, 관련 뉴스를 확인합니다.
          </p>
        </div>
        <VaultDashboard />
      </div>
    </div>
  )
}
