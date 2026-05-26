"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { SCHOLAR_LINKS } from "@/lib/data/my-papers"
import { ExternalLink } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import type { ResearchProject } from "@/lib/types/research"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"

/* ── helpers ─────────────────────────────────────────── */

// 출판 논문 — 본인 (여운탁) 의 역할을 결정 (1st > corresponding > co-author 우선순위)
const TAK_NAME = "여운탁"

type DerivedRole = "1st" | "corresponding" | "co-author"

function deriveRole(p: ResearchProject): DerivedRole {
  if (p.first_author.includes(TAK_NAME)) return "1st"
  if (p.corresponding.includes(TAK_NAME)) return "corresponding"
  return "co-author"
}

function deriveYear(p: ResearchProject): number {
  if (p.publish_date) return Number(p.publish_date.slice(0, 4))
  if (p.start_date) return Number(p.start_date.slice(0, 4))
  return new Date().getFullYear()
}

const ROLE_BADGE: Record<DerivedRole, { bg: string; text: string; label: string }> = {
  "1st":           { bg: "var(--status-drafting-bg)",   text: "var(--status-drafting-text)",   label: "1st" },
  corresponding:   { bg: "var(--status-published-bg)",  text: "var(--status-published-text)",  label: "Corr" },
  "co-author":     { bg: "var(--status-idea-bg)",       text: "var(--status-idea-text)",       label: "Co" },
}

const TYPE_COLOR: Record<string, { bg: string; text: string }> = {
  "Original Article":{ bg: "var(--status-submitted-bg)", text: "var(--status-submitted-text)" },
  Original:        { bg: "var(--status-submitted-bg)", text: "var(--status-submitted-text)" },
  Review:          { bg: "var(--status-revision-bg)",  text: "var(--status-revision-text)" },
  "Case Report":   { bg: "var(--status-idea-bg)",      text: "var(--status-idea-text)" },
  "Technical Note":{ bg: "var(--status-revision-bg)",  text: "var(--status-revision-text)" },
  Commentary:      { bg: "var(--status-idea-bg)",      text: "var(--status-idea-text)" },
  Letter:          { bg: "var(--status-idea-bg)",      text: "var(--status-idea-text)" },
  Editorial:       { bg: "var(--status-idea-bg)",      text: "var(--status-idea-text)" },
  Other:           { bg: "var(--status-idea-bg)",      text: "var(--status-idea-text)" },
}

type Filter = "all" | DerivedRole

/* ── component ───────────────────────────────────────── */

