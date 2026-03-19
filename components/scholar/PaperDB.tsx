"use client"

import { useState, useEffect, useCallback, Fragment } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { extractCountry, getCountryFlag } from "@/lib/scholar/country"
import type { JournalArticle, JournalQueryResult, InterestLevel } from "@/lib/types/journal"

// ── Constants ──────────────────────────────────────────────

const JOURNALS = ["TSJ", "Spine", "ESJ", "JNS", "Neurospine", "GSJ"] as const
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
  return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
}

function interestDot(interest: InterestLevel): string {
  if (interest.includes("필독")) return "bg-red-500"
  if (interest.includes("관심")) return "bg-yellow-500"
  return "bg-zinc-500"
}

function interestStyle(interest: string) {
  if (interest.includes("필독")) return "bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30"
  if (interest.includes("관심")) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/40 hover:bg-yellow-500/30"
  return "bg-zinc-500/20 text-zinc-400 border-zinc-500/40 hover:bg-zinc-500/30"
}

// ── Filter State ────────────────────────────────────────────

interface Filters {
  journals: string[]
  interest: InterestLevel | null
  readStatus: "all" | "unread" | "read"
  search: string
}

function buildQueryString(f: Filters): string {
  const params = new URLSearchParams()
  if (f.journals.length === 1) params.set("journal", f.journals[0])
  if (f.interest) params.set("interest", f.interest)
  if (f.readStatus === "unread") params.set("read", "false")
  else if (f.readStatus === "read") params.set("read", "true")
  if (f.search) params.set("search", f.search)
  params.set("sort", "date_desc")
  return params.toString()
}

// ── Main Component ──────────────────────────────────────────

