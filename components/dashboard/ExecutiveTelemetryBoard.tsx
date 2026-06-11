"use client"

import { useQuery } from "@tanstack/react-query"
import type { AgentEvent, AgentId, TaskBoard, TaskSnapshot } from "@/lib/orchestrator/types"
import { ORCHESTRATOR_AGENT_IDS } from "@/lib/orchestrator/types"

interface TelemetryResponse {
  feed: AgentEvent[]
  approvals: AgentEvent[]
  lanes: Record<AgentId, AgentEvent[]>
  tasks: TaskBoard
  memoryBoundary: {
    sharedCoreCount: number
    sharedCoreLatestUpdatedAt: string | null
    personaCounts: Record<AgentId, { count: number; latestUpdatedAt: string | null }>
    personaNamespaceReady: boolean
  } | null
  memoryError: string | null
}

const AGENT_META: Record<AgentId, { label: string; border: string; text: string }> = {
  dakota: { label: "Dakota", border: "border-cyan-500/30", text: "text-cyan-300" },
  elon: { label: "Elon", border: "border-emerald-500/30", text: "text-emerald-300" },
  brian: { label: "Brian", border: "border-blue-500/30", text: "text-blue-300" },
  lo: { label: "Lo", border: "border-orange-500/30", text: "text-orange-300" },
  warren: { label: "Warren", border: "border-amber-500/30", text: "text-amber-300" },
  andrej: { label: "Andrej", border: "border-purple-500/30", text: "text-purple-300" },
}

const KIND_LABELS: Record<AgentEvent["kind"], string> = {
  received: "수신",
  delegated: "위임",
  analyzed: "분석",
  reported: "보고",
  proposed: "제안",
  approved: "승인",
  executed: "실행",
  blocked: "차단",
  failed: "실패",
  summarized: "요약",
}

const STATUS_LABELS: Record<AgentEvent["status"], string> = {
  pending: "대기",
  in_progress: "진행",
  completed: "완료",
  blocked: "막힘",
  cancelled: "취소",
}

function formatTs(ts: string | null | undefined): string {
  if (!ts) return "-"
  try {
    return new Date(ts).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  } catch {
    return ts
  }
}

function getStatusTone(task: TaskSnapshot): string {
  if (task.blocked) return "border-red-500/30 bg-red-500/10"
  if (task.requiresApproval) return "border-amber-500/30 bg-amber-500/10"
  if (task.status === "in_progress") return "border-cyan-500/30 bg-cyan-500/10"
  if (task.status === "pending") return "border-zinc-700 bg-zinc-950/70"
  return "border-emerald-500/20 bg-emerald-500/10"
}

function TaskCard({ task }: { task: TaskSnapshot }) {
  const meta = AGENT_META[task.currentAgent] ?? AGENT_META[task.agent]
  return (
    <div className={`rounded-xl border p-3 ${getStatusTone(task)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold ${meta.text}`}>{meta.label}</span>
            <span className="text-[11px] text-zinc-400">{STATUS_LABELS[task.status]}</span>
            {task.requiresApproval && <span className="text-[11px] text-amber-300">승인 대기</span>}
            {task.blocked && <span className="text-[11px] text-red-300">막힘</span>}
          </div>
          <h3 className="mt-1 text-sm font-medium text-white break-words">{task.title}</h3>
        </div>
        <span className="shrink-0 text-[11px] text-zinc-500">{formatTs(task.updatedAt)}</span>
      </div>

      <div className="mt-3 space-y-2 text-xs text-zinc-300">
        <p><span className="text-zinc-500">요청</span> · {task.requestedSummary}</p>
        {task.latestSummary !== task.requestedSummary && (
          <p><span className="text-zinc-500">현재</span> · {task.latestSummary}</p>
        )}
        {task.resultSummary && (
          <p><span className="text-zinc-500">결과</span> · {task.resultSummary}</p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
        <span>{task.channel}</span>
        <span>·</span>
        <span>{KIND_LABELS[task.latestKind]}</span>
        <span>·</span>
        <span>이벤트 {task.eventCount}건</span>
        {task.artifactType && (
          <>
            <span>·</span>
            <span>{task.artifactType}</span>
          </>
        )}
      </div>
    </div>
  )
}

function TaskSection({ title, subtitle, tasks }: { title: string; subtitle: string; tasks: TaskSnapshot[] }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-white font-semibold">{title}</h2>
          <p className="text-zinc-500 text-xs mt-1">{subtitle}</p>
        </div>
        <span className="text-[11px] text-zinc-500">{tasks.length}건</span>
      </div>

      <div className="mt-4 space-y-3">
        {tasks.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/60 px-4 py-6 text-sm text-zinc-500">
            현재 표시할 항목 없음
          </div>
        )}
        {tasks.map((task) => <TaskCard key={task.taskId} task={task} />)}
      </div>
    </div>
  )
}

