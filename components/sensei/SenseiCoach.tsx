"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { BjjStats } from "@/lib/types/sensei"

interface SenseiCoachProps {
  initialQuestion: string | null
  onQuestionConsumed: () => void
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

const SUGGESTED_QUESTIONS = [
  "이번 주 뭘 연습하면 좋을까?",
  "하프가드에서 패스 당할 때 어떻게 해?",
  "다음 대회 준비 어떻게 할까?",
  "노기에서 레그락 어떻게 시작해?",
  "Lucas Leite처럼 되려면 뭘 해야 해?",
]

const BELT_COLORS: Record<string, string> = {
  white: "bg-[rgba(212,212,216,0.12)] text-[#d4d4d8]",
  blue: "bg-[rgba(59,130,246,0.12)] text-[#3b82f6]",
  purple: "bg-[rgba(168,85,247,0.12)] text-[#a855f7]",
  brown: "bg-[rgba(146,64,14,0.12)] text-[#b45309]",
  black: "bg-[rgba(39,39,42,0.12)] text-foreground border border-border",
}

const ATTR_LABELS: Record<string, string> = {
  guard: "가드",
  passing: "패싱",
  control: "컨트롤",
  finishing: "피니싱",
  takedowns: "테이크다운",
  legLocks: "레그락",
}

export function SenseiCoach({ initialQuestion, onQuestionConsumed }: SenseiCoachProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [statsOpen, setStatsOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const initialSentRef = useRef(false)

  const { data: statsData } = useQuery<{ stats: BjjStats }>({
    queryKey: ["sensei-stats"],
    queryFn: async () => {
      const res = await fetch("/api/notion/sensei/stats")
      if (!res.ok) throw new Error("스탯 로딩 실패")
      return res.json()
    },
  })
  const stats = statsData?.stats ?? null

  const chatMutation = useMutation({
    mutationFn: async ({ message, history }: { message: string; history: ChatMessage[] }) => {
      const res = await fetch("/api/ai/sensei-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, stats }),
      })
      if (!res.ok) throw new Error("코치 응답 실패")
      const data = await res.json()
      return data.reply as string
    },
    onSuccess: (reply) => {
      setMessages((prev) => [...prev, { role: "assistant", content: reply }])
    },
  })

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || chatMutation.isPending) return
      const userMsg: ChatMessage = { role: "user", content: text.trim() }
      setMessages((prev) => {
        const updated = [...prev, userMsg]
        chatMutation.mutate({ message: text.trim(), history: prev })
        return updated
      })
      setInput("")
    },
    [chatMutation],
  )

  // Auto-send initialQuestion
  useEffect(() => {
    if (initialQuestion && !initialSentRef.current) {
      initialSentRef.current = true
      sendMessage(initialQuestion)
      onQuestionConsumed()
    }
  }, [initialQuestion, onQuestionConsumed, sendMessage])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, chatMutation.isPending])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Stats Summary */}
      <div className="border-b border-border shrink-0">
        <button
          onClick={() => setStatsOpen(!statsOpen)}
          className="w-full px-4 py-3 flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>📊</span>
          <span>내 스탯 요약</span>
          <span className="ml-auto text-[11px]">{statsOpen ? "▼" : "▶"}</span>
        </button>

        {statsOpen && stats && (
          <div className="px-4 pb-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`${BELT_COLORS[stats.belt] ?? "bg-foreground/5"} text-[11px]`}>
                {stats.belt.toUpperCase()} {stats.beltStripes > 0 && `${"I".repeat(stats.beltStripes)}`}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                Lv.{stats.level} · {stats.trainingMonths}개월 · 🔥 {stats.streaks.current}주
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <div className="bg-foreground/5 rounded-xl p-2">
                <div className="text-muted-foreground mb-1">Gi OVR {stats.gi.ovr}</div>
                <div className="text-muted-foreground/70 text-[11px]">{stats.gi.ovrRole}</div>
                <div className="mt-1 space-y-0.5">
                  {Object.entries(stats.gi.attributes).map(([key, val]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-muted-foreground/70">{ATTR_LABELS[key]}</span>
                      <span className="text-foreground">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-foreground/5 rounded-xl p-2">
                <div className="text-muted-foreground mb-1">NoGi OVR {stats.nogi.ovr}</div>
                <div className="text-muted-foreground/70 text-[11px]">{stats.nogi.ovrRole}</div>
                <div className="mt-1 space-y-0.5">
                  {Object.entries(stats.nogi.attributes).map(([key, val]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-muted-foreground/70">{ATTR_LABELS[key]}</span>
                      <span className="text-foreground">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
        {messages.length === 0 && !chatMutation.isPending && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="text-muted-foreground/70 text-[13px]">코치에게 질문해보세요</div>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="px-3 py-1.5 text-[12px] rounded-xl border border-border text-muted-foreground hover:border-border hover:text-foreground transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-[13px] whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-[rgba(59,130,246,0.12)] text-foreground rounded-br-md"
                  : "bg-foreground/5 text-foreground/90 rounded-bl-md"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {chatMutation.isPending && (
          <div className="flex justify-start">
            <div className="bg-foreground/5 rounded-xl rounded-bl-md px-4 py-2.5 text-[13px] text-muted-foreground">
              <span className="inline-flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>·</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>·</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>·</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="shrink-0 border-t border-border p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="코치에게 질문..."
          disabled={chatMutation.isPending}
          className="flex-1 bg-foreground/5 border border-border rounded-xl px-3 py-2 text-[13px] text-foreground placeholder-[rgba(255,255,255,0.25)] focus:outline-none focus:ring-1 focus:ring-border focus:border-transparent disabled:opacity-50"
        />
        <Button
          type="submit"
          disabled={!input.trim() || chatMutation.isPending}
          className="bg-foreground/5 hover:bg-foreground/10 text-foreground px-4 rounded-xl disabled:opacity-50"
        >
          전송
        </Button>
      </form>
    </div>
  )
}
