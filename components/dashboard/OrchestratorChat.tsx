"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"

type AgentId = "dakota" | "elon" | "brian" | "andrej" | "warren" | "lo"
type ChatEntry = { id: string; role: "user" | "assistant"; text: string }
type AgentReport = { agent: AgentId; ok: boolean; text: string }

const AGENT_LABELS: Record<AgentId, string> = {
  dakota: "Dakota", elon: "Elon", brian: "Brian", andrej: "Andrej", warren: "Warren", lo: "Lo",
}

function renderReports(reports: AgentReport[]): string {
  return reports.map((report) => {
    const state = report.ok ? "보고" : "실패"
    return `[${AGENT_LABELS[report.agent]} · ${state}]\n${report.text}`
  }).join("\n\n")
}

export function OrchestratorChat() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isRunning, setIsRunning] = useState(false)
  const [activeAgents, setActiveAgents] = useState<AgentId[]>([])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [entries, isRunning])

  async function runFederation(prompt: string) {
    const response = await fetch("/api/orchestrator/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    })
    const payload = await response.json() as { agents?: AgentId[]; reports?: AgentReport[]; error?: string }
    if (!response.ok) throw new Error(payload.error ?? "Agent run failed")
    return payload
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const prompt = inputValue.trim()
    if (!prompt || isRunning) return

    setInputValue("")
    setEntries((current) => [...current, { id: crypto.randomUUID(), role: "user", text: prompt }])
    setIsRunning(true)
    setActiveAgents([])
    try {
      const result = await runFederation(prompt)
      setActiveAgents(result.agents ?? [])
      setEntries((current) => [...current, {
        id: crypto.randomUUID(), role: "assistant",
        text: renderReports(result.reports ?? []),
      }])
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      setEntries((current) => [...current, {
        id: crypto.randomUUID(), role: "assistant",
        text: `[실행 실패]\n${message}`,
      }])
    } finally {
      setIsRunning(false)
      setActiveAgents([])
    }
  }

  return (
    <div className="border border-zinc-700 rounded-xl bg-zinc-900 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-cyan-500/20 flex items-center justify-center text-sm">🧠</span>
        <span className="text-zinc-300 text-sm font-medium">Agent Federation</span>
        {isRunning && (
          <span className="text-cyan-400 text-xs animate-pulse ml-auto">
            {activeAgents.length > 0 ? `${activeAgents.map((agent) => AGENT_LABELS[agent]).join(" · ")} 실행 중` : "담당 agent 선정 중..."}
          </span>
        )}
      </div>

      <div ref={scrollRef} className="h-[280px] overflow-y-auto p-4 space-y-3">
        {entries.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-600 text-sm text-center">
              복합 과제를 입력하세요.<br />
              <span className="text-zinc-700 text-xs">관련 specialist가 실제로 병렬 실행되고, 각자 이름으로 보고합니다.</span>
            </p>
          </div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className={`flex ${entry.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${entry.role === "user" ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-200 border border-zinc-700"}`}>
              <p className="whitespace-pre-wrap">{entry.text}</p>
            </div>
          </div>
        ))}
        {isRunning && (
          <div className="flex justify-start"><div className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-xs text-zinc-400">Specialist lanes running in parallel…</div></div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-zinc-800 p-3 flex gap-2">
        <input value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="예: KSOR을 연구·사업·AI 관점에서 병렬 검토해줘" className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-600" />
        <button type="submit" disabled={isRunning || !inputValue.trim()} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">실행</button>
      </form>
    </div>
  )
}
