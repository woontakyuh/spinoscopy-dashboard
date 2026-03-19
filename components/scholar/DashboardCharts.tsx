"use client"

import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import { getCountryFlag } from "@/lib/scholar/country"
import type { ArticleMeta, DashboardData } from "@/lib/types/journal"
import { ArticleDetail } from "./ArticleDetail"
import type { JournalArticle } from "@/lib/types/journal"

/* ────────────────────────────── Types ────────────────────────────── */

type FilterKey = "topic" | "country" | "type" | "journal"
type ActiveFilters = Partial<Record<FilterKey, string>>

const FILTER_LABELS: Record<FilterKey, string> = {
  topic: "주제",
  country: "국가",
  type: "유형",
  journal: "저널",
}

const CHART_CONFIG = {
  topic:   { title: "주제 트렌드",  color: "indigo",  limit: 10 },
  country: { title: "국가 분포",    color: "emerald", limit: 12 },
  type:    { title: "논문 유형",    color: "amber",   limit: 10 },
  journal: { title: "저널별",       color: "cyan",    limit: 8  },
} as const

/* ────────────────────────────── Helpers ────────────────────────────── */

function countBy<T>(items: T[], keyFn: (item: T) => string | string[] | null): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) {
    const keys = keyFn(item)
    if (keys === null) continue
    const arr = Array.isArray(keys) ? keys : [keys]
    for (const k of arr) {
      if (k) counts[k] = (counts[k] ?? 0) + 1
    }
  }
  return counts
}

function sortedEntries(record: Record<string, number>, limit: number): [string, number][] {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
}

/* ────────────────────────────── Color Map ────────────────────────────── */

