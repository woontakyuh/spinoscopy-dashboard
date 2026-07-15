"use client"

import { useQuery } from "@tanstack/react-query"
import { OrchestratorChat } from "@/components/dashboard/OrchestratorChat"
import { ExecutiveTelemetryBoard } from "@/components/dashboard/ExecutiveTelemetryBoard"
import type { AgentId, TaskBoard } from "@/lib/orchestrator/types"
import { KnowledgeInbox } from "./KnowledgeInbox"

interface TelemetrySummaryResponse {
  tasks: TaskBoard
  feed: unknown[]
  memoryBoundary: {
    sharedCoreCount: number
    personaCounts: Record<AgentId, { count: number; latestUpdatedAt: string | null }>
    personaNamespaceReady: boolean
  } | null
  memoryError: string | null
}

const SYSTEM_CARDS = [
  {
    label: "Front Door",
    value: "Dakota",
    detail: "Telegram / Dashboard 요청을 Dakota가 받아 specialist에게 라우팅",
    tone: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  },
  {
    label: "Execution",
    value: "Hermes + Dashboard",
    detail: "agent event, approval queue, Notion/Calendar/Patient/Research API를 실행 계층으로 사용",
    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  },
  {
    label: "Knowledge",
    value: "Notion + Obsidian",
    detail: "Notion은 운영 DB, Obsidian은 장기 synthesis와 Agent OS 지식 저장소",
    tone: "border-violet-500/30 bg-violet-500/10 text-violet-200",
  },
] as const

function countTasks(tasks: TaskBoard | undefined): { active: number; blocked: number; approvals: number; completed: number } {
  return {
    active: tasks?.active.length ?? 0,
    blocked: tasks?.blocked.length ?? 0,
    approvals: tasks?.awaitingApproval.length ?? 0,
    completed: tasks?.recentCompleted.length ?? 0,
  }
}

export function DakotaCommandCenter() {
  const { data, error } = useQuery<TelemetrySummaryResponse>({
    queryKey: ["dakota-command-center-summary"],
    queryFn: async () => {
      const res = await fetch("/api/orchestrator/telemetry", { cache: "no-store" })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    refetchInterval: 15000,
  })

  const taskCounts = countTasks(data?.tasks)
  const specialistMemoryCount = data?.memoryBoundary
    ? Object.values(data.memoryBoundary.personaCounts).reduce((sum, row) => sum + row.count, 0)
    : 0

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-zinc-900 to-zinc-950 p-5">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Dakota Command Center</p>
            <h1 className="mt-2 text-2xl md:text-3xl font-semibold text-white">센터장님의 개인 ERP는 여기서 커집니다.</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-300 leading-relaxed">
              이 탭은 별도 dashboard가 아니라 기존 spinoscopy-dashboard 안의 Dakota layer입니다. Dakota가 front door로 받고,
              Elon · Brian · Andrej · Warren · Lo가 병렬 참모로 움직이며, 결과는 다시 Dakota가 통합합니다.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2">
              <p className="text-lg font-semibold text-cyan-200">{taskCounts.active}</p>
              <p className="text-[11px] text-zinc-500">진행</p>
            </div>
            <div className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2">
              <p className="text-lg font-semibold text-amber-200">{taskCounts.approvals}</p>
              <p className="text-[11px] text-zinc-500">승인</p>
            </div>
            <div className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2">
              <p className="text-lg font-semibold text-red-200">{taskCounts.blocked}</p>
              <p className="text-[11px] text-zinc-500">막힘</p>
            </div>
            <div className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2">
              <p className="text-lg font-semibold text-emerald-200">{taskCounts.completed}</p>
              <p className="text-[11px] text-zinc-500">완료</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        {SYSTEM_CARDS.map((card) => (
          <div key={card.label} className={`rounded-2xl border p-4 ${card.tone}`}>
            <p className="text-[11px] uppercase tracking-[0.16em] opacity-75">{card.label}</p>
            <h2 className="mt-1 font-semibold text-white">{card.value}</h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-200/90">{card.detail}</p>
          </div>
        ))}
      </section>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Dakota command summary 로딩 실패: {error instanceof Error ? error.message : "unknown error"}
        </div>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-4">
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
            <h2 className="font-semibold text-white">Command Input</h2>
            <p className="text-xs text-zinc-500 mt-1 mb-4">Dakota가 요청을 받아 적절한 specialist로 라우팅합니다.</p>
            <OrchestratorChat />
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
            <h2 className="font-semibold text-white">Memory Boundary</h2>
            <p className="text-xs text-zinc-500 mt-1">shared core와 specialist local memory가 섞이지 않는지 보는 경계입니다.</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                <p className="text-zinc-500 text-xs">Shared Core</p>
                <p className="mt-1 text-xl font-semibold text-cyan-200">{data?.memoryBoundary?.sharedCoreCount ?? "-"}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                <p className="text-zinc-500 text-xs">Specialist Local</p>
                <p className="mt-1 text-xl font-semibold text-violet-200">{data?.memoryBoundary ? specialistMemoryCount : "-"}</p>
              </div>
            </div>
            {data?.memoryError && <p className="mt-3 text-xs text-amber-300">Memory 조회 제한: {data.memoryError}</p>}
          </div>
        </div>

        <KnowledgeInbox />
      </section>

      <ExecutiveTelemetryBoard />
    </div>
  )
}
