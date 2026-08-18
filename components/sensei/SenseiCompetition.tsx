"use client"

import { useState, useEffect, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import {
  loadMyCompetitions,
  saveMyCompetitions,
  FOLLOWED_EVENTS,
} from "@/lib/sensei/competitions"
import { competitionDday, getSeoulDateKey } from "@/lib/sensei/date"
import type { MyCompetition, FollowedEvent } from "@/lib/types/sensei"

// ─── date utils (MonthCalendar 스타일) ─────────────────────────

function getCurrentMonthSeoul(): string {
  return getSeoulDateKey().slice(0, 7)
}
function getMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return `${y}년 ${m}월`
}
function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number)
  if (m === 1) return `${y - 1}-12`
  return `${y}-${String(m - 1).padStart(2, "0")}`
}
function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number)
  if (m === 12) return `${y + 1}-01`
  return `${y}-${String(m + 1).padStart(2, "0")}`
}
function getDaysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m, 0).getDate()
}
function getFirstDayOfWeek(month: string): number {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1, 1).getDay()
}
function formatSelectedDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00+09:00")
  return date.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  })
}
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

// ─── 통합 이벤트 모델 ────────────────────────────────────────

interface CalendarEvent {
  id: string
  title: string
  date: string
  source: "mine" | "followed"
  ruleSet: "gi" | "nogi" | "both"
  location: string
  organization?: string
  division?: string
  status?: MyCompetition["status"]
  coachEntries?: FollowedEvent["coachEntries"]
  notes?: string
  url?: string
}

function myCompToEvent(c: MyCompetition): CalendarEvent {
  return {
    id: c.id,
    title: c.name,
    date: c.date,
    source: "mine",
    ruleSet: c.ruleSet,
    location: c.location,
    organization: c.organization,
    division: c.division,
    status: c.status,
  }
}

function followedToEvent(e: FollowedEvent): CalendarEvent {
  return {
    id: e.id,
    title: e.name,
    date: e.date,
    source: "followed",
    ruleSet: e.ruleSet,
    location: e.location,
    organization: e.organization,
    coachEntries: e.coachEntries,
    notes: e.notes,
    url: e.url,
  }
}

function eventChipClass(ev: CalendarEvent): string {
  if (ev.source === "mine") {
    switch (ev.status) {
      case "등록완료": return "bg-green-500/20 text-green-700 dark:text-green-300"
      case "참가예정": return "bg-blue-500/20 text-blue-700 dark:text-blue-300"
      case "완료": return "bg-purple-500/20 text-purple-700 dark:text-purple-300"
      case "불참": return "bg-red-500/20 text-red-700 dark:text-red-300"
      default: return "bg-zinc-500/20 text-zinc-700 dark:text-zinc-300"
    }
  }
  const hasCoach = ev.coachEntries && ev.coachEntries.length > 0
  return hasCoach
    ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
    : "bg-zinc-500/20 text-zinc-700 dark:text-zinc-300"
}

function eventBarClass(ev: CalendarEvent): string {
  if (ev.source === "mine") {
    switch (ev.status) {
      case "등록완료": return "bg-green-500"
      case "참가예정": return "bg-blue-500"
      case "완료": return "bg-purple-500"
      case "불참": return "bg-red-500"
      default: return "bg-zinc-500"
    }
  }
  const hasCoach = ev.coachEntries && ev.coachEntries.length > 0
  return hasCoach ? "bg-amber-500" : "bg-zinc-500"
}

