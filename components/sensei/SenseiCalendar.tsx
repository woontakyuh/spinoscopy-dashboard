"use client"

import { useState, useRef, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { SenseiEntry } from "@/lib/types/sensei"

function getMonthData(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return { firstDay, daysInMonth }
}

function toDateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

interface ContextMenuState {
  x: number
  y: number
  date: string
}

interface SenseiCalendarProps {
  onDateSelect?: (date: string) => void
}

export function SenseiCalendar({ onDateSelect }: SenseiCalendarProps) {
  const today = new Date()
  const queryClient = useQueryClient()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [promotionNote, setPromotionNote] = useState("")
  const [promotionBelt, setPromotionBelt] = useState("blue")
  const [promotionStripes, setPromotionStripes] = useState(3)
  const [showPromotionForm, setShowPromotionForm] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 컨텍스트 메뉴 외부 클릭 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    if (contextMenu) {
      document.addEventListener("mousedown", handleClick)
      return () => document.removeEventListener("mousedown", handleClick)
    }
  }, [contextMenu])

  const entriesQuery = useQuery({
    queryKey: ["sensei-entries"],
    queryFn: async () => {
      const res = await fetch("/api/notion/sensei")
      if (!res.ok) throw new Error("수련 기록 조회 실패")
      return res.json() as Promise<SenseiEntry[]>
    },
  })

  const promotionMutation = useMutation({
    mutationFn: async ({ date, note }: { date: string; note?: string }) => {
      const res = await fetch("/api/notion/sensei", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "promotion", date, note: note || undefined }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "저장 실패" }))
        throw new Error(body.error ?? "저장 실패")
      }
      return res.json()
    },
    onSuccess: () => {
      setShowPromotionForm(null)
      setPromotionNote("")
      queryClient.invalidateQueries({ queryKey: ["sensei-entries"] })
    },
  })

  const entries = entriesQuery.data ?? []

  const dateMap = new Map<string, SenseiEntry[]>()
  for (const entry of entries) {
    if (!entry.date) continue
    const key = entry.date.slice(0, 10)
    const list = dateMap.get(key) ?? []
    list.push(entry)
    dateMap.set(key, list)
  }

  const { firstDay, daysInMonth } = getMonthData(viewYear, viewMonth)
  const selectedEntries = selectedDate ? (dateMap.get(selectedDate) ?? []) : []

  const totalThisMonth = Array.from(dateMap.entries())
    .filter(([key]) => key.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`))
    .reduce((sum, [, list]) => sum + list.length, 0)

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1)
      setViewMonth(11)
    } else {
      setViewMonth(viewMonth - 1)
    }
    setSelectedDate(null)
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1)
      setViewMonth(0)
    } else {
      setViewMonth(viewMonth + 1)
    }
    setSelectedDate(null)
  }

  function sessionBadge(type: string) {
    if (type === "promotion") return { label: "승급식", border: "border-yellow-500/40", text: "text-yellow-300" }
    if (type === "openmat") return { label: "Open Mat", border: "border-green-500/40", text: "text-green-300" }
    return { label: "Class", border: "border-purple-500/40", text: "text-purple-300" }
  }

  return (
    <div className="border border-border rounded-xl p-4 bg-card space-y-4 relative">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 border-border text-foreground/90"
          onClick={prevMonth}
        >
          ◀
        </Button>
        <div className="text-center">
          <p className="text-foreground text-sm font-medium">
            {viewYear}년 {viewMonth + 1}월
          </p>
          <p className="text-muted-foreground text-xs">
            이번 달 {totalThisMonth}회 수련
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 border-border text-foreground/90"
          onClick={nextMonth}
        >
          ▶
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className={`text-center text-xs py-1 ${day === "일" ? "text-red-400" : day === "토" ? "text-blue-400" : "text-muted-foreground"}`}
          >
            {day}
          </div>
        ))}

        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${String(i)}`} className="min-h-[2.75rem]" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateKey = toDateKey(viewYear, viewMonth, day)
          const dayEntries = dateMap.get(dateKey)
          const hasEntry = !!dayEntries
          const isToday = dateKey === toDateKey(today.getFullYear(), today.getMonth(), today.getDate())
          const isSelected = dateKey === selectedDate
          const hasClass = dayEntries?.some((e) => e.sessionType === "class")
          const hasOpenMat = dayEntries?.some((e) => e.sessionType === "openmat")
          const hasPromotion = dayEntries?.some((e) => e.sessionType === "promotion")
          const dayTags = dayEntries
            ? [...new Set([...dayEntries.flatMap((e) => e.classTags), ...dayEntries.flatMap((e) => e.sparringTags)])]
            : []

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => {
                const newDate = isSelected ? null : dateKey
                setSelectedDate(newDate)
                if (newDate) onDateSelect?.(newDate)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({ x: e.clientX, y: e.clientY, date: dateKey })
              }}
              className={`
                relative rounded-md text-xs flex flex-col items-center justify-start pt-1 min-h-[2.75rem] transition-colors overflow-hidden
                ${isSelected ? "ring-2 ring-orange-500 bg-muted" : ""}
                ${isToday && !isSelected ? "ring-1 ring-zinc-500" : ""}
                ${hasPromotion ? "bg-yellow-900/40 hover:bg-yellow-800/50 cursor-pointer font-bold ring-1 ring-yellow-500/50" : ""}
                ${hasEntry && !hasPromotion ? "bg-muted hover:bg-muted cursor-pointer font-medium" : ""}
                ${!hasEntry ? "text-muted-foreground/70 hover:bg-muted/50" : ""}
                ${hasEntry ? "text-foreground" : ""}
              `}
            >
              {hasPromotion && (
                <span className="absolute top-0 right-0.5 text-[8px] leading-none">🏅</span>
              )}
              <span className="leading-none">{day}</span>
              {dayTags.length > 0 && (
                <div className="flex flex-wrap justify-center gap-x-0.5 gap-y-0 mt-0.5 max-w-full px-px">
                  {dayTags.slice(0, 2).map((tag) => (
                    <span key={tag} className="text-[7px] leading-tight text-orange-300/80">{tag}</span>
                  ))}
                  {dayTags.length > 2 && (
                    <span className="text-[7px] leading-tight text-muted-foreground">+{dayTags.length - 2}</span>
                  )}
                </div>
              )}
              {hasEntry && (
                <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                  {hasClass && <div className="w-1 h-1 rounded-full bg-purple-400" />}
                  {hasOpenMat && <div className="w-1 h-1 rounded-full bg-green-400" />}
                  {hasPromotion && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* 우클릭 컨텍스트 메뉴 */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-muted border border-border rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <p className="px-3 py-1 text-muted-foreground text-[10px] border-b border-border">
            {contextMenu.date}
          </p>
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm text-yellow-300 hover:bg-muted flex items-center gap-2"
            onClick={() => {
              setShowPromotionForm(contextMenu.date)
              setPromotionNote("")
              setContextMenu(null)
            }}
          >
            🏅 승급식 입력
          </button>
        </div>
      )}

      {/* 승급식 입력 폼 */}
      {showPromotionForm && (
        <div className="border border-yellow-500/40 rounded-lg p-4 bg-muted/80 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-yellow-300 text-sm font-medium">🏅 승급식 입력 — {showPromotionForm}</p>
            <button
              type="button"
              onClick={() => setShowPromotionForm(null)}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              ✕
            </button>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-foreground/90 text-xs font-medium">벨트</label>
            <select
              value={promotionBelt}
              onChange={(e) => setPromotionBelt(e.target.value)}
              className="rounded-lg border border-border bg-muted text-foreground px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-yellow-500 [color-scheme:dark]"
            >
              <option value="white">White</option>
              <option value="blue">Blue</option>
              <option value="purple">Purple</option>
              <option value="brown">Brown</option>
              <option value="black">Black</option>
            </select>
            <label className="text-foreground/90 text-xs font-medium">그랄</label>
            <select
              value={promotionStripes}
              onChange={(e) => setPromotionStripes(Number(e.target.value))}
              className="rounded-lg border border-border bg-muted text-foreground px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-yellow-500 [color-scheme:dark]"
            >
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <textarea
            value={promotionNote}
            onChange={(e) => setPromotionNote(e.target.value)}
            placeholder="승급 내용 메모 (선택사항)"
            className="w-full min-h-16 rounded-lg border border-border bg-muted text-foreground placeholder:text-muted-foreground p-3 text-sm outline-none focus:ring-2 focus:ring-yellow-500"
          />
          {promotionMutation.isError && (
            <p className="text-red-400 text-xs">오류: {promotionMutation.error.message}</p>
          )}
          <Button
            type="button"
            className="w-full bg-yellow-600 hover:bg-yellow-500 text-foreground"
            disabled={promotionMutation.isPending}
            onClick={() => {
              const beltTag = `[BELT:${promotionBelt}:${promotionStripes}]`
              const fullNote = promotionNote.trim() ? `${beltTag} ${promotionNote.trim()}` : beltTag
              promotionMutation.mutate({ date: showPromotionForm, note: fullNote })
            }}
          >
            {promotionMutation.isPending ? "저장 중..." : "승급식 저장"}
          </Button>
        </div>
      )}

      {selectedDate && (
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-muted-foreground text-xs">{selectedDate} 수련 기록</p>
          {selectedEntries.length === 0 ? (
            <p className="text-muted-foreground text-xs">기록이 없습니다.</p>
          ) : (
            selectedEntries.map((entry) => {
              const badge = sessionBadge(entry.sessionType)
              return (
                <div key={entry.id} className={`border rounded-lg p-3 bg-muted/50 space-y-2 ${entry.sessionType === "promotion" ? "border-yellow-500/40" : "border-border"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-foreground text-sm font-medium">{entry.title}</p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${badge.border} ${badge.text}`}
                    >
                      {badge.label}
                    </Badge>
                    {entry.instructor && (
                      <Badge variant="outline" className="text-[10px] border-border text-foreground/90">
                        {entry.instructor}
                      </Badge>
                    )}
                  </div>
                  {(entry.classTags.length > 0 || entry.sparringTags.length > 0) && (
                    <div className="flex flex-wrap gap-1">
                      {entry.classTags.map((tag) => (
                        <Badge key={`cal-c-${entry.id}-${tag}`} variant="outline" className="text-[10px] border-orange-500/40 text-orange-300">
                          Class: {tag}
                        </Badge>
                      ))}
                      {entry.sparringTags.map((tag) => (
                        <Badge key={`cal-s-${entry.id}-${tag}`} variant="outline" className="text-[10px] border-blue-500/40 text-blue-300">
                          Sparring: {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {entry.note && <p className="text-foreground/90 text-xs whitespace-pre-wrap">{entry.note}</p>}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
