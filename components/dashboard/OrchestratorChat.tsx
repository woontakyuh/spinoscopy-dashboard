"use client"

import { useRef, useEffect, useState, type FormEvent } from "react"
import { useChat } from "@ai-sdk/react"
import { TextStreamChatTransport } from "ai"

function getTextContent(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("")
}

function emitOrchestratorEvent(kind: "received" | "reported", summary: string) {
  return fetch("/api/orchestrator/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent: "dakota",
      role: kind === "received" ? "user" : "router",
      kind,
      status: "completed",
      channel: "dashboard",
      summary,
      requiresApproval: false,
      approvalState: "none",
      artifactType: kind === "reported" ? "report" : undefined,
    }),
  }).catch(() => {})
}

export function OrchestratorChat() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [inputValue, setInputValue] = useState("")
  const lastReportedMessageIdRef = useRef<string | null>(null)

  const { messages, sendMessage, status } = useChat({
    transport: new TextStreamChatTransport({
      api: "/api/ai/chat",
      body: { agentId: "orchestrator" },
    }),
  })

  const isStreaming = status === "streaming" || status === "submitted"

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, status])

  useEffect(() => {
    if (isStreaming) return
    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant")
    if (!lastAssistant || lastAssistant.id === lastReportedMessageIdRef.current) return
    const text = getTextContent(lastAssistant.parts).trim()
    if (!text) return
    lastReportedMessageIdRef.current = lastAssistant.id
    void emitOrchestratorEvent("reported", text.slice(0, 220))
  }, [isStreaming, messages])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = inputValue.trim()
    if (!text || isStreaming) return
    setInputValue("")
    void emitOrchestratorEvent("received", text.slice(0, 220))
    sendMessage({ text })
  }

  return (
    <div className="border border-zinc-700 rounded-xl bg-zinc-900 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-cyan-500/20 flex items-center justify-center text-sm">🧠</span>
        <span className="text-zinc-300 text-sm font-medium">Orchestrator</span>
        {isStreaming && (
          <span className="text-zinc-500 text-xs animate-pulse ml-auto">응답 중...</span>
        )}
      </div>

      <div ref={scrollRef} className="h-[280px] overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-600 text-sm text-center">
              무엇이든 물어보세요.<br />
              <span className="text-zinc-700 text-xs">적절한 에이전트에게 자동으로 연결합니다.</span>
            </p>
          </div>
        )}

        {messages.map((m) => {
          const text = getTextContent(m.parts)
          if (!text) return null
          return (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800 text-zinc-200 border border-zinc-700"
                }`}
              >
                <p className="whitespace-pre-wrap">{text}</p>
              </div>
            </div>
          )
        })}

        {isStreaming && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-zinc-800 p-3 flex gap-2">
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="메시지를 입력하세요..."
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-600"
        />
        <button
          type="submit"
          disabled={isStreaming || !inputValue.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          전송
        </button>
      </form>
    </div>
  )
}
