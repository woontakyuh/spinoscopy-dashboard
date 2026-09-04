"use client"

import { useMemo, useState } from "react"
import { BookOpen, ExternalLink, GraduationCap, Play, Swords, Target } from "lucide-react"
import { SenseiCalendar } from "@/components/sensei/SenseiCalendar"
import {
  getTrainingRuleSet,
  isRuleSetTag,
  matchesTrainingFilter,
  type TrainingFilter,
} from "@/lib/sensei/trainingEntry"
import type { SenseiEntry, SenseiSessionType } from "@/lib/types/sensei"
import { SESSION_LABELS } from "@/lib/sensei/sessionLabels"

type TrainingViewProps = {
  readonly entries: readonly SenseiEntry[]
  readonly isLoading?: boolean
}


function currentMonthKey(): string {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
}

function formatDateHeading(date: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 상세`
}

function topKeyword(entries: readonly SenseiEntry[]): string {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    for (const keyword of [...entry.classTags, ...entry.sparringTags, ...entry.studyTags]) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 1)
    }
  }
  return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "미지정"
}

function KeywordGroup({
  icon,
  label,
  keywords,
  color,
}: {
  readonly icon: React.ReactNode
  readonly label: string
  readonly keywords: readonly string[]
  readonly color: string
}) {
  if (keywords.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/70">
        <span className={color}>{icon}</span>
        {label}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {keywords.map((keyword) => (
          <span
            key={keyword}
            className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-foreground/90"
          >
            {keyword}
          </span>
        ))}
      </div>
    </div>
  )
}

function EntryDetail({
  entry,
  activeFilter,
}: {
  readonly entry: SenseiEntry
  readonly activeFilter: TrainingFilter | null
}) {
  const ruleSet = getTrainingRuleSet(entry)

  return (
    <article className="space-y-4 rounded-xl border border-border bg-muted/35 p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-300">
            {SESSION_LABELS[entry.sessionType]}
          </span>
          {ruleSet && (
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              ruleSet === "nogi"
                ? "border-blue-400/30 bg-blue-500/10 text-blue-200"
                : "border-zinc-500/40 bg-zinc-500/10 text-zinc-200"
            }`}>
              {ruleSet === "nogi" ? "No-Gi" : "Gi"}
            </span>
          )}
          {entry.instructor && <span className="text-[11px] text-muted-foreground">{entry.instructor}</span>}
          {entry.gym && <span className="text-[11px] text-muted-foreground">· {entry.gym}</span>}
        </div>
        <h4 className="mt-2 break-keep text-sm font-semibold leading-6 text-foreground">
          {entry.title}
        </h4>
      </div>

      <div className="grid gap-4">
        {(activeFilter === null || activeFilter === "class") && (
          <KeywordGroup
            icon={<GraduationCap className="size-3.5" aria-hidden="true" />}
            label="수업에서 배운 것"
            keywords={entry.classTags.filter((tag) => !isRuleSetTag(tag))}
            color="text-purple-300"
          />
        )}
        {(activeFilter === null || activeFilter === "sparring") && (
          <KeywordGroup
            icon={<Swords className="size-3.5" aria-hidden="true" />}
            label="스파링 포인트"
            keywords={entry.sparringTags.filter((tag) => !isRuleSetTag(tag))}
            color="text-blue-300"
          />
        )}
        {(activeFilter === null || activeFilter === "study") && (
          <KeywordGroup
            icon={<BookOpen className="size-3.5" aria-hidden="true" />}
            label="개인 공부"
            keywords={entry.studyTags}
            color="text-green-300"
          />
        )}
      </div>

      {entry.todayFocus && (
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-orange-300">
            <Target className="size-3.5" aria-hidden="true" />
            오늘의 초점
          </p>
          <p className="mt-1.5 text-sm leading-6 text-foreground/90">{entry.todayFocus}</p>
        </div>
      )}

      {entry.classVideoUrl && (
        <div>
          <p className="text-[11px] font-semibold text-foreground/70">수업 영상</p>
          <a
            href={entry.classVideoUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2.5 py-1.5 text-sm text-foreground/90 transition-colors hover:border-foreground/30 hover:bg-muted"
          >
            <Play className="size-3.5 shrink-0" aria-hidden="true" />
            {entry.classVideoCount ? `클립 ${entry.classVideoCount}개` : "드랍박스에서 보기"}
            <ExternalLink className="size-3 shrink-0 opacity-50" aria-hidden="true" />
          </a>
        </div>
      )}

      {(entry.videoTitle || entry.videoUrl) && (
        <div>
          <p className="text-[11px] font-semibold text-foreground/70">공부 자료</p>
          {entry.videoUrl ? (
            <a
              href={entry.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-sm text-green-300 hover:text-green-200"
            >
              {entry.videoTitle || "영상 열기"}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          ) : (
            <p className="mt-1.5 text-sm text-foreground/90">{entry.videoTitle}</p>
          )}
        </div>
      )}

      {entry.note && (
        <div>
          <p className="text-[11px] font-semibold text-foreground/70">상세 메모</p>
          <p className="mt-1.5 whitespace-pre-wrap break-keep text-sm leading-6 text-foreground/80">
            {entry.note}
          </p>
        </div>
      )}
    </article>
  )
}