export function PaperDB() {
  const queryClient = useQueryClient()

  // Filter state
  const [filters, setFilters] = useState<Filters>({
    journals: [],
    interest: null,
    readStatus: "all",
    search: "",
  })
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

  // Query
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

  // Client-side multi-journal filter (API only supports single journal)
  const displayArticles =
    filters.journals.length > 1
      ? allArticles.filter((a) =>
          filters.journals.some((j) => a.journal_name.includes(j))
        )
      : allArticles

  // ── Journal toggle ──
  function toggleJournal(j: string) {
    setFilters((prev) => {
      const active = prev.journals.includes(j)
      return {
        ...prev,
        journals: active ? prev.journals.filter((x) => x !== j) : [...prev.journals, j],
      }
    })
  }

  // ── Interest toggle ──
  function toggleInterest(v: InterestLevel) {
    setFilters((prev) => ({
      ...prev,
      interest: prev.interest === v ? null : v,
    }))
  }

  // ── Read status ──
  function setReadStatus(s: Filters["readStatus"]) {
    setFilters((prev) => ({ ...prev, readStatus: s }))
  }

  return (
    <div className="space-y-3">
      {/* ── Filter Bar ── */}
      <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-zinc-900 border border-zinc-800">
        {/* Journal toggles */}
        <div className="flex items-center gap-1">
          {JOURNALS.map((j) => {
            const active = filters.journals.includes(j)
            return (
              <button
                key={j}
                type="button"
                onClick={() => toggleJournal(j)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors border ${
                  active
                    ? "bg-cyan-600/30 text-cyan-300 border-cyan-500/50"
                    : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300"
                }`}
              >
                {j}
              </button>
            )
          })}
        </div>

        <div className="w-px h-5 bg-zinc-700" />

        {/* Interest filter */}
        <div className="flex items-center gap-1">
          {INTEREST_OPTIONS.map((opt) => {
            const active = filters.interest === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleInterest(opt.value)}
                className={`w-7 h-7 rounded flex items-center justify-center text-sm transition-colors border ${
                  active
                    ? "bg-zinc-700 border-zinc-500"
                    : "bg-zinc-800 border-zinc-700/50 opacity-50 hover:opacity-100"
                }`}
              >
                {opt.icon}
              </button>
            )
          })}
        </div>

        <div className="w-px h-5 bg-zinc-700" />

        {/* Read status */}
        <div className="flex items-center rounded-md border border-zinc-700 overflow-hidden">
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
              onClick={() => setReadStatus(opt.key)}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filters.readStatus === opt.key
                  ? "bg-zinc-600 text-white"
                  : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-zinc-700" />

        {/* Search */}
        <Input
          placeholder="검색..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-40 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600 h-7 text-xs"
        />

        {/* Active filter count */}
        {(filters.journals.length > 0 || filters.interest || filters.readStatus !== "all" || filters.search) && (
          <button
            type="button"
            onClick={() => {
              setFilters({ journals: [], interest: null, readStatus: "all", search: "" })
              setSearchInput("")
            }}
            className="text-zinc-500 text-[11px] hover:text-zinc-300 transition-colors ml-auto"
          >
            초기화
          </button>
        )}
      </div>

      {/* ── Table ── */}
      {isLoading ? (
        <div className="space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full bg-zinc-800" />
          ))}
        </div>
      ) : error ? (
        <p className="text-red-400 text-sm text-center py-8">
          로딩 실패: {(error as Error).message}
        </p>
      ) : displayArticles.length === 0 ? (
        <p className="text-zinc-500 text-sm text-center py-12">논문이 없습니다.</p>
      ) : (
        <div className="border border-zinc-700 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[80px_28px_1fr_90px_100px_40px] gap-2 px-3 py-2 bg-zinc-800/80 border-b border-zinc-700 text-zinc-500 text-[11px] font-medium uppercase tracking-wider">
            <span>날짜</span>
            <span />
            <span>제목</span>
            <span>저널</span>
            <span>유형</span>
            <span>DOI</span>
          </div>

          {/* Rows */}
          {displayArticles.map((article) => (
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
                className={`grid grid-cols-[80px_28px_1fr_90px_100px_40px] gap-2 px-3 py-2 items-center border-b border-zinc-800 cursor-pointer transition-colors ${
                  expandedId === article.page_id
                    ? "bg-zinc-800/70"
                    : "card-hover hover:bg-zinc-800/40"
                }`}
              >
                {/* Date */}
                <span className={`num text-[11px] ${article.read ? "text-zinc-500" : "text-zinc-300"}`}>
                  {article.pub_date?.slice(5) ?? "—"}
                </span>

                {/* Interest dot */}
                <span className="flex justify-center">
                  <span className={`w-2 h-2 rounded-full ${interestDot(article.interest)}`} />
                </span>

                {/* Title */}
                <span
                  className={`text-xs leading-snug truncate ${
                    article.read ? "text-zinc-500" : "text-white"
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
                <span className={`text-[10px] truncate ${article.read ? "text-zinc-600" : "text-zinc-500"}`}>
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
                      className="text-zinc-500 hover:text-cyan-400 transition-colors"
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
      {!isLoading && !error && displayArticles.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-zinc-600 text-xs num">
            {displayArticles.length}편 표시{hasMore ? " · 더 있음" : ""}
          </span>
          {hasMore && (
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50"
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
    <div className="bg-zinc-900/80 border-b border-zinc-700 px-4 py-4 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-white text-sm font-semibold leading-snug mb-1">{article.title}</h3>
          <p className="text-zinc-400 text-xs">{article.authors}</p>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="shrink-0 text-zinc-500 hover:text-white transition-colors p-1"
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
        {article.pub_date && <span className="text-zinc-500 num">{article.pub_date}</span>}
        {article.volume && <span className="text-zinc-600">Vol.{article.volume}</span>}
        {article.issue && <span className="text-zinc-600">No.{article.issue}</span>}
        {article.pub_type && (
          <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-500">
            {article.pub_type}
          </Badge>
        )}
        {country && (
          <span className="text-zinc-400 text-xs">
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
              : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700"
          }`}
        >
          {currentRead ? "✓ 읽음" : "읽지 않음"}
        </button>

        {article.doi_url && (
          <a
            href={article.doi_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors"
          >
            DOI ↗
          </a>
        )}
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors"
        >
          Notion ↗
        </a>
      </div>

      <Separator className="bg-zinc-800 mb-3" />

      {/* Abstract */}
      {article.abstract ? (
        <div className="space-y-2 mb-3">
          <p className="text-zinc-500 text-[10px] font-medium uppercase tracking-wider">Abstract</p>
          <p className="text-zinc-400 text-xs leading-relaxed">{article.abstract}</p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleTranslate}
              disabled={translating}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              {translating ? "번역 중..." : translation ? "번역 완료" : "한글 번역"}
            </button>
            <button
              type="button"
              onClick={handleSummarize}
              disabled={summarizing}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              {summarizing ? "요약 중..." : summary ? "요약 완료" : "한줄 요약"}
            </button>
          </div>

          {translation && (
            <div>
              <p className="text-zinc-500 text-[10px] font-medium uppercase tracking-wider mb-1">한글 번역</p>
              <p className="text-zinc-300 text-xs leading-relaxed">{translation}</p>
            </div>
          )}

          {summary && (
            <div>
              <p className="text-zinc-500 text-[10px] font-medium uppercase tracking-wider mb-1">한줄 요약</p>
              <p className="text-zinc-300 text-xs leading-relaxed">{summary}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-zinc-600 text-xs mb-3 italic">Abstract 없음</p>
      )}

      {/* Keywords & Categories */}
      {(article.keywords.length > 0 || article.categories.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {article.keywords.map((kw) => (
            <Badge key={kw} variant="outline" className="text-[9px] border-zinc-700 text-zinc-500">
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
