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

const QUICK_PROMPTS = [
  "오늘 가장 급한 일 알려줘",
  "이번 주 일정 정리해줘",
  "내일 할 일 미리 봐줘",
]

export function DakotaChat() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [inputValue, setInputValue] = useState("")

  const { messages, sendMessage, status } = useChat({
    transport: new TextStreamChatTransport({
      api: "/api/ai/chat",
      body: { agentId: "dakota" },
    }),
  })

  const isStreaming = status === "streaming" || status === "submitted"

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, status])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = inputValue.trim()
    if (!text || isStreaming) return
    setInputValue("")
    sendMessage({ text })
  }

  function quickSend(text: string) {
    if (isStreaming) return
    sendMessage({ text })
  }

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/dakota.png" alt="Dakota" className="w-7 h-7 rounded-full object-cover" />
        <div className="flex flex-col leading-tight">
          <span className="text-foreground text-sm font-medium">Dakota</span>
          <span className="text-muted-foreground text-[10px]">센터장님 비서 · Claude Opus</span>
        </div>
        {isStreaming && (
          <span className="text-muted-foreground text-xs animate-pulse ml-auto">응답 중…</span>
        )}
      </div>

      <div ref={scrollRef} className="h-[320px] overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-muted-foreground text-sm text-center">
              안녕하세요 센터장님, Dakota 입니다.<br />
              <span className="text-muted-foreground/70 text-xs">일정·할 일·기타 무엇이든 편하게 물어보세요.</span>
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => quickSend(q)}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          const text = getTextContent(m.parts)
          if (!text) return null
          return (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} gap-2`}>
              {m.role !== "user" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/dakota.png" alt="Dakota" className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-muted text-foreground border border-border rounded-tl-sm"
                }`}
              >
                <p className="whitespace-pre-wrap">{text}</p>
              </div>
            </div>
          )
        })}

        {isStreaming && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/dakota.png" alt="Dakota" className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
            <div className="bg-muted border border-border rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border p-3 flex gap-2">
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Dakota에게 말 걸어보세요…"
          className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-600"
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