const colorMap = {
  indigo: {
    bar: "bg-indigo-500",
    barActive: "bg-indigo-400",
    barDim: "bg-indigo-500/40",
    ring: "ring-indigo-400/50",
    text: "text-indigo-400",
    dot: "bg-indigo-400",
  },
  emerald: {
    bar: "bg-emerald-500",
    barActive: "bg-emerald-400",
    barDim: "bg-emerald-500/40",
    ring: "ring-emerald-400/50",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  amber: {
    bar: "bg-amber-500",
    barActive: "bg-amber-400",
    barDim: "bg-amber-500/40",
    ring: "ring-amber-400/50",
    text: "text-amber-400",
    dot: "bg-amber-400",
  },
  cyan: {
    bar: "bg-cyan-500",
    barActive: "bg-cyan-400",
    barDim: "bg-cyan-500/40",
    ring: "ring-cyan-400/50",
    text: "text-cyan-400",
    dot: "bg-cyan-400",
  },
} as const

type ColorKey = keyof typeof colorMap

/* ────────────────────────────── Main Component ────────────────────────────── */

export function DashboardCharts({ onViewArticles }: { onViewArticles?: (id?: string) => void }) {
  const [filters, setFilters] = useState<ActiveFilters>({})
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null)
  const [selectedArticle, setSelectedArticle] = useState<JournalArticle | null>(null)
  const [visibleCount, setVisibleCount] = useState(20)

  const { data, isLoading } = useQuery({
    queryKey: ["scholar-dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/notion/journal?action=dashboard")
      if (!res.ok) throw new Error("대시보드 데이터 로딩 실패")
      return res.json() as Promise<DashboardData>
    },
    staleTime: 5 * 60 * 1000,
  })

  const toggleFilter = (key: FilterKey, value: string) => {
    setFilters(prev => {
      if (prev[key] === value) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: value }
    })
  }

  const clearFilters = () => { setFilters({}); setSelectedArticle(null); setSelectedArticleId(null) }

  const openArticle = (id: string) => {
    setSelectedArticleId(id)
    fetch(`/api/notion/journal?action=detail&pageId=${id}`)
      .then(res => { if (res.ok) return res.json(); throw new Error("실패") })
      .then(data => setSelectedArticle(data))
      .catch(() => { /* ignore */ })
  }

  /* 필터 적용 */
  const filtered = useMemo(() => {
    if (!data) return []
    return data.articles.filter(a => {
      if (filters.topic && !a.topics.includes(filters.topic)) return false
      if (filters.country && a.country !== filters.country) return false
      if (filters.type && a.pub_type !== filters.type) return false
      if (filters.journal && a.journal !== filters.journal) return false
      return true
    })
  }, [data, filters])

  /* 집계 */
  const topicCounts = useMemo(() => countBy(filtered, a => a.topics), [filtered])
  const countryCounts = useMemo(() => countBy(filtered, a => a.country), [filtered])
  const typeCounts = useMemo(() => countBy(filtered, a => a.pub_type), [filtered])
  const journalCounts = useMemo(() => countBy(filtered, a => a.journal), [filtered])

  /* 파생 데이터 */
  const activeFilterCount = Object.keys(filters).length
  const unreadCount = useMemo(() => filtered.filter(a => !a.read).length, [filtered])
  const weekStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  }, [])
  const recentCount = useMemo(() => filtered.filter(a => a.pub_date && a.pub_date >= weekStr).length, [filtered, weekStr])
  const mustReadUnread = useMemo(() =>
    filtered
      .filter(a => a.interest === "🔴 필독" && !a.read)
      .sort((a, b) => (b.pub_date ?? "").localeCompare(a.pub_date ?? ""))
      .slice(0, 5),
    [filtered]
  )

  /* ──── Loading ──── */
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[72px] bg-zinc-800/60 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64 bg-zinc-800/60 rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-4">

      {/* ═══════ Stat Cards ═══════ */}
      <div className="grid grid-cols-4 gap-3 animate-fade-in-up">
        <StatCard label="전체" value={filtered.length} icon="📄" />
        <StatCard label="안읽음" value={unreadCount} icon="📬" accent="blue" />
        <StatCard label="이번주" value={recentCount} icon="🗓️" accent="cyan" />
        <StatCard label="필독 미읽음" value={mustReadUnread.length} icon="🔴" accent="red" />
      </div>

      {/* ═══════ Active Filters Bar ═══════ */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-3 py-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/20 animate-fade-in-up">
          <span className="text-[11px] text-indigo-400 uppercase tracking-wider font-semibold">필터</span>
          {(Object.entries(filters) as [FilterKey, string][]).map(([key, val]) => (
            <button
              key={key}
              onClick={() => toggleFilter(key, val)}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full bg-zinc-800 text-zinc-300 text-xs border border-zinc-600/50 hover:border-zinc-500 hover:bg-zinc-700/80 transition-all duration-150 group"
            >
              <span className="text-zinc-500 text-[10px]">{FILTER_LABELS[key]}</span>
              <span className="font-medium">{key === "country" ? `${getCountryFlag(val)} ${val}` : val}</span>
              <span className="text-zinc-500 group-hover:text-zinc-300 ml-0.5 transition-colors">✕</span>
            </button>
          ))}
          <button
            onClick={clearFilters}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2 decoration-zinc-700 hover:decoration-zinc-500"
          >
            전체 해제
          </button>
          <span className="text-[11px] text-zinc-500 ml-auto num">{filtered.length}편 매칭</span>
        </div>
      )}

      {/* ═══════ Charts 2×2 Grid ═══════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in-up" style={{ animationDelay: "60ms" }}>
        <BarChart
          title={CHART_CONFIG.topic.title}
          entries={sortedEntries(topicCounts, CHART_CONFIG.topic.limit)}
          activeKey={filters.topic}
          onClickItem={key => toggleFilter("topic", key)}
          color="indigo"
        />
        <BarChart
          title={CHART_CONFIG.country.title}
          entries={sortedEntries(countryCounts, CHART_CONFIG.country.limit)}
          activeKey={filters.country}
          onClickItem={key => toggleFilter("country", key)}
          color="emerald"
          renderLabel={key => `${getCountryFlag(key)} ${key}`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in-up" style={{ animationDelay: "120ms" }}>
        <BarChart
          title={CHART_CONFIG.type.title}
          entries={sortedEntries(typeCounts, CHART_CONFIG.type.limit)}
          activeKey={filters.type}
          onClickItem={key => toggleFilter("type", key)}
          color="amber"
        />
        <BarChart
          title={CHART_CONFIG.journal.title}
          entries={sortedEntries(journalCounts, CHART_CONFIG.journal.limit)}
          activeKey={filters.journal}
          onClickItem={key => toggleFilter("journal", key)}
          color="cyan"
        />
      </div>

      {/* ═══════ Filtered Article List ═══════ */}
      {activeFilterCount > 0 && (
        <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 overflow-hidden animate-fade-in-up" style={{ animationDelay: "180ms" }}>
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              매칭 논문 <span className="num text-zinc-500 ml-1">{filtered.length}편</span>
            </h3>
          </div>

          {selectedArticle ? (
            <div className="p-4">
              <ArticleDetail
                article={selectedArticle}
                onBack={() => { setSelectedArticle(null); setSelectedArticleId(null) }}
              />
            </div>
          ) : (
            <div>
              {/* 테이블 헤더 */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-700/50 text-[10px] text-zinc-600 uppercase tracking-wider font-medium">
                <span className="w-[70px] shrink-0">저널</span>
                <span className="w-20 shrink-0">날짜</span>
                <span className="w-[72px] shrink-0">유형</span>
                <span className="flex-1">제목</span>
                <span className="w-6 shrink-0 text-center">국가</span>
                <span className="w-8 shrink-0"></span>
              </div>
              {filtered
                .sort((a, b) => (b.pub_date ?? "").localeCompare(a.pub_date ?? ""))
                .slice(0, visibleCount)
                .map(a => (
                  <button
                    key={a.id}
                    onClick={() => openArticle(a.id)}
                    className={`w-full text-left flex items-center gap-3 px-4 py-2 border-b border-zinc-800/30 last:border-0 hover:bg-zinc-800/50 transition-colors ${
                      selectedArticleId === a.id ? "bg-indigo-600/10" : ""
                    }`}
                  >
                    <span className="text-[10px] text-cyan-400/70 w-[70px] shrink-0 truncate font-medium">{a.journal}</span>
                    <span className="text-[11px] text-zinc-600 w-20 shrink-0 num">{a.pub_date ?? "—"}</span>
                    <span className="text-[10px] text-zinc-600 w-[72px] shrink-0 truncate">{a.pub_type}</span>
                    <span className={`text-sm flex-1 truncate ${a.read ? "text-zinc-500" : "text-zinc-200"}`}>
                      {a.interest === "🔴 필독" ? "🔴 " : a.interest === "🟡 관심" ? "🟡 " : ""}{a.title}
                    </span>
                    <span className="w-6 shrink-0 text-center text-[11px]">{a.country ? getCountryFlag(a.country) : ""}</span>
                    {a.doi_url ? (
                      <a href={a.doi_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                        className="text-[10px] text-indigo-400/60 hover:text-indigo-300 shrink-0 w-8 text-right">DOI↗</a>
                    ) : <span className="w-8 shrink-0" />}
                  </button>
                ))}
              {filtered.length > visibleCount && (
                <div className="flex justify-center py-3 border-t border-zinc-800">
                  <button onClick={() => setVisibleCount(prev => prev + 30)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                    더보기 ({filtered.length - visibleCount}편 남음)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════ Must-Read Unread (no filter active) ═══════ */}
      {activeFilterCount === 0 && mustReadUnread.length > 0 && (
        <MustReadSection articles={mustReadUnread} onSelect={(a) => openArticle(a.id)} />
      )}
    </div>
  )
}

/* ────────────────────────────── StatCard ────────────────────────────── */

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: number
  icon: string
  accent?: "blue" | "cyan" | "red"
}) {
  const accentClasses = {
    blue: "text-blue-400",
    cyan: "text-cyan-400",
    red: "text-red-400",
  }
  const valueColor = accent ? accentClasses[accent] : "text-zinc-100"

  return (
    <div className="card-hover rounded-xl border border-zinc-700/80 bg-zinc-900 px-4 py-3 cursor-default">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-zinc-500 font-medium tracking-wide">{label}</span>
        <span className="text-sm">{icon}</span>
      </div>
      <p className={`text-2xl font-semibold num leading-none ${valueColor}`}>{value}</p>
    </div>
  )
}

/* ────────────────────────────── BarChart ────────────────────────────── */

function BarChart({
  title,
  entries,
  activeKey,
  onClickItem,
  color,
  renderLabel,
}: {
  title: string
  entries: [string, number][]
  activeKey?: string
  onClickItem: (key: string) => void
  color: ColorKey
  renderLabel?: (key: string) => string
}) {
  const c = colorMap[color]
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
        <ChartHeader title={title} color={color} />
        <p className="text-zinc-600 text-xs text-center py-6">데이터 없음</p>
      </div>
    )
  }

  const maxCount = entries[0][1]
  const hasActive = activeKey !== undefined

  return (
    <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
      <ChartHeader title={title} color={color} count={entries.reduce((s, [, n]) => s + n, 0)} />
      <div className="space-y-[5px] mt-3">
        {entries.map(([key, count]) => {
          const isActive = activeKey === key
          const isDimmed = hasActive && !isActive
          const pct = Math.max((count / maxCount) * 100, 3)

          return (
            <button
              key={key}
              onClick={() => onClickItem(key)}
              className={`
                w-full flex items-center gap-2 py-[5px] px-2.5 rounded-lg text-left
                transition-all duration-150 cursor-pointer group
                ${isActive
                  ? `bg-zinc-700/50 ring-1 ${c.ring}`
                  : "hover:bg-zinc-800/80"
                }
                ${isDimmed ? "opacity-50" : "opacity-100"}
              `}
            >
              <span className={`text-xs w-[120px] shrink-0 truncate transition-colors ${
                isActive ? "text-zinc-100 font-medium" : "text-zinc-400 group-hover:text-zinc-300"
              }`}>
                {renderLabel ? renderLabel(key) : key}
              </span>
              <div className="flex-1 h-[7px] bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isActive ? c.barActive : isDimmed ? c.barDim : c.bar
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`text-[11px] w-7 text-right num transition-colors ${
                isActive ? "text-zinc-200 font-medium" : "text-zinc-500"
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ────────────────────────────── ChartHeader ────────────────────────────── */

function ChartHeader({ title, color, count }: { title: string; color: ColorKey; count?: number }) {
  const c = colorMap[color]
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{title}</h3>
      </div>
      {count !== undefined && (
        <span className="text-[10px] text-zinc-600 num">{count}</span>
      )}
    </div>
  )
}

/* ────────────────────────────── MustReadSection ────────────────────────────── */

function MustReadSection({
  articles,
  onSelect,
}: {
  articles: ArticleMeta[]
  onSelect: (article: ArticleMeta) => void
}) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-4 animate-fade-in-up" style={{ animationDelay: "180ms" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider">
            필독 미읽음
          </h3>
        </div>
        <span className="text-[10px] text-red-400/60 num">{articles.length}편</span>
      </div>

      <div className="space-y-1">
        {articles.map(a => (
          <button
            key={a.id}
            onClick={() => onSelect(a)}
            className="w-full text-left flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-red-500/[0.07] transition-colors group"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-300 leading-snug line-clamp-1 group-hover:text-zinc-100 transition-colors">
                {a.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[11px] text-zinc-500">{a.journal}</span>
                {a.pub_date && <span className="text-[11px] text-zinc-600">{a.pub_date}</span>}
                {a.country && <span className="text-[11px] text-zinc-500">{getCountryFlag(a.country)}</span>}
                {a.topics.length > 0 && (
                  <span className="text-[10px] text-zinc-600 truncate">{a.topics.slice(0, 2).join(", ")}</span>
                )}
              </div>
            </div>
            {a.doi_url && (
              <a href={a.doi_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                className="text-[11px] text-red-400/60 hover:text-red-300 shrink-0 font-medium transition-colors"
              >DOI ↗</a>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