function DateDetail({
  date,
  entries,
  activeFilter,
}: {
  readonly date: string | null
  readonly entries: readonly SenseiEntry[]
  readonly activeFilter: TrainingFilter | null
}) {
  return (
    <aside className="min-w-0 xl:sticky xl:top-14">
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        {date ? (
          <>
            <div className="mb-4 border-b border-border pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-400">
                Day detail
              </p>
              <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
                {formatDateHeading(date)}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">{entries.length}개 기록</p>
            </div>
            {entries.length > 0 ? (
              <div className="space-y-3">
                {entries.map((entry) => (
                  <EntryDetail key={entry.id} entry={entry} activeFilter={activeFilter} />
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">이 날짜에는 기록이 없어.</p>
            )}
          </>
        ) : (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-foreground/90">날짜를 선택해</p>
            <p className="mt-2 text-xs text-muted-foreground">수업·스파링·공부 상세가 여기에 열려.</p>
          </div>
        )}
      </div>
    </aside>
  )
}

export function TrainingView({ entries, isLoading = false }: TrainingViewProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<TrainingFilter | null>(null)
  const filteredEntries = useMemo(
    () => entries.filter((entry) => matchesTrainingFilter(entry, activeFilter)),
    [activeFilter, entries],
  )
  const latestDate = useMemo(
    () => filteredEntries.map((entry) => entry.date).filter(Boolean).sort().at(-1) ?? null,
    [filteredEntries],
  )
  const activeDate = selectedDate ?? latestDate
  const activeEntries = useMemo(
    () => filteredEntries.filter((entry) => entry.date === activeDate),
    [activeDate, filteredEntries],
  )
  const monthCount = entries.filter((entry) => entry.date?.startsWith(currentMonthKey())).length

  return (
    <section className="mx-auto mt-4 w-full max-w-[1520px] space-y-3 sm:mt-5">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-400">
            Training archive
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">훈련 캘린더</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            날짜 안에서 배운 것과 적용한 것을 읽고, 눌러서 전체 기록을 확인해.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border bg-card px-3 py-1.5">
            이번 달 {isLoading ? "—" : `${monthCount}회`}
          </span>
          <span className="rounded-full border border-border bg-card px-3 py-1.5">
            전체 {isLoading ? "—" : `${entries.length}회`}
          </span>
          <span className="rounded-full border border-border bg-card px-3 py-1.5">
            최근 집중 {isLoading ? "—" : topKeyword(entries)}
          </span>
        </div>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(22rem,1fr)] xl:gap-5">
        <SenseiCalendar
          entries={filteredEntries}
          selectedDate={activeDate}
          onDateSelect={setSelectedDate}
          activeFilter={activeFilter}
          onFilterChange={(filter) => {
            setSelectedDate(null)
            setActiveFilter(filter)
          }}
        />
        <DateDetail date={activeDate} entries={activeEntries} activeFilter={activeFilter} />
      </div>
    </section>
  )
}