function RuleSetBadge({ ruleSet }: { ruleSet: "gi" | "nogi" | "both" }) {
  const cls =
    ruleSet === "gi"
      ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
      : ruleSet === "nogi"
        ? "bg-red-500/15 text-red-700 dark:text-red-300"
        : "bg-purple-500/15 text-purple-700 dark:text-purple-300"
  const label = ruleSet === "gi" ? "Gi" : ruleSet === "nogi" ? "NoGi" : "Both"
  return <Badge className={`${cls} border-0 text-[11px] px-1.5 py-0`}>{label}</Badge>
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────

const INITIAL_FORM: Omit<MyCompetition, "id"> = {
  name: "",
  date: "",
  location: "",
  ruleSet: "gi",
  organization: "",
  division: "",
  status: "미정",
}

export function SenseiCompetition() {
  const [comps, setComps] = useState<MyCompetition[]>([])
  const [mounted, setMounted] = useState(false)
  const today = getSeoulDateKey()
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonthSeoul)
  const [selectedDate, setSelectedDate] = useState(today)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(INITIAL_FORM)

  useEffect(() => {
    setComps(loadMyCompetitions())
    setMounted(true)
  }, [])

  function addCompetition() {
    const date = form.date || selectedDate
    if (!form.name || !date) return
    const newComp: MyCompetition = {
      ...form,
      date,
      id: Date.now().toString(),
    }
    const updated = [...comps, newComp]
    setComps(updated)
    saveMyCompetitions(updated)
    setForm(INITIAL_FORM)
    setShowForm(false)
  }

  function removeCompetition(id: string) {
    const updated = comps.filter((c) => c.id !== id)
    setComps(updated)
    saveMyCompetitions(updated)
  }

  const allEvents: CalendarEvent[] = useMemo(
    () => [...comps.map(myCompToEvent), ...FOLLOWED_EVENTS.map(followedToEvent)],
    [comps],
  )

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of allEvents) {
      const key = ev.date
      const existing = map.get(key) ?? []
      existing.push(ev)
      map.set(key, existing)
    }
    return map
  }, [allEvents])

  const selectedEvents = eventsByDate.get(selectedDate) ?? []

  const stats = useMemo(() => {
    const participated = comps.filter((c) =>
      ["등록완료", "참가예정", "완료"].includes(c.status),
    )
    const completed = comps.filter((c) => c.status === "완료")
    let wins = 0
    let losses = 0
    for (const c of completed) {
      for (const m of c.matchResults ?? []) {
        if (m.result === "승") wins++
        if (m.result === "패") losses++
      }
    }
    return { total: participated.length, completed: completed.length, wins, losses }
  }, [comps])

  const daysInMonth = getDaysInMonth(currentMonth)
  const firstDay = getFirstDayOfWeek(currentMonth)

  const goToToday = () => {
    const t = getSeoulDateKey()
    setCurrentMonth(t.slice(0, 7))
    setSelectedDate(t)
  }

  if (!mounted) {
    return (
      <div className="text-muted-foreground/70 text-[13px] p-8 text-center">
        Loading...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* === Summary stats === */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-muted border border-border p-3 text-center">
          <div className="text-[24px] font-semibold text-foreground">{stats.total}</div>
          <div className="text-[11px] text-muted-foreground">총 참가</div>
        </div>
        <div className="rounded-xl bg-muted border border-border p-3 text-center">
          <div className="text-[24px] font-semibold text-foreground">
            {stats.wins}
            <span className="text-muted-foreground/70 mx-0.5">/</span>
            {stats.losses}
          </div>
          <div className="text-[11px] text-muted-foreground">전적 (승/패)</div>
        </div>
        <div className="rounded-xl bg-muted border border-border p-3 text-center">
          <div className="text-[24px] font-semibold text-foreground">{stats.completed}</div>
          <div className="text-[11px] text-muted-foreground">완료</div>
        </div>
      </div>

      {/* === Calendar === */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        {/* Header */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentMonth(prevMonth(currentMonth))}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <h3 className="text-base font-semibold text-foreground min-w-[100px] text-center">
              {getMonthLabel(currentMonth)}
            </h3>
            <button
              onClick={() => setCurrentMonth(nextMonth(currentMonth))}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goToToday}
              className="text-xs border-border text-foreground/90 hover:bg-muted"
            >
              오늘
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowForm((v) => !v)}
              className="text-xs border-border text-foreground/90 hover:bg-muted"
            >
              {showForm ? "취소" : "대회 추가"}
            </Button>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-0">
          {WEEKDAYS.map((day, i) => (
            <div
              key={day}
              className={`text-center text-xs font-medium py-2 ${
                i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-muted-foreground"
              }`}
            >
              {day}
            </div>
          ))}

          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="py-2" />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dateStr = `${currentMonth}-${String(day).padStart(2, "0")}`
            const isToday = dateStr === today
            const isSelected = dateStr === selectedDate
            const dayEvents = eventsByDate.get(dateStr) ?? []
            const dayOfWeek = (firstDay + i) % 7

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`p-1 flex flex-col items-start rounded-lg text-sm transition-colors relative min-h-[68px] md:min-h-[76px] overflow-hidden
                  ${isSelected ? "bg-muted ring-1 ring-amber-500" : "hover:bg-muted/60"}
                  ${isToday && !isSelected ? "ring-1 ring-zinc-600" : ""}
                `}
              >
                <span
                  className={`text-xs self-end mr-0.5
                    ${isToday ? "font-bold text-amber-400" : ""}
                    ${dayOfWeek === 0 ? "text-red-400" : dayOfWeek === 6 ? "text-blue-400" : "text-foreground/90"}
                    ${isSelected ? "text-foreground" : ""}
                  `}
                >
                  {day}
                </span>
                {dayEvents.slice(0, 3).map((ev, ei) => (
                  <div
                    key={ei}
                    title={ev.title}
                    className={`mt-px w-full truncate rounded-sm px-0.5 text-[9px] leading-tight md:text-[10px] ${eventChipClass(ev)}`}
                  >
                    {ev.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[7px] text-muted-foreground mt-px">
                    +{dayEvents.length - 3}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Selected date detail */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-foreground/90">
              {formatSelectedDate(selectedDate)}
            </h4>
            <span
              className={`text-xs font-mono ${
                selectedDate < today
                  ? "text-muted-foreground/70"
                  : "text-amber-400"
              }`}
            >
              {competitionDday(selectedDate, today)}
            </span>
          </div>

          {selectedEvents.length === 0 ? (
            <EmptyState icon="🥋" message="이 날 예정된 대회가 없습니다." />
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((ev) => (
                <EventCard
                  key={ev.id}
                  event={ev}
                  onRemove={ev.source === "mine" ? () => removeCompetition(ev.id) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        {/* Add form */}
        {showForm && (
          <div className="mt-4 rounded-xl bg-muted border border-border p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                className="w-full rounded-xl bg-muted border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-border"
                placeholder="대회 이름 *"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                type="date"
                className="w-full rounded-xl bg-muted border border-border px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-border"
                value={form.date || selectedDate}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
              <input
                className="w-full rounded-xl bg-muted border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-border"
                placeholder="장소"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
              <input
                className="w-full rounded-xl bg-muted border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-border"
                placeholder="주최 (IBJJF, AJP, etc.)"
                value={form.organization}
                onChange={(e) => setForm({ ...form, organization: e.target.value })}
              />
              <select
                className="w-full rounded-xl bg-muted border border-border px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-border"
                value={form.ruleSet}
                onChange={(e) => setForm({ ...form, ruleSet: e.target.value as "gi" | "nogi" | "both" })}
              >
                <option value="gi">Gi</option>
                <option value="nogi">NoGi</option>
                <option value="both">Both</option>
              </select>
              <input
                className="w-full rounded-xl bg-muted border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-border"
                placeholder="디비전 (Adult Blue 등)"
                value={form.division}
                onChange={(e) => setForm({ ...form, division: e.target.value })}
              />
              <select
                className="w-full rounded-xl bg-muted border border-border px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-border sm:col-span-2"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as MyCompetition["status"] })}
              >
                <option value="미정">미정</option>
                <option value="참가예정">참가예정</option>
                <option value="등록완료">등록완료</option>
                <option value="완료">완료</option>
                <option value="불참">불참</option>
              </select>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={addCompetition}
                disabled={!form.name || !(form.date || selectedDate)}
              >
                추가
              </Button>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          <LegendDot color="bg-green-500" label="등록완료" />
          <LegendDot color="bg-blue-500" label="참가예정" />
          <LegendDot color="bg-purple-500" label="완료" />
          <LegendDot color="bg-amber-500" label="코치 출전·관심" />
          <LegendDot color="bg-zinc-500" label="검증된 대회 일정" />
        </div>
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
      {label}
    </span>
  )
}

function EventCard({
  event,
  onRemove,
}: {
  event: CalendarEvent
  onRemove?: () => void
}) {
  const hasCoach = event.source === "followed" && event.coachEntries && event.coachEntries.length > 0
  return (
    <div className="rounded-lg border border-border bg-muted/50 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <div className={`w-0.5 min-h-[32px] rounded-full ${eventBarClass(event)} shrink-0 mt-0.5`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-foreground text-[13px]">{event.title}</span>
              <RuleSetBadge ruleSet={event.ruleSet} />
              {event.status && (
                <Badge className={`${eventChipClass(event)} border-0 text-[11px] px-1.5 py-0`}>
                  {event.status}
                </Badge>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground flex-wrap">
              {event.location && <span>{event.location}</span>}
              {event.organization && <span>· {event.organization}</span>}
              {event.division && (
                <span className="text-muted-foreground/70">· {event.division}</span>
              )}
            </div>
            {hasCoach && (
              <div className="mt-2 flex flex-wrap gap-1">
                {event.coachEntries!.map((c, i) => (
                  <Badge
                    key={i}
                    className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-0 text-[11px] px-1.5 py-0"
                  >
                    {c.name} · {c.division}
                    {c.result ? ` · ${c.result}` : ""}
                  </Badge>
                ))}
              </div>
            )}
            {event.notes && (
              <p className="mt-1.5 text-[11px] text-muted-foreground/80">
                {event.notes}
              </p>
            )}
            {event.url && (
              <a
                href={event.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex text-[11px] font-medium text-orange-400 hover:text-orange-300"
              >
                공식·등록 페이지 ↗
              </a>
            )}
          </div>
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="text-[11px] text-muted-foreground/70 hover:text-[#ef4444] transition-colors shrink-0"
          >
            삭제
          </button>
        )}
      </div>
    </div>
  )
}
