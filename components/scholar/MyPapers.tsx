"use client"

import { useMemo, useState } from "react"
import { MY_PAPERS, type PaperRole } from "@/lib/data/my-papers"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts"

/* ── helpers ─────────────────────────────────────────── */

const ROLE_BADGE: Record<PaperRole, { bg: string; text: string; label: string }> = {
  "1st":           { bg: "var(--status-drafting-bg)",   text: "var(--status-drafting-text)",   label: "1st Author" },
  corresponding:   { bg: "var(--status-published-bg)",  text: "var(--status-published-text)",  label: "Corresponding" },
  "co-author":     { bg: "var(--status-idea-bg)",       text: "var(--status-idea-text)",       label: "Co-author" },
}

type Filter = "all" | PaperRole

/* ── component ───────────────────────────────────────── */

export function MyPapers() {
  const [filter, setFilter] = useState<Filter>("all")

  const counts = useMemo(() => {
    const first = MY_PAPERS.filter(p => p.role === "1st").length
    const corr  = MY_PAPERS.filter(p => p.role === "corresponding").length
    const co    = MY_PAPERS.filter(p => p.role === "co-author").length
    return { total: MY_PAPERS.length, first, corr, co }
  }, [])

  const filtered = useMemo(() => {
    const list = filter === "all" ? MY_PAPERS : MY_PAPERS.filter(p => p.role === filter)
    return [...list].sort((a, b) => b.year - a.year || b.id - a.id)
  }, [filter])

  /* ── chart data ── */

  const yearData = useMemo(() => {
    const map = new Map<number, { year: number; first: number; corresponding: number; coAuthor: number }>()
    for (const p of MY_PAPERS) {
      if (!map.has(p.year)) map.set(p.year, { year: p.year, first: 0, corresponding: 0, coAuthor: 0 })
      const row = map.get(p.year)!
      if (p.role === "1st") row.first++
      else if (p.role === "corresponding") row.corresponding++
      else row.coAuthor++
    }
    return [...map.values()].sort((a, b) => a.year - b.year)
  }, [])

  const journalData = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of MY_PAPERS) map.set(p.journal, (map.get(p.journal) || 0) + 1)
    return [...map.entries()]
      .map(([journal, count]) => ({ journal, count }))
      .sort((a, b) => b.count - a.count)
  }, [])

  /* ── render ── */

  const metrics = [
    { label: "총 논문", value: counts.total, sub: "" },
    { label: "1st Author", value: counts.first, sub: `${Math.round((counts.first / counts.total) * 100)}%` },
    { label: "Corresponding", value: counts.corr, sub: `${Math.round((counts.corr / counts.total) * 100)}%` },
    { label: "Co-author", value: counts.co, sub: `${Math.round((counts.co / counts.total) * 100)}%` },
  ]

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "1st", label: "1st Author" },
    { key: "corresponding", label: "Corresponding" },
    { key: "co-author", label: "Co-author" },
  ]

  return (
    <div className="space-y-6">
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
            <BarChart
              data={journalData}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--scholar-accent-light)" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--scholar-accent-text)" }} />
              <YAxis
                type="category"
                dataKey="journal"
                width={100}
                tick={{ fontSize: 10, fill: "var(--scholar-accent-text)" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--scholar-card)",
                  border: "1px solid var(--scholar-accent-light)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--scholar-accent-text)",
                }}
              />
              <Bar dataKey="count" name="Papers" radius={[0, 4, 4, 0]}>
                {journalData.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? "var(--scholar-accent)" : "var(--status-drafting-text)"} fillOpacity={1 - i * 0.05} />
                ))}
              </Bar>
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
      </div>

      {/* ── Paper list ── */}
      <div className="space-y-2">
        {filtered.map(paper => (
          <div
            key={paper.id}
            className="rounded-xl px-4 py-3 border flex items-start gap-3 card-hover cursor-default"
            style={{
              backgroundColor: "var(--scholar-card)",
              borderColor: "var(--scholar-accent-light)",
            }}
          >
            {/* Year */}
            <span
              className="text-xs font-mono mt-0.5 shrink-0 num"
              style={{ color: "var(--scholar-accent)", opacity: 0.7 }}
            >
              {paper.year}
            </span>

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
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
