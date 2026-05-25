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

  const yearData = useMemo(() => {
    const map = new Map<number, { year: number; first: number; corresponding: number; coAuthor: number }>()
    for (const p of papers) {
      if (!map.has(p.year)) map.set(p.year, { year: p.year, first: 0, corresponding: 0, coAuthor: 0 })
      const row = map.get(p.year)!
      if (p.role === "1st") row.first++
      else if (p.role === "corresponding") row.corresponding++
      else row.coAuthor++
    }
    return [...map.values()].sort((a, b) => a.year - b.year)
  }, [papers])

  const journalData = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of papers) map.set(p.journal, (map.get(p.journal) || 0) + 1)
    return [...map.entries()]
      .map(([journal, count]) => ({ journal, count }))
      .sort((a, b) => b.count - a.count)
  }, [papers])

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
              <Bar dataKey="first" name="1st Author" stackId="a" fill="var(--status-drafting-text)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="corresponding" name="Corresponding" stackId="a" fill="var(--status-published-text)" />
              <Bar dataKey="coAuthor" name="Co-author" stackId="a" fill="var(--status-idea-text)" radius={[3, 3, 0, 0]} />
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
                <p className="text-xs mt-0.5 opacity-50" style={{ color: "var(--scholar-accent-text)" }}>
                  {paper.journal}
                  {paper.doi && (
                    <>
                      {" · "}
                      <a href={paper.doi.startsWith("http") ? paper.doi : `https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                        DOI
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
