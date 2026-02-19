import { TopBar } from "@/components/layout/TopBar"
import { MorningBriefing } from "@/components/dashboard/MorningBriefing"

export default function DashboardPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Dashboard" />
      <div className="flex-1 p-6 max-w-3xl">
        <MorningBriefing />
      </div>
    </div>
  )
}
