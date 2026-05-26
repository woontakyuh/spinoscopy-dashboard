"use client"

import { useState, useEffect, useCallback, useMemo, Fragment } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { extractCountry, getCountryFlag, TOPIC_GROUPS, TOPIC_PRIORITY, normalizeArticleType } from "@/lib/scholar/country"
import type { JournalArticle, JournalQueryResult, InterestLevel, DashboardData } from "@/lib/types/journal"

// ── Constants ──────────────────────────────────────────────

const INTEREST_OPTIONS: { value: InterestLevel; icon: string }[] = [
  { value: "🔴 필독", icon: "🔴" },
  { value: "🟡 관심", icon: "🟡" },
  { value: "⚪ 참고", icon: "⚪" },
]
const INTEREST_CYCLE: InterestLevel[] = ["🔴 필독", "🟡 관심", "⚪ 참고"]

const JOURNAL_COLORS: Record<string, string> = {
  TSJ: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  Spine: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  ESJ: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "JNS Spine": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  JNS: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  Neurospine: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  GSJ: "bg-rose-500/20 text-rose-300 border-rose-500/30",
}

function journalBadgeClass(name: string): string {
  for (const [key, cls] of Object.entries(JOURNAL_COLORS)) {
    if (name.includes(key)) return cls
  }
  return "bg-zinc-500/20 text-muted-foreground border-zinc-500/30"
}

function interestDot(interest: InterestLevel): string {
  if (interest.includes("필독")) return "bg-red-500"
  if (interest.includes("관심")) return "bg-yellow-500"
  return "bg-zinc-500"
}

function interestStyle(interest: string) {
  if (interest.includes("필독")) return "bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30"
  if (interest.includes("관심")) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/40 hover:bg-yellow-500/30"
  return "bg-zinc-500/20 text-muted-foreground border-zinc-500/40 hover:bg-zinc-500/30"
}

// ── Chart Helpers ─────────────────────────────────────────

type ChartFilterKey = "topic" | "country" | "type" | "journal"

const CHART_CONFIG = {
  topic:   { title: "주제 트렌드",  color: "indigo" as const,  limit: 12 },
  country: { title: "국가 분포",    color: "emerald" as const, limit: 12 },
  type:    { title: "논문 유형",    color: "amber" as const,   limit: 10 },
  journal: { title: "저널별",       color: "cyan" as const,    limit: 8  },
} as const

