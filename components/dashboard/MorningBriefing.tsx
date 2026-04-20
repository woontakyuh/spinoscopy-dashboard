"use client"

import { useState, useRef, useEffect, useCallback, type FormEvent } from "react"
import { createPortal } from "react-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useChat } from "@ai-sdk/react"
import { TextStreamChatTransport } from "ai"
import { WeatherInline, useWeatherLocation } from "@/components/dashboard/WeatherInline"
import { pickDakotaGreeting } from "@/lib/dakotaGreetings"
import { useSpeechRecognition, useElevenLabsSpeech } from "@/lib/voice"
import {
  getSlot,
  dateKeySeoul,
  pickDakotaPhoto,
  pickOverridePhoto,
  defaultWorkdayMode,
  workdayOverrideKey,
  outfitOverrideKey,
  type DakotaMode,
  type OutfitOverride,
} from "@/lib/dakotaPhotos"
import type { WeatherData } from "@/lib/types/weather"

function getChatText(parts: Array<{ type: string; text?: string }>): string {
  return parts.filter((p) => p.type === "text" && p.text).map((p) => p.text).join("")
}

function DakotaGreetingChat({
  greeting,
  dateStr,
  weatherLocation,
}: {
  greeting: string
  dateStr: string
  weatherLocation: string | null
}) {
  const { image, mode, setMode, applyOutfitOverride } = useDakotaImage()
  const [inputValue, setInputValue] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  const queryClient = useQueryClient()

  // voice mode ref — useChat body 콜백이 stale closure 되지 않게 ref로 전달
  const voiceModeRef = useRef(false)

  // 클라이언트가 보유한 날씨를 매 메시지에 attach
  const buildUserContext = () => {
    const cached = queryClient.getQueriesData<WeatherData>({ queryKey: ["weather"] })
      .map(([, d]) => d)
      .find((d) => !!d) as WeatherData | undefined
    if (!cached?.current) return undefined
    const c = cached.current
    return {
      weatherLocation: cached.location ?? null,
      weatherSummary: `${c.temp}°C ${c.description}, 체감 ${c.feels_like}°, 최고 ${c.temp_max}° / 최저 ${c.temp_min}°`,
    }
  }

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new TextStreamChatTransport({
      api: "/api/ai/chat",
      body: () => ({
        agentId: "dakota",
        userContext: buildUserContext(),
        voiceMode: voiceModeRef.current,
      }),
    }),
    onError: (err) => {
      console.error("[DakotaChat] error:", err)
    },
  })

  const isStreaming = status === "streaming" || status === "submitted"
  const hydratedRef = useRef(false)
  const [focused, setFocused] = useState(false)
  const sessionStartRef = useRef<{ time: string; messageCount: number } | null>(null)

  // ─── 음성대화모드 (단일 토글, 원터치) ─────────────────────
  // 모바일 전용 UX: 토글 탭 → 즉시 listening 시작. Dakota는 영어 전용 답변.
  // STT 언어는 한국어·영어 중 선택 (브라우저 한계상 자동감지 불가).
  // 세션 단위 상태 (localStorage 비저장). focus 닫히면 리셋.
  const [voiceMode, setVoiceMode] = useState(false)
  const [voiceEnabledFromIndex, setVoiceEnabledFromIndex] = useState<number | null>(null)
  const [sttLang, setSttLang] = useState<"ko-KR" | "en-US">("en-US")
  // 직전 메시지가 mic(음성)로 들어왔는지 추적 — 타자 입력은 TTS 자동재생 X
  const lastInputViaMicRef = useRef(false)

  useEffect(() => {
    voiceModeRef.current = voiceMode
  }, [voiceMode])

  const { speak, stop: stopSpeech, isSupported: ttsSupported, isSpeaking, prime: primeAudio } = useElevenLabsSpeech()

  const handleVoiceFinal = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      lastInputViaMicRef.current = true
      sendMessage({ text: trimmed })
    },
    [sendMessage],
  )
  const {
    isListening,
    isSupported: sttSupported,
    interimText,
    start: startListening,
    stop: stopListening,
    stopSilent: stopListeningSilent,
    commitNow: commitVoiceInput,
  } = useSpeechRecognition({ lang: sttLang, onFinalText: handleVoiceFinal })

  // TTS 자동 재생 조건:
  //   voiceMode ON + 직전 입력이 mic + voice 토글 시점 이후 메시지
  const lastSpokenIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!voiceMode || !ttsSupported) return
    if (!lastInputViaMicRef.current) return // 타자로 보낸 건 재생 X
    if (voiceEnabledFromIndex === null) return
    if (isStreaming) return
    if (messages.length <= voiceEnabledFromIndex) return
    const last = messages[messages.length - 1]
    if (last.role !== "assistant") return
    if (lastSpokenIdRef.current === last.id) return
    const text = getChatText(last.parts).replace(/\{\{OUTFIT:\w+:\w+\}\}/g, "").trim()
    if (!text) return
    lastSpokenIdRef.current = last.id
    void speak(text)
  }, [messages, isStreaming, voiceMode, voiceEnabledFromIndex, ttsSupported, speak])

  // Focus overlay 닫히면 음성대화모드 완전 리셋
  useEffect(() => {
    if (!focused) {
      stopSpeech()
      stopListening()
      setVoiceMode(false)
      setVoiceEnabledFromIndex(null)
      lastInputViaMicRef.current = false
    }
  }, [focused, stopSpeech, stopListening])

  const toggleVoiceMode = useCallback(() => {
    if (voiceMode) {
      stopSpeech()
      stopListening()
      setVoiceMode(false)
      setVoiceEnabledFromIndex(null)
      voiceModeRef.current = false  // ref 동기 세팅 — useEffect race 방지
      lastInputViaMicRef.current = false
    } else {
      voiceModeRef.current = true   // ref 먼저 세팅 — 첫 발화 body 시 true 보장
      setVoiceMode(true)
      setVoiceEnabledFromIndex(messages.length)
      // iOS 오디오 unlock — user gesture 안에서 짧은 무음 재생
      primeAudio()
      // 원터치 UX: 토글 켜자마자 listening 시작 (user gesture 안에서 호출)
      startListening()
    }
  }, [voiceMode, messages.length, stopSpeech, stopListening, startListening, primeAudio])

  // TTS 끝나면 자동으로 다시 listening (ChatGPT 음성모드 스타일 대화 루프)
  // 첫 시도 실패할 수 있어 300ms 뒤 재시도 + 1.5s 안전망도 둠.
  const prevSpeakingRef = useRef(false)
  useEffect(() => {
    const wasSpeaking = prevSpeakingRef.current
    prevSpeakingRef.current = isSpeaking
    if (!wasSpeaking || isSpeaking) return
    if (!voiceMode || isListening || isStreaming) return
    const t1 = setTimeout(() => {
      if (voiceMode && !isStreaming && !isSpeaking) startListening()
    }, 300)
    const t2 = setTimeout(() => {
      if (voiceMode && !isListening && !isStreaming && !isSpeaking) {
        startListening()
      }
    }, 1500)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [isSpeaking, voiceMode, isListening, isStreaming, startListening])

  // KO/EN 언어 바꿨을 때 인식 재시작 — setTimeout 클로저는 oldLang 캡처하므로
  // pendingRestart flag + useEffect로 새 렌더 후 startListening 호출.
  const langSwitchPendingRef = useRef(false)
  useEffect(() => {
    if (!langSwitchPendingRef.current) return
    langSwitchPendingRef.current = false
    if (voiceMode && !isListening && !isStreaming && !isSpeaking) {
      startListening()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sttLang])

  const switchLang = useCallback(
    (next: "ko-KR" | "en-US") => {
      if (sttLang === next) return
      // silent stop: 버퍼 텍스트 Dakota에 전송 안 함 (그냥 언어만 바뀌는 상황)
      stopListeningSilent()
      langSwitchPendingRef.current = true
      setSttLang(next)
    },
    [sttLang, stopListeningSilent],
  )

  // 1) localStorage 복원 (1회) — 비어 있으면 서버 archive에서 hydration
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true

    try {
      const raw = localStorage.getItem("dakota-chat-v1")
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed)
        }
      }
    } catch {}
  }, [setMessages])

  // 2) localStorage 저장
  useEffect(() => {
    if (!hydratedRef.current) return
    try {
      // 최근 50개만 저장
      const trimmed = messages.slice(-50)
      localStorage.setItem("dakota-chat-v1", JSON.stringify(trimmed))
    } catch {}
  }, [messages])

  // 3) Focus 모드 진입 시 세션 시작점 기록, 종료 시 세션 묶음 저장
  useEffect(() => {
    if (focused) {
      // 진입: 현재 메시지 개수를 시작점으로
      sessionStartRef.current = {
        time: new Date().toISOString(),
        messageCount: messages.length,
      }
      return
    }

    // 종료: 세션 동안 메시지가 추가됐다면 저장
    const start = sessionStartRef.current
    if (!start) return
    sessionStartRef.current = null

    const sessionMessages = messages.slice(start.messageCount)
    if (sessionMessages.length === 0) return

    const exchanges = sessionMessages
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: getChatText(m.parts),
      }))
      .filter((m) => m.content.length > 0)

    if (exchanges.length === 0) return

    fetch("/api/dakota/memory/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startTime: start.time,
        endTime: new Date().toISOString(),
        channel: "dashboard",
        exchanges,
      }),
    }).catch((e) => console.warn("[DakotaChat] session save failed:", e))
    // intentionally not depending on `messages` to avoid re-firing during streaming
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused])

  // 4) 착장 태그 감지 — Dakota가 {{OUTFIT:category:variant}} 포함하면 즉시 교체
  useEffect(() => {
    if (messages.length === 0) return
    const last = messages[messages.length - 1]
    if (last.role !== "assistant") return
    const text = getChatText(last.parts)
    const match = text.match(/\{\{OUTFIT:(\w+):(\w+)\}\}/)
    if (match) {
      applyOutfitOverride(match[1], match[2])
    }
  }, [messages, applyOutfitOverride])

  // 새 메시지 / focused 전환 시 스크롤을 항상 맨 아래로
  useEffect(() => {
    if (!scrollRef.current) return
    // 다음 프레임에 실행 — 새로 마운트된 ref가 확실히 연결된 뒤
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    })
  }, [messages, status, focused])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = inputValue.trim()
    if (!text || isStreaming) return
    setInputValue("")
    sendMessage({ text })
  }

  function clearConversation() {
    setMessages([])
    sessionStartRef.current = null
    try { localStorage.removeItem("dakota-chat-v1") } catch {}
  }

  // 브라우저 닫기/새로고침 시에도 세션 저장 (beforeunload)
  useEffect(() => {
    function saveOnUnload() {
      const start = sessionStartRef.current
      if (!start || !focused) return
      const sessionMessages = messages.slice(start.messageCount)
      if (sessionMessages.length === 0) return
      const exchanges = sessionMessages
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: getChatText(m.parts),
        }))
        .filter((m) => m.content.length > 0)
      if (exchanges.length === 0) return
      // sendBeacon — 브라우저 닫혀도 전송 보장
      navigator.sendBeacon(
        "/api/dakota/memory/session",
        new Blob(
          [JSON.stringify({
            startTime: start.time,
            endTime: new Date().toISOString(),
            channel: "dashboard",
            exchanges,
          })],
          { type: "application/json" }
        )
      )
    }
    window.addEventListener("beforeunload", saveOnUnload)
    return () => window.removeEventListener("beforeunload", saveOnUnload)
  }, [focused, messages])

  // focus 모드 진입 시 body scroll lock
  useEffect(() => {
    if (!focused) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [focused])

  // ESC로 focus 모드 해제
  useEffect(() => {
    if (!focused) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFocused(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [focused])

  const messageList = (
    <>
      {messages.map((m) => {
        const rawText = getChatText(m.parts)
        if (!rawText) return null
        // {{OUTFIT:...}} 태그 숨김
        const text = rawText.replace(/\s*\{\{OUTFIT:\w+:\w+\}\}\s*/g, "").trim()
        if (!text) return null
        return (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`relative max-w-[85%] rounded-2xl px-3 py-1.5 text-[13px] leading-relaxed shadow-sm ${
                m.role === "user"
                  ? "bg-blue-600 text-white rounded-br-sm"
                  : "bg-card border border-border text-foreground rounded-tl-sm"
              }`}
            >
              {m.role !== "user" && (
                <span
                  aria-hidden
                  className="absolute -left-1.5 top-2 w-2.5 h-2.5 rotate-45 bg-card border-l border-t border-border"
                />
              )}
              <p className="whitespace-pre-wrap">{text}</p>
            </div>
          </div>
        )
      })}
      {isStreaming && messages[messages.length - 1]?.role === "user" && (
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
  )

  const inputForm = (
    <>
      {error && (
        <div className="text-xs text-red-400 px-1">
          오류: {error.message || "응답을 가져오지 못했습니다."}
        </div>
      )}
      {isListening && (
        <div className="text-[11px] text-muted-foreground italic px-1">
          🎙️ 듣고 있어요{interimText ? ` — "${interimText}"` : "…"}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2 items-end">
        <textarea
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            // auto-resize
            e.target.style.height = "auto"
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key !== "Enter") return
            if (e.shiftKey) {
              // 명시적으로 줄바꿈 삽입 (브라우저 native 동작 fallback)
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
    </>
  )

  // ─── Voice immersive view (ChatGPT 스타일) ───────────────────
  // Listening(Tak 차례) = 파랑. Stop 누르자마자 / Streaming / Speaking = 녹색.
  // expectingResponse 로 stop → streaming 사이 갭 메움 (즉시 녹색 전환).
  const [expectingResponse, setExpectingResponse] = useState(false)
  useEffect(() => {
    if (isStreaming || isSpeaking) setExpectingResponse(false)
  }, [isStreaming, isSpeaking])
  const dakotaBusy = isSpeaking || isStreaming || expectingResponse
  const voiceImmersive = (focused && voiceMode) ? (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-6">
      <button
        type="button"
        onClick={toggleVoiceMode}
        className="relative focus:outline-none"
        aria-label="음성모드 종료"
      >
        {/* Subtle outline glow — 사진 윤곽선 따라 은은한 단일 그림자 */}
        <div
          className={`pointer-events-none absolute inset-0 rounded-full transition-[box-shadow,border-color] duration-500 ${
            dakotaBusy
              ? "border border-emerald-400/40 shadow-[0_0_28px_6px_rgba(16,185,129,0.35)]"
              : isListening
                ? "border border-blue-400/40 shadow-[0_0_28px_6px_rgba(59,130,246,0.35)]"
                : "border border-border/40"
          }`}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt="Dakota"
          className="relative w-[90vw] h-[90vw] max-w-[28rem] max-h-[28rem] md:w-[30rem] md:h-[30rem] rounded-full object-cover object-top border-2 border-border shadow-2xl select-none"
          draggable={false}
        />
      </button>

      {/* 차례 스위치 버튼 — 파랑(내 말 중) → 녹색으로, 녹색(Dakota 중) → 파랑으로 인터럽트 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          if (isListening) {
            // 내 차례 종료 → Dakota 차례로
            const sent = commitVoiceInput()
            if (sent) {
              setExpectingResponse(true)
            } else {
              // 인식 못 함 → 다시 들을게
              startListening()
            }
          } else if (dakotaBusy) {
            // Dakota 인터럽트 → 내 차례 가져오기
            stopSpeech()
            setExpectingResponse(false)
            startListening()
          } else if (voiceMode) {
            // 자동 중단 상태 → 다시 듣기 재개
            startListening()
          }
        }}
        disabled={!voiceMode}
        aria-label={isListening ? "내 차례 종료" : dakotaBusy ? "Dakota 끊고 내가 말하기" : "다시 듣기"}
        title={isListening ? "내 차례 종료" : dakotaBusy ? "Dakota 끊기" : "다시 듣기"}
        className={`mt-10 w-14 h-14 rounded-full flex items-center justify-center transition-all ${
          isListening
            ? "bg-blue-500 text-white shadow-xl active:scale-95"
            : dakotaBusy
              ? "bg-emerald-500 text-white shadow-xl active:scale-95"
              : "bg-blue-500/15 text-blue-300 border border-blue-400/40 shadow-lg active:scale-95"
        }`}
      >
        <span className="block w-4 h-4 bg-current rounded-sm" />
      </button>

      <div className="mt-4 text-center space-y-1">
        <div className="text-[12px] text-muted-foreground">
          {isSpeaking
            ? "🔊 Speaking"
            : isStreaming
              ? "… thinking"
              : isListening
                ? "🎙 Listening"
                : "🎙 Tap to resume"}
        </div>
      </div>

      {/* 하단: lang toggle + exit hint */}
      <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3">
        {sttSupported && (
          <div className="flex items-center gap-0.5 text-[11px] border border-border rounded-full overflow-hidden bg-card/60 backdrop-blur-sm">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); switchLang("ko-KR") }}
              className={`px-3 py-1 transition-colors ${
                sttLang === "ko-KR" ? "bg-blue-500/25 text-blue-400" : "text-muted-foreground"
              }`}
            >
              KO
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); switchLang("en-US") }}
              className={`px-3 py-1 transition-colors ${
                sttLang === "en-US" ? "bg-blue-500/25 text-blue-400" : "text-muted-foreground"
              }`}
            >
              EN
            </button>
          </div>
        )}
        <div className="text-[10px] text-muted-foreground/60">사진 탭 → 채팅 모드</div>
      </div>
    </div>
  ) : null

  // ─── Focused overlay (portal to body to escape transformed ancestors) ──
  const focusedOverlay = (focused && !voiceMode) ? (
    <div className="fixed inset-0 z-50 bg-background backdrop-blur-sm overflow-hidden flex items-stretch md:items-center justify-center md:p-6">
        <div className="w-full h-full md:max-w-5xl md:h-[80vh] flex flex-col md:flex-row md:gap-6 overflow-hidden">
          {/* Dakota 캐릭터 — 탭하면 음성모드 진입 (비공개 entry point) */}
          <div className="shrink-0 flex justify-center md:items-center pt-3 md:pt-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt="Dakota"
              onClick={toggleVoiceMode}
              className="h-[28vh] md:h-full w-auto max-w-[50vw] md:max-w-[280px] object-contain select-none cursor-pointer hover:opacity-90 transition-opacity"
              draggable={false}
            />
          </div>

          {/* 채팅 카드 */}
          <div className="flex-1 min-h-0 flex flex-col gap-2 md:gap-3 p-3 md:p-5 md:bg-card/80 md:border md:border-border md:rounded-2xl md:shadow-2xl overflow-hidden">
            {/* 메시지 */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-2 px-1">
              {messages.length === 0 ? (
                <p className="text-muted-foreground/70 text-xs text-center py-4">
                  …
                </p>
              ) : messageList}
            </div>

            {/* 입력창 + 비우기 버튼 */}
            <div className="shrink-0 flex flex-col gap-1.5">
              {inputForm}
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearConversation}
                  className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground self-end"
                  title="채팅창 비우기 (기억은 유지)"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 상단 우측 닫기 버튼 */}
        <button
          type="button"
          onClick={() => setFocused(false)}
          className="fixed top-3 right-3 md:top-5 md:right-5 w-9 h-9 rounded-full bg-muted/80 hover:bg-muted text-foreground flex items-center justify-center text-lg"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>
    ) : null

  // ─── Normal inline mode ────────────────────────────────────
  return (
    <div className="pt-2 md:pt-4 flex items-start gap-3 md:gap-4">
      {typeof document !== "undefined" && voiceImmersive && createPortal(voiceImmersive, document.body)}
      {typeof document !== "undefined" && focusedOverlay && createPortal(focusedOverlay, document.body)}

      {/* 좌측: 캐릭터 — 상체만 크롭, 클릭하면 전신 보기 */}
      <div className="flex flex-col items-center shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt="Dakota"
          onClick={() => setFocused(true)}
          className="w-32 md:w-44 h-40 md:h-52 object-cover object-top rounded-lg select-none cursor-pointer hover:opacity-90 transition-opacity"
          draggable={false}
          title="클릭해서 대화 집중 모드"
        />
        <div className="mt-1 flex items-center gap-0.5 text-[10px] rounded-full border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setMode("work")}
            className={`px-2 py-0.5 transition-colors ${mode === "work" ? "bg-blue-600 text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            출근
          </button>
          <button
            type="button"
            onClick={() => setMode("off")}
            className={`px-2 py-0.5 transition-colors ${mode === "off" ? "bg-orange-600 text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            오프
          </button>
        </div>
      </div>

      {/* 우측: 인사 말풍선만 — 채팅하려면 사진 클릭 */}
      <div className="relative flex-1 min-w-0 mt-2">
        <div
          className="relative bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 md:px-5 md:py-3 shadow-lg cursor-pointer hover:bg-card/90 transition-colors"
          onClick={() => setFocused(true)}
          title="클릭해서 Dakota와 대화"
        >
          <span aria-hidden className="absolute -left-2 top-3 w-3 h-3 rotate-45 bg-card border-l border-t border-border" />
          <h2 className="text-base md:text-lg font-semibold text-foreground tracking-tight">
            {greeting}
          </h2>
          <div className="mt-1"><WeatherInline /></div>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">
            {dateStr}{weatherLocation && <span className="ml-2 text-muted-foreground/70">· {weatherLocation}</span>}
          </p>
        </div>
      </div>
    </div>
  )
}


function useDakotaGreeting(): string {
  // 캐시에서 weather 읽기 (직접 fetch 안 함 — WeatherInline이 이미 fetch)
  const queryClient = useQueryClient()
  const cached = queryClient.getQueriesData<WeatherData>({ queryKey: ["weather"] })
    .map(([, d]) => d)
    .find((d) => !!d) as WeatherData | undefined

  const seoul = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
  const dateKey = seoul.toLocaleDateString("en-CA")

  return pickDakotaGreeting({
    hour: seoul.getHours(),
    dayOfWeek: seoul.getDay(),
    dateKey,
    weather: cached?.current
      ? { temp: cached.current.temp, description: cached.current.description }
      : null,
  })
}

function useDakotaImage() {
  // 5분마다 tick → 시간 bucket 회전 트리거
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const now = new Date()
  const dateKey = dateKeySeoul(now)
  const [mode, setModeState] = useState<DakotaMode>(() => defaultWorkdayMode(now))

  // hydrate override from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(workdayOverrideKey(dateKey))
      if (stored === "work" || stored === "off") setModeState(stored)
    } catch {}
  }, [dateKey])

  function setMode(next: DakotaMode) {
    setModeState(next)
    try { localStorage.setItem(workdayOverrideKey(dateKey), next) } catch {}
  }

  const [outfitOverride, setOutfitOverride] = useState<OutfitOverride | null>(null)

  // hydrate outfit override
  useEffect(() => {
    try {
      const raw = localStorage.getItem(outfitOverrideKey(dateKey))
      if (raw) setOutfitOverride(JSON.parse(raw))
    } catch {}
  }, [dateKey])

  const slot = getSlot(now, mode)
  void tick

  // override가 있으면 그 variant에서 시간 bucket 회전, 없으면 기본
  const overridePhoto = outfitOverride ? pickOverridePhoto(outfitOverride, dateKey, now) : null
  const image = overridePhoto ?? pickDakotaPhoto(mode, slot, dateKey, now)

  function applyOutfitOverride(outfit: string, variant: string) {
    const o = { outfit, variant }
    setOutfitOverride(o)
    try { localStorage.setItem(outfitOverrideKey(dateKey), JSON.stringify(o)) } catch {}
  }

  function clearOutfitOverride() {
    setOutfitOverride(null)
    try { localStorage.removeItem(outfitOverrideKey(dateKey)) } catch {}
  }

  return { image, mode, setMode, applyOutfitOverride, clearOutfitOverride }
}

export function MorningBriefing() {
  const weatherLocation = useWeatherLocation()

  const now = new Date()
  const dateStr = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  })

  const greeting = useDakotaGreeting()

  return (
    <DakotaGreetingChat
      greeting={greeting}
      dateStr={dateStr}
      weatherLocation={weatherLocation}
    />
  )
}
