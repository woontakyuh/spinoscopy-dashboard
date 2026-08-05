"use client"

import { useState, useRef, useEffect, type FormEvent } from "react"
import { createPortal } from "react-dom"
import { useChat } from "@ai-sdk/react"
import { TextStreamChatTransport } from "ai"

function getChatText(parts: Array<{ type: string; text?: string }>): string {
  return parts.filter((p) => p.type === "text" && p.text).map((p) => p.text).join("")
}

function isTelemetryAgent(agentId: string): agentId is "dakota" | "elon" | "brian" | "lo" | "warren" | "andrej" {
  return ["dakota", "elon", "brian", "lo", "warren", "andrej"].includes(agentId)
}

function emitAgentEvent(agentId: string, kind: "received" | "reported", summary: string) {
  if (!isTelemetryAgent(agentId)) return Promise.resolve()
  return fetch("/api/orchestrator/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent: agentId,
      role: kind === "received" ? "user" : "specialist",
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

interface AgentChatProps {
  agentId: string
  image: string
  name: string
  greeting: string
  api?: string
}

export function AgentChat({
  agentId,
  image,
  name,
  greeting,
  api = "/api/ai/chat",
}: AgentChatProps) {
  const [inputValue, setInputValue] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  const sessionStartRef = useRef<{ time: string; messageCount: number } | null>(null)
  const lastReportedMessageIdRef = useRef<string | null>(null)

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new TextStreamChatTransport({
      api,
      body: { agentId },
    }),
    onError: (err) => console.error(`[${name}Chat] error:`, err),
  })

  const isStreaming = status === "streaming" || status === "submitted"
  const storageKey = `agent-chat-${agentId}-v1`

  // localStorage 복원
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed)
      }
    } catch {}
  }, [setMessages, storageKey])

  // localStorage 저장
  useEffect(() => {
    if (!hydratedRef.current) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-50)))
    } catch {}
  }, [messages, storageKey])

  useEffect(() => {
    if (isStreaming) return
    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant")
    if (!lastAssistant || lastAssistant.id === lastReportedMessageIdRef.current) return
    const text = getChatText(lastAssistant.parts).trim()
    if (!text) return
    lastReportedMessageIdRef.current = lastAssistant.id
    void emitAgentEvent(agentId, "reported", text.slice(0, 220))
  }, [agentId, isStreaming, messages])

  // 세션 저장 (focus 닫힐 때)
  useEffect(() => {
    if (focused) {
      sessionStartRef.current = { time: new Date().toISOString(), messageCount: messages.length }
      return
    }
    const start = sessionStartRef.current
    if (!start) return
    sessionStartRef.current = null
    const sessionMessages = messages.slice(start.messageCount)
    if (sessionMessages.length === 0) return
    const exchanges = sessionMessages
      .map((m) => ({ role: m.role as "user" | "assistant", content: getChatText(m.parts) }))
      .filter((m) => m.content.length > 0)
    if (exchanges.length === 0) return
    fetch("/api/dakota/memory/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startTime: start.time, endTime: new Date().toISOString(), channel: `agent-${agentId}`, agentId, exchanges }),
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused])

  // beforeunload 저장
  useEffect(() => {
    function save() {
      const start = sessionStartRef.current
      if (!start || !focused) return
      const exchanges = messages.slice(start.messageCount)
        .map((m) => ({ role: m.role, content: getChatText(m.parts) }))
        .filter((m) => m.content.length > 0)
      if (exchanges.length === 0) return
      navigator.sendBeacon("/api/dakota/memory/session",
        new Blob([JSON.stringify({ startTime: start.time, endTime: new Date().toISOString(), channel: `agent-${agentId}`, agentId, exchanges })], { type: "application/json" }))
    }
    window.addEventListener("beforeunload", save)
    return () => window.removeEventListener("beforeunload", save)
  }, [focused, messages, agentId])

  // 스크롤
  useEffect(() => {
    if (!scrollRef.current) return
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    })
  }, [messages, status, focused])

  // body scroll lock
  useEffect(() => {
    if (!focused) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [focused])

  // ESC
  useEffect(() => {
    if (!focused) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFocused(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [focused])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = inputValue.trim()
    if (!text || isStreaming) return
    setInputValue("")
    void emitAgentEvent(agentId, "received", text.slice(0, 220))
    sendMessage({ text })
  }

  function clearChat() {
    setMessages([])
    sessionStartRef.current = null
    try { localStorage.removeItem(storageKey) } catch {}
  }

  const messageList = messages.map((m) => {
    const text = getChatText(m.parts)
    if (!text) return null
    return (
      <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
        <div className={`relative max-w-[85%] rounded-2xl px-3 py-1.5 text-[13px] leading-relaxed shadow-sm ${
          m.role === "user"
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-card border border-border text-foreground rounded-tl-sm"
        }`}>
          {m.role !== "user" && (
            <span aria-hidden className="absolute -left-1.5 top-2 w-2.5 h-2.5 rotate-45 bg-card border-l border-t border-border" />
          )}
          <p className="whitespace-pre-wrap">{text}</p>
        </div>
      </div>
    )
  })

  const inputForm = (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end">
      <textarea
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value)
          e.target.style.height = "auto"
          e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key !== "Enter") return
          // 터치 기기는 여러 신호 OR 로 keydown 시점에 직접 판별 — state 타이밍 이슈 회피
          const isTouch =
            (typeof window !== "undefined" && (
              window.matchMedia("(pointer: coarse)").matches ||
              window.matchMedia("(hover: none)").matches ||
              "ontouchstart" in window
            )) ||
            (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0)
          if (isTouch) return
          if (e.shiftKey) {
            e.preventDefault()
            const ta = e.currentTarget
            const start = ta.selectionStart
            const end = ta.selectionEnd
            const next = inputValue.slice(0, start) + "\n" + inputValue.slice(end)
            setInputValue(next)
            requestAnimationFrame(() => {
              ta.selectionStart = ta.selectionEnd = start + 1
              ta.style.height = "auto"
              ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
            })
            return
          }
          e.preventDefault()
          handleSubmit(e as unknown as FormEvent)
        }}
        placeholder=""
        rows={1}
        enterKeyHint="enter"
        style={{ fontSize: "16px" }}
        className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-600 resize-none overflow-y-auto leading-snug"
      />
      <button
        type="submit"
        disabled={isStreaming || !inputValue.trim()}
        className="px-3.5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        보내기
      </button>
    </form>
  )

  // ─── Focus overlay ──────────────
  const focusedOverlay = focused ? (
    <div className="fixed inset-0 z-50 bg-background backdrop-blur-sm overflow-hidden flex items-stretch md:items-center justify-center md:p-6">
      <div className="w-full h-full md:max-w-5xl md:h-[80vh] flex flex-col md:flex-row md:gap-6 overflow-hidden">
        <div className="shrink-0 flex justify-center md:items-center pt-3 md:pt-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt={name}
            onClick={() => setFocused(false)}
            className="h-[28vh] md:h-full w-auto max-w-[50vw] md:max-w-[280px] object-contain select-none cursor-pointer hover:opacity-90 transition-opacity"
            draggable={false}
          />
        </div>
        <div className="flex-1 min-h-0 flex flex-col gap-2 md:gap-3 p-3 md:p-5 md:bg-card/80 md:border md:border-border md:rounded-2xl md:shadow-2xl overflow-hidden">
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-2 px-1">
            {messages.length === 0 ? (
              <p className="text-muted-foreground/70 text-xs text-center py-4">…</p>
            ) : (
              <>
                {messageList}
                {isStreaming && (() => {
                  const last = messages[messages.length - 1]
                  if (!last) return false
                  // user 가 방금 보냈거나, assistant 가 아직 텍스트 못 낸 상태 (툴 호출 중 등)
                  if (last.role === "user") return true
                  return getChatText(last.parts).length === 0
                })() && (
                  <div className="flex justify-start">
                    <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-2.5">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="shrink-0 flex flex-col gap-1.5">
            {error && <div className="text-xs text-red-400 px-1">{error.message}</div>}
            {inputForm}
            {messages.length > 0 && (
              <button type="button" onClick={clearChat} className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground self-end">
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
      <button type="button" onClick={() => setFocused(false)} className="fixed top-3 right-3 md:top-5 md:right-5 w-9 h-9 rounded-full bg-muted/80 hover:bg-muted text-foreground flex items-center justify-center text-lg" aria-label="닫기">
        ✕
      </button>
    </div>
  ) : null

  // ─── Normal inline ──────────────
  return (
    <div className="flex items-start gap-3 md:gap-4 mb-4 md:mb-6 animate-fade-in-up">
      {typeof document !== "undefined" && focusedOverlay && createPortal(focusedOverlay, document.body)}
      <div className="flex flex-col items-center shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={name}
          onClick={() => setFocused(true)}
          className="w-16 h-16 md:w-24 md:h-24 rounded-full object-cover border border-border shadow-md cursor-pointer hover:opacity-90 transition-opacity"
          draggable={false}
        />
        <span className="mt-1.5 text-xs md:text-sm font-semibold text-foreground/90">{name}</span>
      </div>
      <div
        className="relative flex-1 min-w-0 mt-1 md:mt-2 cursor-pointer"
        onClick={() => setFocused(true)}
      >
        <div className="relative bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 md:px-5 md:py-4 shadow-lg hover:bg-card/90 transition-colors">
          <span aria-hidden className="absolute -left-2 top-3 w-3 h-3 rotate-45 bg-card border-l border-t border-border" />
          <p className="text-foreground/90 text-sm md:text-base leading-relaxed">{greeting}</p>
        </div>
      </div>
    </div>
  )
}