const chartColorMap = {
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

type ChartColorKey = keyof typeof chartColorMap

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

// Topic 차트 전용 정렬 — TOPIC_PRIORITY 에 있는 항목을 그 순서대로 먼저 (count 0 이라도),
// 나머지는 count desc.
function topicSortedEntries(record: Record<string, number>, limit: number): [string, number][] {
  const prioritySet = new Set(TOPIC_PRIORITY)
  const priorityRows: [string, number][] = TOPIC_PRIORITY.map((t) => [t, record[t] ?? 0])
  const otherRows = Object.entries(record)
    .filter(([t]) => !prioritySet.has(t))
    .sort((a, b) => b[1] - a[1])
  return [...priorityRows, ...otherRows].slice(0, limit)
}

// ── Filter State ────────────────────────────────────────────

interface Filters {
  journals: string[]
  interest: InterestLevel | null
  readStatus: "all" | "unread" | "read"
  search: string
  topics: string[]
  categories: string[]
  types: string[]
  countries: string[]
  dateFrom: string | null
  dateTo: string | null
}

const INITIAL_FILTERS: Filters = {
  journals: [],
  interest: null,
  readStatus: "all",
  search: "",
  topics: [],
  categories: [],
  types: [],
  countries: [],
  dateFrom: null,
  dateTo: null,
}

function buildQueryString(f: Filters): string {
  const params = new URLSearchParams()
  if (f.journals.length === 1) params.set("journal", f.journals[0])
  if (f.interest) params.set("interest", f.interest)
  if (f.readStatus === "unread") params.set("read", "false")
  else if (f.readStatus === "read") params.set("read", "true")
  if (f.search) params.set("search", f.search)
  if (f.categories.length === 1) params.set("category", f.categories[0])
  params.set("sort", "date_desc")
  return params.toString()
}

function hasActiveFilters(f: Filters): boolean {
  return (
    f.journals.length > 0 ||
    f.interest !== null ||
    f.readStatus !== "all" ||
    f.search !== "" ||
    f.topics.length > 0 ||
    f.categories.length > 0 ||
    f.types.length > 0 ||
    f.countries.length > 0 ||
    f.dateFrom !== null ||
    f.dateTo !== null
  )
}

const FILTER_LABELS: Record<string, string> = {
  journal: "저널",
  topic: "주제",
  country: "국가",
  type: "유형",
  interest: "관심도",
  readStatus: "읽음",
  search: "검색",
  dateFrom: "시작일",
  dateTo: "종료일",
}

// ── Main Component ──────────────────────────────────────────

export function PaperDB() {
  // Filter state
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS)
  const [searchInput, setSearchInput] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Pagination
  const [allArticles, setAllArticles] = useState<JournalArticle[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput }))
    }, 500)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Reset on filter change
  const filterQs = buildQueryString(filters)
  useEffect(() => {
    setAllArticles([])
    setNextCursor(null)
    setHasMore(false)
    setExpandedId(null)
  }, [filterQs])

  // Dashboard data for charts & stat cards
  const { data: dashData, isLoading: dashLoading } = useQuery<DashboardData>({
    queryKey: ["scholar-dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/notion/journal?action=dashboard")
      if (!res.ok) throw new Error("대시보드 데이터 로딩 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Chart active keys (multi-select)
  const chartActiveKeys = useMemo<Record<ChartFilterKey, Set<string>>>(() => ({
    topic: new Set(filters.topics),
    country: new Set(filters.countries),
    journal: new Set(filters.journals),
    type: new Set(filters.types),
  }), [filters.topics, filters.countries, filters.journals, filters.types])

  // Compact filter predicate (applied to all chart bases)
  const compactFilter = useCallback((a: DashboardData["articles"][number]) => {
    if (filters.dateFrom && (!a.pub_date || a.pub_date < filters.dateFrom)) return false
    if (filters.dateTo && (!a.pub_date || a.pub_date > filters.dateTo)) return false
    if (filters.interest && a.interest !== filters.interest) return false
    if (filters.readStatus === "unread" && a.read) return false
    if (filters.readStatus === "read" && !a.read) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (!a.title.toLowerCase().includes(q)) return false
    }
    return true
  }, [filters.dateFrom, filters.dateTo, filters.interest, filters.readStatus, filters.search])

  // Cross-filter: each chart excludes its OWN dimension, applies all others
  const topicBase = useMemo(() => {
    if (!dashData) return []
    return dashData.articles.filter(a => {
      if (chartActiveKeys.country.size > 0 && !chartActiveKeys.country.has(a.country ?? "")) return false
      if (chartActiveKeys.type.size > 0 && !chartActiveKeys.type.has(a.pub_type ?? "")) return false
      if (chartActiveKeys.journal.size > 0 && !chartActiveKeys.journal.has(a.journal ?? "")) return false
      return compactFilter(a)
    })
  }, [dashData, chartActiveKeys.country, chartActiveKeys.type, chartActiveKeys.journal, compactFilter])

  const countryBase = useMemo(() => {
    if (!dashData) return []
    return dashData.articles.filter(a => {
      if (chartActiveKeys.topic.size > 0 && !a.topics.some(t => chartActiveKeys.topic.has(t))) return false
      if (chartActiveKeys.type.size > 0 && !chartActiveKeys.type.has(a.pub_type ?? "")) return false
      if (chartActiveKeys.journal.size > 0 && !chartActiveKeys.journal.has(a.journal ?? "")) return false
      return compactFilter(a)
    })
  }, [dashData, chartActiveKeys.topic, chartActiveKeys.type, chartActiveKeys.journal, compactFilter])

  const typeBase = useMemo(() => {
    if (!dashData) return []
    return dashData.articles.filter(a => {
      if (chartActiveKeys.topic.size > 0 && !a.topics.some(t => chartActiveKeys.topic.has(t))) return false
      if (chartActiveKeys.country.size > 0 && !chartActiveKeys.country.has(a.country ?? "")) return false
      if (chartActiveKeys.journal.size > 0 && !chartActiveKeys.journal.has(a.journal ?? "")) return false
      return compactFilter(a)
    })
  }, [dashData, chartActiveKeys.topic, chartActiveKeys.country, chartActiveKeys.journal, compactFilter])

  const journalBase = useMemo(() => {
    if (!dashData) return []
    return dashData.articles.filter(a => {
      if (chartActiveKeys.topic.size > 0 && !a.topics.some(t => chartActiveKeys.topic.has(t))) return false
      if (chartActiveKeys.country.size > 0 && !chartActiveKeys.country.has(a.country ?? "")) return false
      if (chartActiveKeys.type.size > 0 && !chartActiveKeys.type.has(a.pub_type ?? "")) return false
      return compactFilter(a)
    })
  }, [dashData, chartActiveKeys.topic, chartActiveKeys.country, chartActiveKeys.type, compactFilter])

  // Full cross-filter result (all dimensions applied) — for stat cards & article list
  const dashFiltered = useMemo(() => {
    if (!dashData) return []
    return dashData.articles.filter(a => {
      if (chartActiveKeys.topic.size > 0 && !a.topics.some(t => chartActiveKeys.topic.has(t))) return false
      if (chartActiveKeys.country.size > 0 && !chartActiveKeys.country.has(a.country ?? "")) return false
      if (chartActiveKeys.type.size > 0 && !chartActiveKeys.type.has(a.pub_type ?? "")) return false
      if (chartActiveKeys.journal.size > 0 && !chartActiveKeys.journal.has(a.journal ?? "")) return false
      return compactFilter(a)
    })
  }, [dashData, chartActiveKeys, compactFilter])

  // Chart aggregations (each from its own cross-filtered base)
  const topicCounts = useMemo(() => countBy(topicBase, a => a.topics), [topicBase])
  const countryCounts = useMemo(() => countBy(countryBase, a => a.country), [countryBase])
  const typeCounts = useMemo(() => countBy(typeBase, a => a.pub_type), [typeBase])
  const journalCounts = useMemo(() => countBy(journalBase, a => a.journal), [journalBase])

  // Stat card values
  const dashUnreadCount = useMemo(() => dashFiltered.filter(a => !a.read).length, [dashFiltered])
  const dashWeekStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  }, [])
  const dashRecentCount = useMemo(() => dashFiltered.filter(a => a.pub_date && a.pub_date >= dashWeekStr).length, [dashFiltered, dashWeekStr])
  const dashMustReadUnread = useMemo(() =>
    dashFiltered.filter(a => a.interest === "🔴 필독" && !a.read).length,
    [dashFiltered]
  )

  // Chart click → toggle multi-select
  function handleChartClick(key: ChartFilterKey, value: string) {
    setFilters(prev => {
      switch (key) {
        case "topic": {
          const active = prev.topics.includes(value)
          return { ...prev, topics: active ? prev.topics.filter(t => t !== value) : [...prev.topics, value] }
        }
        case "country": {
          const active = prev.countries.includes(value)
          return { ...prev, countries: active ? prev.countries.filter(c => c !== value) : [...prev.countries, value] }
        }
        case "journal": {
          const active = prev.journals.includes(value)
          return { ...prev, journals: active ? prev.journals.filter(j => j !== value) : [...prev.journals, value] }
        }
        case "type": {
          const active = prev.types.includes(value)
          return { ...prev, types: active ? prev.types.filter(t => t !== value) : [...prev.types, value] }
        }
        default:
          return prev
      }
    })
  }

  // Paginated article query
  const { isLoading, error } = useQuery<JournalQueryResult>({
    queryKey: ["journal", filterQs],
    queryFn: async () => {
      const res = await fetch(`/api/notion/journal?${filterQs}`)
      if (!res.ok) throw new Error("논문 조회 실패")
      const data: JournalQueryResult = await res.json()
      setAllArticles(data.articles)
      setNextCursor(data.next_cursor)
      setHasMore(data.has_more)
      return data
    },
  })

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const res = await fetch(`/api/notion/journal?${filterQs}&cursor=${nextCursor}`)
      if (!res.ok) throw new Error("추가 로딩 실패")
      const data: JournalQueryResult = await res.json()
      setAllArticles((prev) => [...prev, ...data.articles])
      setNextCursor(data.next_cursor)
      setHasMore(data.has_more)
    } finally {
      setIsLoadingMore(false)
    }
  }, [nextCursor, isLoadingMore, filterQs])

  // Client-side filtering on paginated articles
  const displayArticles = useMemo(() => {
    let list = allArticles

    // multi-journal (API only supports single)
    if (filters.journals.length > 1) {
      list = list.filter((a) =>
        filters.journals.some((j) => a.journal_name.includes(j))
      )
    }

    // topics (client-side)
    if (filters.topics.length > 0) {
      list = list.filter((a) => {
        const text = `${a.title} ${a.categories.join(" ")}`.toLowerCase()
        return filters.topics.some((topic) =>
          TOPIC_GROUPS[topic]?.some((kw) => text.includes(kw))
        )
      })
    }

    // categories (client-side for multi-select)
    if (filters.categories.length > 1) {
      list = list.filter((a) =>
        filters.categories.some((cat) =>
          a.categories.some((ac) => ac.toLowerCase().includes(cat.toLowerCase()))
        )
      )
    }

    // types (client-side, normalize to match chart values)
    if (filters.types.length > 0) {
      list = list.filter((a) => filters.types.includes(normalizeArticleType(a.pub_type ?? "")))
    }

    // countries (client-side)
    if (filters.countries.length > 0) {
      list = list.filter((a) => {
        const c = extractCountry(a.affiliations)
        return c !== null && filters.countries.includes(c)
      })
    }

    // date range (client-side)
    if (filters.dateFrom) {
      list = list.filter((a) => a.pub_date && a.pub_date >= filters.dateFrom!)
    }
    if (filters.dateTo) {
      list = list.filter((a) => a.pub_date && a.pub_date <= filters.dateTo!)
    }

    return list
  }, [allArticles, filters])

  // Remove a specific filter
  function removeFilter(key: string, value?: string) {
    setFilters((prev) => {
      switch (key) {
        case "journal":
          return { ...prev, journals: prev.journals.filter((j) => j !== value) }
        case "interest":
          return { ...prev, interest: null }
        case "readStatus":
          return { ...prev, readStatus: "all" }
        case "search":
          setSearchInput("")
          return { ...prev, search: "" }
        case "topic":
          return { ...prev, topics: prev.topics.filter((t) => t !== value) }
        case "category":
          return { ...prev, categories: prev.categories.filter((c) => c !== value) }
        case "type":
          return { ...prev, types: prev.types.filter((t) => t !== value) }
        case "country":
          return { ...prev, countries: prev.countries.filter((c) => c !== value) }
        case "dateFrom":
          return { ...prev, dateFrom: null }
        case "dateTo":
          return { ...prev, dateTo: null }
        default:
          return prev
      }
    })
  }

  // Active filter tags
  const activeFilterTags = useMemo(() => {
    const tags: { key: string; value?: string; label: string }[] = []
    for (const j of filters.journals) tags.push({ key: "journal", value: j, label: j })
    for (const t of filters.topics) tags.push({ key: "topic", value: t, label: t })
    for (const t of filters.types) tags.push({ key: "type", value: t, label: t })
    for (const c of filters.countries) tags.push({ key: "country", value: c, label: `${getCountryFlag(c)} ${c}` })
    if (filters.interest) tags.push({ key: "interest", label: filters.interest })
    if (filters.readStatus !== "all") tags.push({ key: "readStatus", label: filters.readStatus === "unread" ? "안읽음" : "읽음" })
    if (filters.search) tags.push({ key: "search", label: `"${filters.search}"` })
    if (filters.dateFrom) tags.push({ key: "dateFrom", label: `${filters.dateFrom}~` })
    if (filters.dateTo) tags.push({ key: "dateTo", label: `~${filters.dateTo}` })
    return tags
  }, [filters])

  // Sub-tabs: auto-generated when multi-select is active on any dimension
  const [subTab, setSubTab] = useState<string | null>(null)

  // Build sub-tab groups from multi-select dimensions
  const subTabGroups = useMemo(() => {
    const groups: { dimension: string; label: string; values: { key: string; label: string; count: number }[] }[] = []
    if (filters.journals.length > 1) {
      groups.push({
        dimension: "journal",
        label: "저널",
        values: filters.journals.map(j => ({
          key: `journal:${j}`,
          label: j,
          count: displayArticles.filter(a => a.journal_name.includes(j)).length,
        })),
      })
    }
    if (filters.topics.length > 1) {
      groups.push({
        dimension: "topic",
        label: "주제",
        values: filters.topics.map(t => ({
          key: `topic:${t}`,
          label: t,
          count: displayArticles.filter(a => {
            const text = `${a.title} ${a.categories.join(" ")}`.toLowerCase()
            return TOPIC_GROUPS[t]?.some(kw => text.includes(kw)) ?? false
          }).length,
        })),
      })
    }
    if (filters.countries.length > 1) {
      groups.push({
        dimension: "country",
        label: "국가",
        values: filters.countries.map(c => ({
          key: `country:${c}`,
          label: `${getCountryFlag(c)} ${c}`,
          count: displayArticles.filter(a => extractCountry(a.affiliations) === c).length,
        })),
      })
    }
    if (filters.types.length > 1) {
      groups.push({
        dimension: "type",
        label: "유형",
        values: filters.types.map(t => ({
          key: `type:${t}`,
          label: t,
          count: displayArticles.filter(a => normalizeArticleType(a.pub_type ?? "") === t).length,
        })),
      })
    }
    return groups
  }, [filters.journals, filters.topics, filters.countries, filters.types, displayArticles])

  // Apply sub-tab filter to display articles
  const finalArticles = useMemo(() => {
    if (!subTab) return displayArticles
    const dim = subTab.split(":")[0]
    const value = subTab.slice(dim.length + 1)
    switch (dim) {
      case "journal":
        return displayArticles.filter(a => a.journal_name.includes(value))
      case "topic":
        return displayArticles.filter(a => {
          const text = `${a.title} ${a.categories.join(" ")}`.toLowerCase()
          return TOPIC_GROUPS[value]?.some(kw => text.includes(kw)) ?? false
        })
      case "country":
        return displayArticles.filter(a => extractCountry(a.affiliations) === value)
      case "type":
        return displayArticles.filter(a => normalizeArticleType(a.pub_type ?? "") === value)
      default:
        return displayArticles
    }
  }, [displayArticles, subTab])

  // Reset sub-tab when filters change
  useEffect(() => { setSubTab(null) }, [filters.journals.length, filters.topics.length, filters.countries.length, filters.types.length])

  return (
    <div className="space-y-3">
      {/* ── Compact Controls ── */}
      <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-card border border-border">
        {/* Search */}
        <Input
          placeholder="검색..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-40 bg-muted border-border text-foreground placeholder:text-muted-foreground/70 h-7 text-xs"
        />

        <div className="w-px h-5 bg-muted" />

        {/* Date range */}
        <span className="text-muted-foreground/70 text-[10px] font-medium shrink-0">기간</span>
        <input
          type="date"
          value={filters.dateFrom ?? ""}
          onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value || null }))}
          className="h-7 px-2 rounded text-[11px] bg-muted border border-border text-foreground/90 focus:outline-none focus:border-zinc-500 [color-scheme:dark]"
        />
        <span className="text-muted-foreground/70 text-[10px]">~</span>
        <input
          type="date"
          value={filters.dateTo ?? ""}
          onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value || null }))}
          className="h-7 px-2 rounded text-[11px] bg-muted border border-border text-foreground/90 focus:outline-none focus:border-zinc-500 [color-scheme:dark]"
        />

        <div className="w-px h-5 bg-muted" />

        {/* Interest */}
        <div className="flex items-center gap-1">
          {INTEREST_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilters(prev => ({ ...prev, interest: prev.interest === opt.value ? null : opt.value }))}
              className={`w-7 h-7 rounded flex items-center justify-center text-sm transition-colors border ${
                filters.interest === opt.value
                  ? "bg-muted border-zinc-500"
                  : "bg-muted border-border/50 opacity-50 hover:opacity-100"
              }`}
            >
              {opt.icon}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-muted" />

        {/* Read status */}
        <div className="flex items-center rounded-md border border-border overflow-hidden">
          {(
            [
              { key: "all", label: "전체" },
              { key: "unread", label: "안읽음" },
              { key: "read", label: "읽음" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFilters(prev => ({ ...prev, readStatus: opt.key }))}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filters.readStatus === opt.key
                  ? "bg-zinc-600 text-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground/90"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Reset */}
        {hasActiveFilters(filters) && (
          <>
            <div className="w-px h-5 bg-muted" />
            <button
              type="button"
              onClick={() => { setFilters(INITIAL_FILTERS); setSearchInput("") }}
              className="text-[11px] text-muted-foreground hover:text-foreground/90 transition-colors underline underline-offset-2 decoration-zinc-700 hover:decoration-zinc-500"
            >
              초기화
            </button>
          </>
        )}
      </div>

      {/* ── Stat Cards + Charts ── */}
      {dashLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[72px] bg-muted/60 rounded-xl" />)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64 bg-muted/60 rounded-xl" />)}
          </div>
        </div>
      ) : dashData ? (
        <div className="space-y-3">
          {/* Stat Cards */}
          <div className="grid grid-cols-4 gap-3 animate-fade-in-up">
            <StatCard label="전체" value={dashFiltered.length} icon="📄" />
            <StatCard label="안읽음" value={dashUnreadCount} icon="📬" accent="blue" />
            <StatCard label="이번주" value={dashRecentCount} icon="🗓️" accent="cyan" />
            <StatCard label="필독 미읽음" value={dashMustReadUnread} icon="🔴" accent="red" />
          </div>

          {/* Charts 2x2 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in-up" style={{ animationDelay: "60ms" }}>
            <BarChart
              title={CHART_CONFIG.topic.title}
              entries={topicSortedEntries(topicCounts, CHART_CONFIG.topic.limit)}
              activeKeys={chartActiveKeys.topic}
              onClickItem={key => handleChartClick("topic", key)}
              color="indigo"
            />
            <BarChart
              title={CHART_CONFIG.country.title}
              entries={sortedEntries(countryCounts, CHART_CONFIG.country.limit)}
              activeKeys={chartActiveKeys.country}
              onClickItem={key => handleChartClick("country", key)}
              color="emerald"
              renderLabel={key => `${getCountryFlag(key)} ${key}`}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in-up" style={{ animationDelay: "120ms" }}>
            <BarChart
              title={CHART_CONFIG.type.title}
              entries={sortedEntries(typeCounts, CHART_CONFIG.type.limit)}
              activeKeys={chartActiveKeys.type}
              onClickItem={key => handleChartClick("type", key)}
              color="amber"
            />
            <BarChart
              title={CHART_CONFIG.journal.title}
              entries={sortedEntries(journalCounts, CHART_CONFIG.journal.limit)}
              activeKeys={chartActiveKeys.journal}
              onClickItem={key => handleChartClick("journal", key)}
              color="cyan"
            />
          </div>
        </div>
      ) : null}

      {/* ── Active Filter Pills ── */}
      {hasActiveFilters(filters) && (
        <div className="flex items-center gap-2 flex-wrap px-3 py-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/20 animate-fade-in-up">
          <span className="text-[11px] text-indigo-400 uppercase tracking-wider font-semibold">필터</span>
          {activeFilterTags.map((tag, i) => (
            <button
              key={`${tag.key}-${tag.value ?? tag.label}-${i}`}
              onClick={() => removeFilter(tag.key, tag.value)}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full bg-muted text-foreground/90 text-xs border border-border/50 hover:border-zinc-500 hover:bg-muted/80 transition-all duration-150 group"
            >
              <span className="text-muted-foreground text-[10px]">{FILTER_LABELS[tag.key] ?? tag.key}</span>
              <span className="font-medium">{tag.label}</span>
              <span className="text-muted-foreground group-hover:text-foreground/90 ml-0.5 transition-colors">✕</span>
            </button>
          ))}
          <button
            onClick={() => { setFilters(INITIAL_FILTERS); setSearchInput("") }}
            className="text-[11px] text-muted-foreground hover:text-foreground/90 transition-colors underline underline-offset-2 decoration-zinc-700 hover:decoration-zinc-500"
          >
            전체 해제
          </button>
          <span className="text-[11px] text-muted-foreground ml-auto num">{dashFiltered.length}편 매칭</span>
        </div>
      )}

      {/* ── Sub-tabs for multi-select drill-down ── */}
      {subTabGroups.length > 0 && (
        <div className="space-y-2">
          {subTabGroups.map(group => (
            <div key={group.dimension} className="flex items-center gap-1 flex-wrap">
              <span className="text-muted-foreground/70 text-[10px] font-medium mr-1 shrink-0">{group.label}</span>
              <button
                type="button"
                onClick={() => setSubTab(null)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border ${
                  subTab === null
                    ? "bg-indigo-600/30 text-indigo-300 border-indigo-500/50"
                    : "bg-muted text-muted-foreground border-border/50 hover:text-foreground/90 hover:border-border"
                }`}
              >
                전체 <span className="text-muted-foreground/70 ml-0.5">{displayArticles.length}</span>
              </button>
              {group.values.map(v => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setSubTab(subTab === v.key ? null : v.key)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border ${
                    subTab === v.key
                      ? "bg-indigo-600/30 text-indigo-300 border-indigo-500/50"
                      : "bg-muted text-muted-foreground border-border/50 hover:text-foreground/90 hover:border-border"
                  }`}
                >
                  {v.label} <span className="text-muted-foreground/70 ml-0.5">{v.count}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── Table ── */}
      {isLoading ? (
        <div className="space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full bg-muted" />
          ))}
        </div>
      ) : error ? (
        <p className="text-red-400 text-sm text-center py-8">
          로딩 실패: {(error as Error).message}
        </p>
      ) : finalArticles.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-12">논문이 없습니다.</p>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[80px_28px_1fr_90px_100px_40px] gap-2 px-3 py-2 bg-muted/80 border-b border-border text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
            <span>날짜</span>
            <span />
            <span>제목</span>
            <span>저널</span>
            <span>유형</span>
            <span>DOI</span>
          </div>

          {/* Rows */}
          {finalArticles.map((article) => (
            <Fragment key={article.page_id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() =>
                  setExpandedId(expandedId === article.page_id ? null : article.page_id)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setExpandedId(expandedId === article.page_id ? null : article.page_id)
                  }
                }}
                className={`grid grid-cols-[80px_28px_1fr_90px_100px_40px] gap-2 px-3 py-2 items-center border-b border-border cursor-pointer transition-colors ${
                  expandedId === article.page_id
                    ? "bg-muted/70"
                    : "card-hover hover:bg-muted/40"
                }`}
              >
                {/* Date */}
                <span className={`num text-[11px] ${article.read ? "text-muted-foreground" : "text-foreground/90"}`}>
                  {article.pub_date?.slice(5) ?? "—"}
                </span>

                {/* Interest dot */}
                <span className="flex justify-center">
                  <span className={`w-2 h-2 rounded-full ${interestDot(article.interest)}`} />
                </span>

                {/* Title */}
                <span
                  className={`text-xs leading-snug truncate ${
                    article.read ? "text-muted-foreground" : "text-foreground"
                  }`}
                  title={article.title}
                >
                  {article.title}
                </span>

                {/* Journal badge */}
                <span>
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1.5 py-0 h-[18px] font-medium ${journalBadgeClass(article.journal_name)}`}
                  >
                    {article.journal_name.replace(" Spine", "").replace("The ", "")}
                  </Badge>
                </span>

                {/* Pub type */}
                <span className={`text-[10px] truncate ${article.read ? "text-muted-foreground/70" : "text-muted-foreground"}`}>
                  {article.pub_type || "—"}
                </span>

                {/* DOI */}
                <span className="flex justify-center">
                  {article.doi_url ? (
                    <a
                      href={article.doi_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-muted-foreground hover:text-cyan-400 transition-colors"
                      title="DOI"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ) : (
                    <span className="text-zinc-700">—</span>
                  )}
                </span>
              </div>

              {/* Expanded detail */}
              {expandedId === article.page_id && (
                <InlineDetail
                  article={article}
                  onCollapse={() => setExpandedId(null)}
                />
              )}
            </Fragment>
          ))}
        </div>
      )}

      {/* Footer */}
      {!isLoading && !error && finalArticles.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-muted-foreground/70 text-xs num">
            {finalArticles.length}편 표시{hasMore ? " · 더 있음" : ""}
          </span>
          {hasMore && (
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-muted text-foreground/90 border border-border hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
            >
              {isLoadingMore ? "로딩 중..." : "더보기"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Inline Detail ───────────────────────────────────────────

function InlineDetail({
  article,
  onCollapse,
}: {
  article: JournalArticle
  onCollapse: () => void
}) {
  const queryClient = useQueryClient()
  const [currentInterest, setCurrentInterest] = useState<InterestLevel>(article.interest)
  const [currentRead, setCurrentRead] = useState(article.read)
  const [translation, setTranslation] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)
  const [summarizing, setSummarizing] = useState(false)

  const country = extractCountry(article.affiliations)

  const toggleReadMutation = useMutation({
    mutationFn: async (read: boolean) => {
      const res = await fetch("/api/notion/journal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: article.page_id, action: "toggleRead", value: read }),
      })
      if (!res.ok) throw new Error("업데이트 실패")
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["journal"] }),
  })

  const updateInterestMutation = useMutation({
    mutationFn: async (interest: InterestLevel) => {
      const res = await fetch("/api/notion/journal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: article.page_id, action: "updateInterest", value: interest }),
      })
      if (!res.ok) throw new Error("업데이트 실패")
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["journal"] }),
  })

  function handleToggleRead() {
    const next = !currentRead
    setCurrentRead(next)
    toggleReadMutation.mutate(next)
  }

  function handleCycleInterest() {
    const idx = INTEREST_CYCLE.indexOf(currentInterest)
    const next = INTEREST_CYCLE[(idx + 1) % INTEREST_CYCLE.length]
    setCurrentInterest(next)
    updateInterestMutation.mutate(next)
  }

  async function handleTranslate() {
    if (!article.abstract || translating) return
    setTranslating(true)
    try {
      const res = await fetch("/api/notion/journal/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ abstract: article.abstract, mode: "translate" }),
      })
      const data = (await res.json()) as { translation?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? "번역 실패")
      if (typeof data.translation === "string" && data.translation.trim()) {
        setTranslation(data.translation.trim())
      }
    } catch (err) {
      console.error(err)
    } finally {
      setTranslating(false)
    }
  }

  async function handleSummarize() {
    if (!article.abstract || summarizing) return
    setSummarizing(true)
    try {
      const res = await fetch("/api/notion/journal/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ abstract: article.abstract, mode: "summarize" }),
      })
      const data = (await res.json()) as { summary?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? "요약 실패")
      if (typeof data.summary === "string" && data.summary.trim()) {
        setSummary(data.summary.trim())
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSummarizing(false)
    }
  }

  return (
    <div className="bg-card/80 border-b border-border px-4 py-4 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-foreground text-sm font-semibold leading-snug mb-1">{article.title}</h3>
          <p className="text-muted-foreground text-xs">{article.authors}</p>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <Badge variant="outline" className={`text-[10px] ${journalBadgeClass(article.journal_name)}`}>
          {article.journal_name}
        </Badge>
        {article.pub_date && <span className="text-muted-foreground num">{article.pub_date}</span>}
        {article.volume && <span className="text-muted-foreground/70">Vol.{article.volume}</span>}
        {article.issue && <span className="text-muted-foreground/70">No.{article.issue}</span>}
        {article.pub_type && (
          <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
            {article.pub_type}
          </Badge>
        )}
        {country && (
          <span className="text-muted-foreground text-xs">
            {getCountryFlag(country)} {country}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={handleCycleInterest}
          className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${interestStyle(currentInterest)}`}
        >
          {currentInterest}
        </button>
        <button
          type="button"
          onClick={handleToggleRead}
          className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
            currentRead
              ? "bg-green-500/20 text-green-400 border-green-500/40"
              : "bg-muted text-muted-foreground border-border hover:bg-muted"
          }`}
        >
          {currentRead ? "✓ 읽음" : "읽지 않음"}
        </button>

        {article.doi_url && (
          <a
            href={article.doi_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-muted text-foreground/90 border border-border hover:bg-muted transition-colors"
          >
            DOI ↗
          </a>
        )}
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2.5 py-1 rounded-md text-xs font-medium bg-muted text-foreground/90 border border-border hover:bg-muted transition-colors"
        >
          Notion ↗
        </a>
      </div>

      <Separator className="bg-muted mb-3" />

      {/* Abstract */}
      {article.abstract ? (
        <div className="space-y-2 mb-3">
          <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">Abstract</p>
          <p className="text-muted-foreground text-xs leading-relaxed">{article.abstract}</p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleTranslate}
              disabled={translating}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-muted text-foreground/90 border border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              {translating ? "번역 중..." : translation ? "번역 완료" : "한글 번역"}
            </button>
            <button
              type="button"
              onClick={handleSummarize}
              disabled={summarizing}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-muted text-foreground/90 border border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              {summarizing ? "요약 중..." : summary ? "요약 완료" : "한줄 요약"}
            </button>
          </div>

          {translation && (
            <div>
              <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider mb-1">한글 번역</p>
              <p className="text-foreground/90 text-xs leading-relaxed">{translation}</p>
            </div>
          )}

          {summary && (
            <div>
              <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider mb-1">한줄 요약</p>
              <p className="text-foreground/90 text-xs leading-relaxed">{summary}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground/70 text-xs mb-3 italic">Abstract 없음</p>
      )}

      {/* Keywords & Categories */}
      {(article.keywords.length > 0 || article.categories.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {article.keywords.map((kw) => (
            <Badge key={kw} variant="outline" className="text-[9px] border-border text-muted-foreground">
              {kw}
            </Badge>
          ))}
          {article.categories.map((cat) => (
            <Badge key={cat} variant="outline" className="text-[9px] border-blue-500/30 text-blue-400">
              {cat}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

// ── StatCard ───────────────────────────────────────────────

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
  const valueColor = accent ? accentClasses[accent] : "text-foreground"

  return (
    <div className="card-hover rounded-xl border border-border/80 bg-card px-4 py-3 cursor-default">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-muted-foreground font-medium tracking-wide">{label}</span>
        <span className="text-sm">{icon}</span>
      </div>
      <p className={`text-2xl font-semibold num leading-none ${valueColor}`}>{value}</p>
    </div>
  )
}

// ── BarChart (multi-select) ───────────────────────────────

function BarChart({
  title,
  entries,
  activeKeys,
  onClickItem,
  color,
  renderLabel,
}: {
  title: string
  entries: [string, number][]
  activeKeys: Set<string>
  onClickItem: (key: string) => void
  color: ChartColorKey
  renderLabel?: (key: string) => string
}) {
  const c = chartColorMap[color]
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-border/80 bg-card p-4">
        <ChartHeader title={title} color={color} />
        <p className="text-muted-foreground/70 text-xs text-center py-6">데이터 없음</p>
      </div>
    )
  }

  const maxCount = entries[0][1]
  const hasActive = activeKeys.size > 0

  return (
    <div className="rounded-xl border border-border/80 bg-card p-4">
      <ChartHeader title={title} color={color} count={entries.reduce((s, [, n]) => s + n, 0)} />
      <div className="space-y-[5px] mt-3">
        {entries.map(([key, count]) => {
          const isActive = activeKeys.has(key)
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
                  ? `bg-muted/70 ring-1 ${c.ring}`
                  : "hover:bg-muted/80"
                }
                ${isDimmed ? "opacity-50" : "opacity-100"}
              `}
            >
              <span className={`text-xs w-[120px] shrink-0 truncate transition-colors ${
                isActive ? "text-foreground font-medium" : "text-muted-foreground group-hover:text-foreground/90"
              }`}>
                {renderLabel ? renderLabel(key) : key}
              </span>
              <div className="flex-1 h-[7px] bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isActive ? c.barActive : isDimmed ? c.barDim : c.bar
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`text-[11px] w-7 text-right num transition-colors ${
                isActive ? "text-foreground font-medium" : "text-muted-foreground"
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

// ── ChartHeader ────────────────────────────────────────────

function ChartHeader({ title, color, count }: { title: string; color: ChartColorKey; count?: number }) {
  const c = chartColorMap[color]
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      </div>
      {count !== undefined && (
        <span className="text-[10px] text-muted-foreground/70 num">{count}</span>
      )}
    </div>
  )
}
