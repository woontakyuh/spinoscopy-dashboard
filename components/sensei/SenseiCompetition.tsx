"use client"

import { useState, useEffect, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  loadMyCompetitions,
  saveMyCompetitions,
  FOLLOWED_EVENTS,
} from "@/lib/sensei/competitions"
import type { MyCompetition, FollowedEvent } from "@/lib/types/sensei"

function dDay(dateStr: string): string {
  const diff = Math.ceil(
    (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  if (diff > 0) return `D-${diff}`
  if (diff === 0) return "D-Day"
  return `D+${Math.abs(diff)}`
}

const STATUS_COLORS: Record<MyCompetition["status"], string> = {
  미정: "bg-zinc-700 text-zinc-300",
  참가예정: "bg-blue-600/80 text-blue-100",
  등록완료: "bg-green-600/80 text-green-100",
  완료: "bg-purple-600/80 text-purple-100",
  불참: "bg-red-600/80 text-red-100",
}

function RuleSetBadge({ ruleSet }: { ruleSet: "gi" | "nogi" | "both" }) {
  const cls =
    ruleSet === "gi"
      ? "bg-blue-600/70 text-blue-100"
      : ruleSet === "nogi"
        ? "bg-red-600/70 text-red-100"
        : "bg-purple-600/70 text-purple-100"
  const label = ruleSet === "gi" ? "Gi" : ruleSet === "nogi" ? "NoGi" : "Both"
  return (
    <Badge className={`${cls} border-0 text-[10px] px-1.5 py-0`}>
      {label}
    </Badge>
  )
}

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
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(INITIAL_FORM)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setComps(loadMyCompetitions())
    setMounted(true)
  }, [])

  function addCompetition() {
    if (!form.name || !form.date) return
    const newComp: MyCompetition = {
      ...form,
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

  const sorted = useMemo(
    () => [...comps].sort((a, b) => a.date.localeCompare(b.date)),
    [comps]
  )

  const stats = useMemo(() => {
    const participated = comps.filter((c) =>
      ["등록완료", "참가예정", "완료"].includes(c.status)
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

  const sortedEvents = useMemo(
    () => [...FOLLOWED_EVENTS].sort((a, b) => a.date.localeCompare(b.date)),
    []
  )

  if (!mounted) {
    return (
      <div className="text-zinc-500 text-sm p-8 text-center">
        Competition loading...
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* === 내 대회 === */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">내 대회</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "취소" : "대회 추가"}
          </Button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-center">
            <div className="text-xl font-bold text-white">{stats.total}</div>
            <div className="text-[11px] text-zinc-400">총 참가</div>
          </div>
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-center">
            <div className="text-xl font-bold text-white">
              {stats.wins}
              <span className="text-zinc-500 mx-0.5">/</span>
              {stats.losses}
            </div>
            <div className="text-[11px] text-zinc-400">전적 (승/패)</div>
          </div>
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-center">
            <div className="text-xl font-bold text-white">
              {stats.completed}
            </div>
            <div className="text-[11px] text-zinc-400">완료</div>
          </div>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 mb-5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                placeholder="대회 이름 *"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                type="date"
                className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-600"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
              <input
                className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                placeholder="장소"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
              <input
                className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                placeholder="주최 (IBJJF, AJP, etc.)"
                value={form.organization}
                onChange={(e) =>
                  setForm({ ...form, organization: e.target.value })
                }
              />
              <select
                className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-600"
                value={form.ruleSet}
                onChange={(e) =>
                  setForm({
                    ...form,
                    ruleSet: e.target.value as "gi" | "nogi" | "both",
                  })
                }
              >
                <option value="gi">Gi</option>
                <option value="nogi">NoGi</option>
                <option value="both">Both</option>
              </select>
              <input
                className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                placeholder="디비전 (Adult Blue 등)"
                value={form.division}
                onChange={(e) => setForm({ ...form, division: e.target.value })}
              />
              <select
                className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-600"
                value={form.status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    status: e.target.value as MyCompetition["status"],
                  })
                }
              >
                <option value="미정">미정</option>
                <option value="참가예정">참가예정</option>
                <option value="등록완료">등록완료</option>
                <option value="완료">완료</option>
                <option value="불참">불참</option>
              </select>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={addCompetition} disabled={!form.name || !form.date}>
                추가
              </Button>
            </div>
          </div>
        )}

        {/* Card list */}
        {sorted.length === 0 ? (
          <div className="text-zinc-500 text-sm text-center py-6">
            등록된 대회가 없습니다
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((comp) => (
              <CompCard key={comp.id} comp={comp} onRemove={removeCompetition} />
            ))}
          </div>
        )}
      </section>

      {/* === Following (International Events) === */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">
          Following — 2026 Major Events
        </h2>
        <div className="space-y-3">
          {sortedEvents.map((ev) => (
            <EventCard key={ev.id} event={ev} />
          ))}
        </div>
      </section>
    </div>
  )
}

function CompCard({
  comp,
  onRemove,
}: {
  comp: MyCompetition
  onRemove: (id: string) => void
}) {
  const isPast = new Date(comp.date) < new Date()
  const ddayStr = dDay(comp.date)

  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white text-sm">
              {comp.name}
            </span>
            <Badge className={`${STATUS_COLORS[comp.status]} border-0 text-[10px] px-1.5 py-0`}>
              {comp.status}
            </Badge>
            <RuleSetBadge ruleSet={comp.ruleSet} />
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-zinc-400 flex-wrap">
            <span>{comp.date}</span>
            <span>{comp.location}</span>
            {comp.organization && <span>{comp.organization}</span>}
            {comp.division && (
              <span className="text-zinc-500">{comp.division}</span>
            )}
            {comp.weightClass && (
              <span className="text-zinc-500">{comp.weightClass}</span>
            )}
          </div>
          {comp.registrationDeadline && comp.status !== "완료" && (
            <div className="mt-1 text-[11px] text-zinc-500">
              등록 마감: {comp.registrationDeadline} ({dDay(comp.registrationDeadline)})
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`text-sm font-mono font-bold ${
              isPast ? "text-zinc-500" : "text-amber-400"
            }`}
          >
            {ddayStr}
          </span>
          <button
            onClick={() => onRemove(comp.id)}
            className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors"
          >
            삭제
          </button>
        </div>
      </div>

      {/* Match results for 완료 */}
      {comp.status === "완료" && comp.matchResults && comp.matchResults.length > 0 && (
        <div className="mt-3 border-t border-zinc-800 pt-3">
          <div className="text-[11px] text-zinc-500 mb-1.5 font-medium">
            경기 결과
          </div>
          <div className="space-y-1">
            {comp.matchResults.map((m, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-zinc-300"
              >
                <span className="text-zinc-500 w-16 shrink-0">{m.round}</span>
                <Badge
                  className={`border-0 text-[10px] px-1.5 py-0 ${
                    m.result === "승"
                      ? "bg-green-600/80 text-green-100"
                      : m.result === "패"
                        ? "bg-red-600/80 text-red-100"
                        : "bg-zinc-600 text-zinc-200"
                  }`}
                >
                  {m.result}
                </Badge>
                {m.opponent && <span>vs {m.opponent}</span>}
                {m.method && (
                  <span className="text-zinc-500">{m.method}</span>
                )}
                {m.points && (
                  <span className="text-zinc-500">{m.points}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {comp.status === "완료" && comp.result && (
        <div className="mt-2 text-xs text-amber-400 font-medium">
          결과: {comp.result}
        </div>
      )}
    </div>
  )
}

function EventCard({ event }: { event: FollowedEvent }) {
  const isPast = new Date(event.date) < new Date()
  const ddayStr = dDay(event.date)
  const hasCoach = event.coachEntries && event.coachEntries.length > 0

  return (
    <div
      className={`rounded-lg border p-4 ${
        hasCoach
          ? "bg-zinc-900 border-amber-700/40"
          : "bg-zinc-900/60 border-zinc-800"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white text-sm">
              {event.name}
            </span>
            <RuleSetBadge ruleSet={event.ruleSet} />
            <Badge className="bg-zinc-700 text-zinc-300 border-0 text-[10px] px-1.5 py-0">
              {event.organization}
            </Badge>
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-zinc-400">
            <span>{event.date}</span>
            <span>{event.location}</span>
          </div>
        </div>
        <span
          className={`text-sm font-mono font-bold shrink-0 ${
            isPast ? "text-zinc-500" : "text-zinc-300"
          }`}
        >
          {ddayStr}
        </span>
      </div>

      {hasCoach && (
        <div className="mt-3 border-t border-zinc-800 pt-2.5 space-y-1">
          {event.coachEntries!.map((entry, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <Badge className="bg-amber-600/80 text-amber-100 border-0 text-[10px] px-1.5 py-0">
                {entry.name}
              </Badge>
              <span className="text-zinc-400">{entry.division}</span>
              {entry.result && (
                <span className="text-amber-400 font-medium">
                  {entry.result}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
