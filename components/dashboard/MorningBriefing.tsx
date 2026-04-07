"use client"

import { useState, useRef, useEffect, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useChat } from "@ai-sdk/react"
import { TextStreamChatTransport } from "ai"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { WeatherInline, useWeatherLocation } from "@/components/dashboard/WeatherInline"
import { EmptyState } from "@/components/ui/empty-state"

function getChatText(parts: Array<{ type: string; text?: string }>): string {
  return parts.filter((p) => p.type === "text" && p.text).map((p) => p.text).join("")
}

function DakotaGreetingChat({
  greeting,
  image,
  dateStr,
  weatherLocation,
}: {
  greeting: string
  image: string
  dateStr: string
  weatherLocation: string | null
}) {
  const [inputValue, setInputValue] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status, error } = useChat({
    transport: new TextStreamChatTransport({
      api: "/api/ai/chat",
      body: { agentId: "dakota" },
    }),
    onError: (err) => {
      console.error("[DakotaChat] error:", err)
    },
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

return (
    <div className="pt-2 md:pt-4 flex items-start gap-3 md:gap-4">
      {/* Dakota 캐릭터 (시간대별) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt="Dakota"
        className="w-28 md:w-40 h-auto object-contain shrink-0 select-none"
        draggable={false}
      />

      <div className="relative flex-1 min-w-0 mt-2 md:mt-3 space-y-2">
        {/* 인사 말풍선 (Dakota의 첫 메시지) */}
        <div className="relative bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 md:px-5 md:py-4 shadow-lg">
          <span
            aria-hidden
            className="absolute -left-2 top-3 w-3 h-3 rotate-45 bg-card border-l border-t border-border"
          />
          <h2 className="text-xl md:text-2xl font-semibold text-foreground tracking-tight">
            {greeting}
          </h2>
          <div className="mt-1">
            <WeatherInline />
          </div>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">
            {dateStr}{weatherLocation && <span className="ml-2 text-muted-foreground/70">· {weatherLocation}</span>}
          </p>
        </div>

        {/* 후속 대화 메시지들 */}
        {messages.length > 0 && (
          <div ref={scrollRef} className="max-h-[280px] overflow-y-auto space-y-2 pr-1">
            {messages.map((m) => {
              const text = getChatText(m.parts)
              if (!text) return null
              return (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
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
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 px-1">
            오류: {error.message || "응답을 가져오지 못했습니다."}
          </div>
        )}

        {/* 입력창 */}
        <form onSubmit={handleSubmit} className="flex gap-2 pt-1">
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

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "좋은 아침이에요, 센터장님."
  if (hour < 18) return "안녕하세요 센터장님, 오후도 활기차게 보내시죠."
  return "오늘 하루도 고생 많으셨어요, 센터장님."
}

function getDakotaImage(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "/dakota-morning.png"
  if (hour < 18) return "/dakota-afternoon.png"
  return "/dakota-evening.png"
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

  return (
    <div className="space-y-6">
      <DakotaGreetingChat
        greeting={getGreeting()}
        image={getDakotaImage()}
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