export function MyPapers() {
  const [filter, setFilter] = useState<Filter>("all")

  // 출판 논문 = Research DB 의 Published + Accepted (Accepted = 아직 미출판이지만 결정난 케이스 = In Press)
  const { data: research, isLoading } = useQuery<ResearchProject[]>({
    queryKey: ["research-projects"],
    queryFn: async () => {
      const res = await fetch("/api/notion/research")
      if (!res.ok) throw new Error("Failed to fetch research")
      return res.json()
    },
  })

  // 출판되었거나 Accepted 만
  const papers = useMemo(() => {
    if (!research) return []
    return research
      .filter((p) => p.status === "Published" || p.status === "Accepted")
      .map((p) => ({
        page_id: p.page_id,
        url: p.url,
        title: p.title,
        journal: p.target_journal || "?",
        year: deriveYear(p),
        role: deriveRole(p),
        type: (p.manuscript_type ?? "Original Article") as string,
        status: p.status,             // "Published" 또는 "Accepted"
        doi: p.doi,
      }))
  }, [research])

  const counts = useMemo(() => {
    const first = papers.filter(p => p.role === "1st").length
    const corr  = papers.filter(p => p.role === "corresponding").length
    const co    = papers.filter(p => p.role === "co-author").length
    const inPress = papers.filter(p => p.status === "Accepted").length
    return { total: papers.length, first, corr, co, inPress }
  }, [papers])

  const filtered = useMemo(() => {
    const list = filter === "all" ? papers : papers.filter(p => p.role === filter)
    // Accepted 를 맨 위로, 그 다음 year desc
    return [...list].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "Accepted" ? -1 : 1
      }
      return b.year - a.year
    })
  }, [papers, filter])

  /* ── chart data ── */

  // 연도별: role × (Published / In Press) 6 segment 로 쪼개서 stack.
  // 막대 총 높이 / 좌우 연도 축은 항상 같은 모양 유지 (papers 전체 기준).
  const yearData = useMemo(() => {
    type Row = {
      year: number
      firstPub: number; firstInPress: number
      corrPub: number; corrInPress: number
      coPub: number; coInPress: number
    }
    const map = new Map<number, Row>()
    for (const p of papers) {
      if (!map.has(p.year)) map.set(p.year, {
        year: p.year,
        firstPub: 0, firstInPress: 0,
        corrPub: 0, corrInPress: 0,
        coPub: 0, coInPress: 0,
      })
      const row = map.get(p.year)!
      const ip = p.status === "Accepted"
      if (p.role === "1st") ip ? row.firstInPress++ : row.firstPub++
      else if (p.role === "corresponding") ip ? row.corrInPress++ : row.corrPub++
      else ip ? row.coInPress++ : row.coPub++
    }
    return [...map.values()].sort((a, b) => a.year - b.year)
  }, [papers])

  // 막대 segment 정의 — 각 role 마다 Pub + In Press 한 쌍. In Press 는 같은 role 색이지만
  // 약간 흐림(60%) 으로 시각 구분. filter 활성 시 비선택 role 은 추가 dim (×0.2 ≈ 0.12).
  const barConfigs = useMemo(() => {
    type Cfg = {
      key: "firstPub" | "firstInPress" | "corrPub" | "corrInPress" | "coPub" | "coInPress"
      name: string
      color: string
      role: Filter
      isInPress: boolean
    }
    const ROLE_COLOR: Record<"1st" | "corresponding" | "co-author", string> = {
      "1st": "var(--status-drafting-text)",
      "corresponding": "var(--status-published-text)",
      "co-author": "var(--status-idea-text)",
    }
    const pair = (role: "1st" | "corresponding" | "co-author", pubKey: Cfg["key"], inPressKey: Cfg["key"], label: string): Cfg[] => [
      { key: pubKey,     name: label,                color: ROLE_COLOR[role], role, isInPress: false },
      { key: inPressKey, name: `${label} (In Press)`, color: ROLE_COLOR[role], role, isInPress: true  },
    ]
    const groups: Record<"1st" | "corresponding" | "co-author", Cfg[]> = {
      "1st":           pair("1st",           "firstPub", "firstInPress", "1st Author"),
      "corresponding": pair("corresponding", "corrPub",  "corrInPress",  "Corresponding"),
      "co-author":     pair("co-author",     "coPub",    "coInPress",    "Co-author"),
    }
    const baseOrder: Array<"1st" | "corresponding" | "co-author"> = ["1st", "corresponding", "co-author"]
    // 선택된 role 을 stack 바닥 (먼저 렌더) 으로 이동
    const order = filter === "all"
      ? baseOrder
      : [filter, ...baseOrder.filter((r) => r !== filter)] as Array<"1st" | "corresponding" | "co-author">
    return order.flatMap((r) => groups[r])
  }, [filter])

  const journalData = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of filtered) map.set(p.journal, (map.get(p.journal) || 0) + 1)
    return [...map.entries()]
      .map(([journal, count]) => ({ journal, count }))
      .sort((a, b) => b.count - a.count)
  }, [filtered])

  /* ── render ── */

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full bg-muted" />)}
      </div>
    )
  }

  const safePercent = (n: number) => counts.total > 0 ? `${Math.round((n / counts.total) * 100)}%` : "—"

  const metrics = [
    { label: "총 논문", value: counts.total, sub: counts.inPress > 0 ? `+${counts.inPress} In Press` : "" },
    { label: "1st Author", value: counts.first, sub: safePercent(counts.first) },
    { label: "Corresponding", value: counts.corr, sub: safePercent(counts.corr) },
    { label: "Co-author", value: counts.co, sub: safePercent(counts.co) },
  ]

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "1st", label: "1st Author" },
    { key: "corresponding", label: "Corresponding" },
    { key: "co-author", label: "Co-author" },
  ]

  return (
    <div className="space-y-6">
      {/* ── Profile links ── */}
      <div className="flex items-center gap-3">
        <a
          href={SCHOLAR_LINKS.googleScholar}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ backgroundColor: "var(--scholar-metric)", color: "var(--scholar-accent-text)" }}
        >
          <ExternalLink className="w-3 h-3" />
          Google Scholar
        </a>
        <a
          href={SCHOLAR_LINKS.researchGate}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ backgroundColor: "var(--scholar-metric)", color: "var(--scholar-accent-text)" }}
        >
          <ExternalLink className="w-3 h-3" />
          ResearchGate
        </a>
      </div>

      {/* ── Metric cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.map(m => (
          <div
            key={m.label}
            className="rounded-xl p-4 border transition-colors"
            style={{
              backgroundColor: "var(--scholar-metric)",
              borderColor: "var(--scholar-accent-light)",
            }}
          >
            <p className="text-xs opacity-60 mb-1" style={{ color: "var(--scholar-accent-text)" }}>
              {m.label}
            </p>
            <p className="text-2xl font-bold num" style={{ color: "var(--scholar-accent)" }}>
              {m.value}
              {m.sub && (
                <span className="text-sm font-normal ml-1.5 opacity-60">{m.sub}</span>
              )}
            </p>
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Year trend */}
        <div
          className="rounded-xl p-4 border"
          style={{ backgroundColor: "var(--scholar-card)", borderColor: "var(--scholar-accent-light)" }}
        >
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--scholar-accent-text)" }}>
            연도별 출판 추이
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={yearData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--scholar-accent-light)" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "var(--scholar-accent-text)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--scholar-accent-text)" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--scholar-card)",
                  border: "1px solid var(--scholar-accent-light)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--scholar-accent-text)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {barConfigs.map((cfg, idx) => {
                const isLast = idx === barConfigs.length - 1
                const dim = filter !== "all" && cfg.role !== filter
                // base: Pub = 1.0, InPress = 0.55. dim 시 ×0.2 → ~0.12.
                const baseOpacity = cfg.isInPress ? 0.55 : 1.0
                const opacity = dim ? baseOpacity * 0.2 : baseOpacity
                return (
                  <Bar
                    key={cfg.key}
                    dataKey={cfg.key}
                    name={cfg.name}
                    stackId="a"
                    fill={cfg.color}
                    fillOpacity={opacity}
                    radius={isLast ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                  />
                )
              })}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Journal distribution */}
        <div
          className="rounded-xl p-4 border"
          style={{ backgroundColor: "var(--scholar-card)", borderColor: "var(--scholar-accent-light)" }}
        >
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--scholar-accent-text)" }}>
            저널별 분포
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={journalData} margin={{ top: 4, right: 4, bottom: 40, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--scholar-accent-light)" />
              <XAxis
                dataKey="journal"
                tick={{ fontSize: 9, fill: "var(--scholar-accent-text)" }}
                angle={-35}
                textAnchor="end"
                interval={0}
                height={50}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--scholar-accent-text)" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--scholar-card)",
                  border: "1px solid var(--scholar-accent-light)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--scholar-accent-text)",
                }}
              />
              <Bar dataKey="count" name="Papers" fill="var(--scholar-accent)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
            style={
              filter === f.key
                ? { backgroundColor: "var(--scholar-accent)", color: "#fff" }
                : { backgroundColor: "var(--scholar-metric)", color: "var(--scholar-accent-text)" }
            }
          >
            {f.label}
          </button>
        ))}
        <span className="text-xs self-center ml-2 num" style={{ color: "var(--scholar-accent-text)", opacity: 0.5 }}>
          {filtered.length}편
        </span>
      </div>

      {/* ── Paper list ── */}
      <div className="space-y-2">
        {filtered.map(paper => {
          const typeStyle = TYPE_COLOR[paper.type] ?? TYPE_COLOR["Original Article"]
          const isInPress = paper.status === "Accepted"
          return (
            <div
              key={paper.page_id}
              className="rounded-xl px-4 py-3 border flex items-start gap-3 card-hover cursor-default"
              style={{
                backgroundColor: "var(--scholar-card)",
                borderColor: isInPress ? "var(--status-revision-text)" : "var(--scholar-accent-light)",
              }}
            >
              {/* Year + In Press */}
              <div className="flex flex-col items-start gap-1 shrink-0 mt-0.5">
                <span
                  className="text-xs font-mono num"
                  style={{ color: "var(--scholar-accent)", opacity: 0.7 }}
                >
                  {paper.year}
                </span>
                {isInPress && (
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                    style={{
                      backgroundColor: "var(--status-revision-bg)",
                      color: "var(--status-revision-text)",
                    }}
                  >
                    In Press
                  </span>
                )}
              </div>

              {/* Role badge */}
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 uppercase tracking-wide"
                style={{
                  backgroundColor: ROLE_BADGE[paper.role].bg,
                  color: ROLE_BADGE[paper.role].text,
                }}
              >
                {ROLE_BADGE[paper.role].label}
              </span>

              {/* Type badge */}
              <span
                className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 mt-0.5"
                style={{
                  backgroundColor: typeStyle.bg,
                  color: typeStyle.text,
                }}
              >
                {paper.type}
              </span>

              {/* Title + journal */}
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-medium leading-snug"
                  style={{ color: "var(--scholar-accent-text)" }}
                >
                  {paper.title}
                </p>
                <p className="text-xs mt-0.5 opacity-70 flex items-center gap-1.5 flex-wrap" style={{ color: "var(--scholar-accent-text)" }}>
                  <span className="opacity-70">{paper.journal}</span>
                  {paper.doi && (
                    <>
                      <span className="opacity-30">·</span>
                      <a
                        href={paper.doi.startsWith("http") ? paper.doi : `https://doi.org/${paper.doi}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 underline underline-offset-2 hover:opacity-100"
                      >
                        DOI
                      </a>
                    </>
                  )}
                  {paper.url && (
                    <>
                      <span className="opacity-30">·</span>
                      <a
                        href={paper.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-0.5 hover:opacity-100"
                        title="Notion 페이지 열기"
                        aria-label="Notion 페이지 열기"
                      >
                        <svg className="size-3.5" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">
                          <path d="M6.017 4.313l55.333-4.087c6.797-.583 8.543-.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277-1.553 6.807-6.99 7.193L24.467 99.967c-4.08.193-6.023-.39-8.16-3.113L3.3 79.94c-2.333-3.113-3.3-5.443-3.3-8.167V11.113c0-3.497 1.553-6.413 6.017-6.8z" fillRule="evenodd" opacity=".7"/>
                        </svg>
                        Notion
                      </a>
                    </>
                  )}
                </p>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-center py-8 opacity-50" style={{ color: "var(--scholar-accent-text)" }}>
            조건에 맞는 논문이 없습니다.
          </p>
        )}
      </div>
    </div>
  )
}
