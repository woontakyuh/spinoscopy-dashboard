"use client"

import { useState, useRef, useEffect, type FormEvent } from "react"
import { createPortal } from "react-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useChat } from "@ai-sdk/react"
import { TextStreamChatTransport } from "ai"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { WeatherInline, useWeatherLocation } from "@/components/dashboard/WeatherInline"
import { EmptyState } from "@/components/ui/empty-state"
import { pickDakotaGreeting } from "@/lib/dakotaGreetings"
import {
  getSlot,
  dateKeySeoul,
  pickDakotaPhoto,
  defaultWorkdayMode,
  workdayOverrideKey,
  type DakotaMode,
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
  const { image, mode, setMode } = useDakotaImage()
  const [inputValue, setInputValue] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new TextStreamChatTransport({
      api: "/api/ai/chat",
      body: { agentId: "dakota" },
    }),
    onError: (err) => {
      console.error("[DakotaChat] error:", err)
    },
  })

  const isStreaming = status === "streaming" || status === "submitted"
  const hydratedRef = useRef(false)
  const lastSyncedCountRef = useRef(0)
  const [focused, setFocused] = useState(false)

  // 1) localStorage 복원 (1회) — 비어 있으면 서버 archive에서 hydration
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true

    let restored = false
    try {
      const raw = localStorage.getItem("dakota-chat-v1")
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed)
          lastSyncedCountRef.current = parsed.length
          restored = true
        }
      }
    } catch {}

    if (restored) return

    // 새 기기 — Notion archive에서 최근 30개 message 복원
    fetch("/api/dakota/memory?log=1&limit=30")
      .then((r) => r.json())
      .then((data: { log?: Array<{ role: "user" | "assistant"; content: string }> }) => {
        if (!data.log || data.log.length === 0) return
        const restoredMessages = data.log.map((m, i) => ({
          id: `restored-${i}`,
          role: m.role,
          parts: [{ type: "text" as const, text: m.content }],
        }))
        setMessages(restoredMessages)
        lastSyncedCountRef.current = restoredMessages.length
      })
      .catch((e) => console.warn("[DakotaChat] hydrate failed:", e))
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

  // 3) 응답 끝났을 때 long-term memory sync (assistant 응답이 새로 추가됐을 때만)
  useEffect(() => {
    if (isStreaming) return
    if (messages.length === 0) return
    if (messages.length <= lastSyncedCountRef.current) return
    const last = messages[messages.length - 1]
    if (last.role !== "assistant") return

    // 새로 추가된 메시지들만 전송
    const fresh = messages.slice(lastSyncedCountRef.current).map((m) => ({
      role: m.role as "user" | "assistant",
      content: getChatText(m.parts),
    })).filter((m) => m.content.length > 0)

    if (fresh.length === 0) return
    lastSyncedCountRef.current = messages.length

    fetch("/api/dakota/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exchanges: fresh }),
    }).catch((e) => console.warn("[DakotaChat] memory sync failed:", e))
  }, [messages, isStreaming])

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
    lastSyncedCountRef.current = 0
    try { localStorage.removeItem("dakota-chat-v1") } catch {}
  }

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
        const text = getChatText(m.parts)
        if (!text) return null
        return (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-[13px] leading-relaxed shadow-sm ${
                m.role === "user"
                  ? "bg-blue-600 text-white rounded-br-sm"
                  : "bg-card border border-border text-foreground rounded-tl-sm"
              }`}
            >
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
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Dakota에게 말 걸어보세요…"
          className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-600"
        />
        <button
          type="submit"
          disabled={isStreaming || !inputValue.trim()}
          className="px-3.5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          보내기
        </button>
      </form>
      {messages.length > 0 && (
        <button
          type="button"
          onClick={clearConversation}
          className="text-[10px] text-muted-foreground/70 hover:text-muted-foreground underline-offset-2 hover:underline self-start"
        >
          대화 초기화
        </button>
      )}
    </>
  )

  // ─── Focused overlay (portal to body to escape transformed ancestors) ──
  const focusedOverlay = focused ? (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm overflow-hidden flex items-center justify-center p-3 md:p-6">
        <div className="h-[66vh] w-full max-w-3xl bg-card/80 border border-border rounded-2xl shadow-2xl flex flex-col md:flex-row gap-3 md:gap-4 p-3 md:p-5 overflow-hidden">
          {/* Dakota 캐릭터 — 데스크탑: 세로 고정; 모바일: 작게 */}
          <div className="shrink-0 flex md:block justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt="Dakota"
              onClick={() => setFocused(false)}
              className="w-24 md:w-60 h-auto object-contain select-none cursor-pointer hover:opacity-90 transition-opacity"
              draggable={false}
              title="클릭해서 원래 크기로"
            />
          </div>

          {/* 대화 영역 */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2 md:gap-3">
            <div className="relative bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-2.5 md:px-5 md:py-3 shadow-lg shrink-0">
              <span aria-hidden className="absolute -left-2 top-3 w-3 h-3 rotate-45 bg-card border-l border-t border-border" />
              <h2 className="text-sm md:text-base font-semibold text-foreground tracking-tight">
                {greeting}
              </h2>
              <div className="mt-0.5"><WeatherInline /></div>
              <p className="text-muted-foreground text-[11px] md:text-xs mt-0.5">
                {dateStr}{weatherLocation && <span className="ml-2 text-muted-foreground/70">· {weatherLocation}</span>}
              </p>
            </div>

            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
              {messages.length === 0 ? (
                <p className="text-muted-foreground/70 text-xs text-center py-8">
                  Dakota에게 말 걸어보세요…
                </p>
              ) : messageList}
            </div>

            <div className="shrink-0 flex flex-col gap-2">
              {inputForm}
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
    <div className="pt-2 md:pt-4 space-y-3">
      {typeof document !== "undefined" && focusedOverlay && createPortal(focusedOverlay, document.body)}
      {/* 상단: 캐릭터 + 인사 말풍선 */}
      <div className="flex items-start gap-3 md:gap-4">
        <div className="flex flex-col items-center shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt="Dakota"
            onClick={() => setFocused(true)}
            className="w-24 md:w-32 h-auto object-contain select-none cursor-pointer hover:opacity-90 transition-opacity"
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

        <div className="relative flex-1 min-w-0 mt-2">
          <div className="relative bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 md:px-5 md:py-3 shadow-lg">
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

      {/* 전체 폭 대화 영역 — 끝부분만 살짝 */}
      <div ref={scrollRef} className="h-[120px] md:h-[130px] overflow-y-auto space-y-2 px-1">
        {messages.length > 0 ? messageList : (
          <p className="text-muted-foreground/60 text-xs text-center py-6">
            Dakota에게 말 걸어보세요…
          </p>
        )}
      </div>

      {/* 입력창 */}
      <div className="flex flex-col gap-2">
        {inputForm}
      </div>
    </div>
  )
}

interface DashboardScheduleItem {
  id: string
  title: string
  start: string
  end: string | null
  location: string
  category: string
  source: "notion" | "gcal" | "both"
  notionUrl?: string
  gcalUrl?: string
}

async function fetchSchedule(): Promise<DashboardScheduleItem[]> {
  const res = await fetch("/api/dashboard/schedule")
  if (!res.ok) throw new Error("일정 로딩 실패")
  return res.json()
}

async function fetchUpcoming(): Promise<DashboardScheduleItem[]> {
  const res = await fetch("/api/dashboard/schedule?upcoming=true")
  if (!res.ok) throw new Error("다가오는 일정 로딩 실패")
  return res.json()
}

interface ParsedScheduleData {
  name: string
  date_start: string
  date_end?: string
  place?: string
  category?: string
  topic?: string
}

async function createQuickSchedule(text: string): Promise<void> {
  // 1) NLP 파싱 — 자연어에서 이름, 장소, 날짜 추출
  const parseRes = await fetch("/api/dakota/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "schedule", text }),
  })
  if (!parseRes.ok) {
    throw new Error("자연어 파싱 실패")
  }
  const parseData = (await parseRes.json()) as { success: boolean; parsed?: ParsedScheduleData; error?: string }
  if (!parseData.success || !parseData.parsed) {
    throw new Error(parseData.error ?? "일정 정보를 추출하지 못했습니다.")
  }

  const parsed = parseData.parsed
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })

  // 2) GCal 전용으로 일정 생성 (파싱된 날짜 사용, 없으면 오늘)
  const res = await fetch("/api/dakota/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: parsed.name,
      date_start: parsed.date_start || today,
      date_end: parsed.date_end,
      place: parsed.place,
      category: parsed.category,
      topic: parsed.topic,
      targets: ["gcal"],
    }),
  })

  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    throw new Error(data.error ?? "일정 생성 실패")
  }
}

function useDakotaGreeting(): string {
  // 다른 컴포넌트가 이미 캐싱한 weather 쿼리를 그대로 가져옴
  const weatherQuery = useQuery<WeatherData>({
    queryKey: ["weather"],
    enabled: false, // 직접 호출 안 함, 캐시만 읽음
  })
  // queryKey가 [lat, lon] 까지 포함되므로 prefix 매칭으로 다시 시도
  const queryClient = useQueryClient()
  const cached = weatherQuery.data
    ?? queryClient.getQueriesData<WeatherData>({ queryKey: ["weather"] })
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

function useDakotaImage(): { image: string; mode: DakotaMode; setMode: (m: DakotaMode) => void } {
  const now = new Date()
  const dateKey = dateKeySeoul(now)
  const slot = getSlot(now)
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

  const image = pickDakotaPhoto(mode, slot, dateKey)
  return { image, mode, setMode }
}

function formatTimeRange(start: string, end: string | null): string {
  const hasTime = start.includes("T")
  if (!hasTime) return "종일"

  const startDate = new Date(start)
  const endDate = end ? new Date(end) : null
  const startLabel = startDate.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  if (!endDate) return startLabel

  const endLabel = endDate.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  return `${startLabel} - ${endLabel}`
}

function formatUpcomingDate(start: string): string {
  const dateStr = start.slice(0, 10)
  const date = new Date(dateStr + "T00:00:00+09:00")
  return date.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  })
}

function sourceLabel(source: DashboardScheduleItem["source"]): string {
  if (source === "both") return "Both"
  if (source === "notion") return "Notion"
  return "GCal"
}

export function MorningBriefing() {
  const queryClient = useQueryClient()
  const [quickName, setQuickName] = useState("")
  const [quickAddError, setQuickAddError] = useState<string | null>(null)

  const { data: schedules, isLoading, error } = useQuery({
    queryKey: ["dashboard-schedule"],
    queryFn: fetchSchedule,
    refetchInterval: 60000,
  })

  const { data: upcoming } = useQuery({
    queryKey: ["dashboard-upcoming"],
    queryFn: fetchUpcoming,
    refetchInterval: 60000,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => createQuickSchedule(name),
    onSuccess: async () => {
      setQuickName("")
      setQuickAddError(null)
      await queryClient.invalidateQueries({ queryKey: ["dashboard-schedule"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard-upcoming"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard-calendar"] })
    },
    onError: (err) => {
      setQuickAddError(err instanceof Error ? err.message : "일정 생성 중 오류가 발생했습니다.")
    },
  })

  const handleQuickAdd = (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (createMutation.isPending) return
    setQuickAddError(null)
    const name = quickName.trim()
    if (!name) {
      setQuickAddError("일정명을 입력하세요.")
      return
    }
    createMutation.mutate(name)
  }

  const weatherLocation = useWeatherLocation()

  const now = new Date()
  const dateStr = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  })

  const upcomingItem = (upcoming ?? [])[0] ?? null
  const quickAddErrorMessage = quickAddError ?? (createMutation.isError
    ? (createMutation.error instanceof Error ? createMutation.error.message : "일정 생성 중 오류")
    : null)

  const greeting = useDakotaGreeting()

  return (
    <div className="space-y-6">
      <DakotaGreetingChat
        greeting={greeting}
        dateStr={dateStr}
        weatherLocation={weatherLocation}
      />

      {/* 오늘 일정 */}
      <div>
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider">
            오늘 일정
          </h3>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full bg-muted" />
            <Skeleton className="h-16 w-full bg-muted" />
          </div>
        ) : error ? (
          <p className="text-red-400 text-sm">일정을 불러오지 못했습니다.</p>
        ) : (schedules ?? []).length === 0 ? (
          <EmptyState icon="📅" message="오늘 일정이 없습니다." />
        ) : (
          <div className="space-y-2">
            {(schedules ?? []).map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border bg-card px-4 py-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-foreground text-sm font-medium truncate">{item.title}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatTimeRange(item.start, item.end)}</span>
                    {item.location && <span className="truncate">- {item.location}</span>}
                  </div>
                </div>
                <Badge variant="outline" className="border-border text-foreground/90">
                  {sourceLabel(item.source)}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 다가오는 일정 */}
      {upcomingItem && (
        <div>
          <h3 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider mb-3">
            다가오는 일정
          </h3>
          <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-foreground text-sm font-medium truncate">{upcomingItem.title}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatUpcomingDate(upcomingItem.start)}</span>
                {upcomingItem.start.includes("T") && (
                  <span>{formatTimeRange(upcomingItem.start, upcomingItem.end)}</span>
                )}
                {upcomingItem.location && <span className="truncate">- {upcomingItem.location}</span>}
              </div>
            </div>
            <Badge variant="outline" className="border-border text-foreground/90">
              {sourceLabel(upcomingItem.source)}
            </Badge>
          </div>
        </div>
      )}

      {/* 빠른 일정 추가 */}
      <form onSubmit={handleQuickAdd} className="flex gap-2">
        <Input
          value={quickName}
          onChange={(e) => setQuickName(e.target.value)}
          placeholder="자연어로 일정 추가 (예: 오늘 봉산짬뽕에서 점심 식사)"
          className="bg-muted border-border text-foreground"
          disabled={createMutation.isPending}
        />
        <Button
          type="submit"
          size="sm"
          disabled={createMutation.isPending}
          className="bg-blue-600 hover:bg-blue-500 text-white"
        >
          {createMutation.isPending ? "파싱 중..." : "추가"}
        </Button>
      </form>
      {quickAddErrorMessage && (
        <p className="-mt-4 text-xs text-red-300">오류: {quickAddErrorMessage}</p>
      )}
    </div>
  )
}