function EventChip({ event }: { event: AgentEvent }) {
  const meta = AGENT_META[event.agent]
  return (
    <div className={`rounded-xl border bg-zinc-900/70 p-3 ${meta.border}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-xs font-semibold ${meta.text}`}>{meta.label}</span>
          <span className="text-[11px] text-zinc-500">{KIND_LABELS[event.kind]}</span>
        </div>
        <span className="text-[11px] text-zinc-500 shrink-0">{formatTs(event.ts)}</span>
      </div>
      <p className="mt-1 text-sm text-zinc-100 whitespace-pre-wrap break-words">{event.summary}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
        <span>{STATUS_LABELS[event.status]}</span>
        <span>·</span>
        <span>{event.channel}</span>
        {event.requiresApproval && (
          <>
            <span>·</span>
            <span className="text-amber-300">승인 필요</span>
          </>
        )}
      </div>
    </div>
  )
}

export function ExecutiveTelemetryBoard() {
  const { data, isLoading, error } = useQuery<TelemetryResponse>({
    queryKey: ["executive-telemetry-board"],
    queryFn: async () => {
      const res = await fetch("/api/orchestrator/telemetry", { cache: "no-store" })
      if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new Error(body || `telemetry 조회 실패 (${res.status})`)
      }
      return res.json()
    },
    refetchInterval: 15000,
  })

  const activeTasks = data?.tasks.active ?? []
  const blockedTasks = data?.tasks.blocked ?? []
  const completedTasks = data?.tasks.recentCompleted ?? []

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-gradient-to-r from-violet-500/40 to-transparent" />
        <span className="text-zinc-500 text-xs tracking-wider uppercase">Executive OS</span>
        <div className="h-px flex-1 bg-gradient-to-l from-violet-500/40 to-transparent" />
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          telemetry 로딩 실패: {error instanceof Error ? error.message : "unknown error"}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4">
        <div className="space-y-4">
          <TaskSection title="Work Queue" subtitle="무엇을 시켰고 지금 어디까지 갔는지" tasks={activeTasks} />
          <TaskSection title="Recently Completed" subtitle="방금 끝난 일과 결과" tasks={completedTasks} />
        </div>

        <div className="space-y-4">
          <TaskSection title="Approval Queue" subtitle="센터장님 승인 대기" tasks={data?.tasks.awaitingApproval ?? []} />
          <TaskSection title="Blocked" subtitle="현재 막힌 일" tasks={blockedTasks} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-white font-semibold">Dakota Executive Feed</h2>
              <p className="text-zinc-500 text-xs mt-1">원시 이벤트 로그 / 디버깅용</p>
            </div>
            <span className="text-[11px] text-zinc-500">최근 {data?.feed.length ?? 0}건</span>
          </div>

          <div className="mt-4 space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {isLoading && Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 animate-pulse h-24" />
            ))}
            {!isLoading && (data?.feed.length ?? 0) === 0 && (
              <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/60 px-4 py-8 text-sm text-zinc-500 text-center">
                아직 이벤트가 없습니다. Telegram 또는 대시보드 대화가 들어오면 여기부터 쌓입니다.
              </div>
            )}
            {data?.feed.map((event) => <EventChip key={event.id} event={event} />)}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <div>
            <h2 className="text-white font-semibold">Legacy Approval Events</h2>
            <p className="text-zinc-500 text-xs mt-1">이벤트 기준 승인 로그</p>
          </div>
          <div className="mt-4 space-y-3">
            {!isLoading && (data?.approvals.length ?? 0) === 0 && (
              <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/60 px-4 py-6 text-sm text-zinc-500">
                현재 승인 이벤트 없음
              </div>
            )}
            {data?.approvals.map((event) => <EventChip key={event.id} event={event} />)}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
        <div>
          <h2 className="text-white font-semibold">Agent Lane Board</h2>
          <p className="text-zinc-500 text-xs mt-1">agent별 최근 이벤트 / 막힘 확인</p>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {ORCHESTRATOR_AGENT_IDS.map((agent) => {
            const lane = data?.lanes?.[agent] ?? []
            const meta = AGENT_META[agent]
            return (
              <div key={agent} className={`rounded-xl border bg-zinc-950/70 p-3 ${meta.border}`}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className={`font-medium ${meta.text}`}>{meta.label}</h3>
                  <span className="text-[11px] text-zinc-500">{lane.length}건</span>
                </div>

                <div className="mt-3 space-y-2">
                  {lane.length === 0 && (
                    <div className="rounded-lg border border-dashed border-zinc-800 px-3 py-4 text-xs text-zinc-500">
                      아직 기록 없음
                    </div>
                  )}
                  {lane.map((event) => (
                    <div key={event.id} className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] text-zinc-400">{KIND_LABELS[event.kind]}</span>
                        <span className="text-[11px] text-zinc-500">{formatTs(event.ts)}</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-200 whitespace-pre-wrap break-words">{event.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
