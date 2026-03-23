"use client"

import { useState, useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  BarChart, Bar, XAxis, YAxis, Cell, LabelList, ResponsiveContainer,
} from "recharts"
import { RadarChart } from "./RadarChart"
import { XPBar } from "./XPBar"
import { loadUserProfile } from "@/lib/sensei/userProfile"
import { ARCHETYPES } from "@/lib/sensei/archetypes"
import type { BjjStats, BjjAttributes, UserProfile } from "@/lib/types/sensei"

interface SenseiDashboardProps {
  onNavigate: (tab: string) => void
  onAskCoach: (question?: string) => void
}

// ─── Design Tokens (DESIGN-SYSTEM.md) ────────────────────────
const C = {
  belt: { white: "#d4d4d8", blue: "#3b82f6", purple: "#a855f7", brown: "#92400e", black: "#27272a" } as Record<string, string>,
  cat: { guard: "#a855f7", passing: "#22c55e", control: "#f97316", finishing: "#ef4444", takedowns: "#06b6d4", legLocks: "#eab308" } as Record<string, string>,
  tx1: "#ffffff",
  tx2: "rgba(255,255,255,0.5)",
  tx3: "rgba(255,255,255,0.25)",
  bgCard: "rgba(255,255,255,0.03)",
  bgAccent: "rgba(255,255,255,0.05)",
  border: "rgba(255,255,255,0.06)",
}

const BELT_DISPLAY: Record<string, string> = { white: "화이트벨트", blue: "블루벨트", purple: "퍼플벨트", brown: "브라운벨트", black: "블랙벨트" }
const ATTR_CFG: { key: keyof BjjAttributes; label: string; color: string }[] = [
  { key: "guard", label: "Guard", color: "#a855f7" },
  { key: "passing", label: "Passing", color: "#22c55e" },
  { key: "control", label: "Control", color: "#f97316" },
  { key: "finishing", label: "Finishing", color: "#ef4444" },
  { key: "takedowns", label: "Takedowns", color: "#06b6d4" },
  { key: "legLocks", label: "Leg Locks", color: "#eab308" },
]

// ─── Card (flat, no shadow, max rounded-xl=12px) ─────────────
function Card({ children, accent, className = "", onClick }: {
  children: React.ReactNode; accent?: boolean; className?: string; onClick?: () => void
}) {
  return (
    <div
      className={`rounded-xl p-5 ${className}`}
      style={{ background: accent ? C.bgAccent : C.bgCard, border: `1px solid ${C.border}` }}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick() } : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  )
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <span className="text-[13px] font-medium tracking-[0.5px]" style={{ color: C.tx2 }}>{children}</span>
}

// ─── Belt Bar (28px, flat) ───────────────────────────────────
const BELTS = [
  { name: "white", color: "#d4d4d8", kr: "화이트" },
  { name: "blue", color: "#3b82f6", kr: "블루" },
  { name: "purple", color: "#a855f7", kr: "퍼플" },
  { name: "brown", color: "#92400e", kr: "브라운" },
  { name: "black", color: "#27272a", kr: "블랙" },
]

function BeltBar({ belt, stripes }: { belt: string; stripes: number }) {
  const idx = BELTS.findIndex((b) => b.name === belt)
  const pct = ((Math.max(idx, 0) * 5 + Math.min(stripes, 4)) / 24) * 100
  return (
    <div>
      <div className="relative h-7 rounded flex overflow-hidden">
        {BELTS.map((b, i) => (
          <div
            key={b.name}
            className="flex-1 relative flex items-center justify-evenly"
            style={{
              background: b.color,
              opacity: pct >= (i / 5) * 100 ? 1 : 0.2,
              borderRight: i < 4 ? "1px solid rgba(0,0,0,0.3)" : undefined,
            }}
          >
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="h-[60%] rounded-sm" style={{ width: 3, background: b.name === "white" ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.3)" }} />
            ))}
          </div>
        ))}
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10" style={{ left: `${pct}%` }}>
          <div className="w-3 h-3 rounded-full bg-white" style={{ border: `2px solid ${C.belt[belt] || "#3b82f6"}` }} />
        </div>
      </div>
      <div className="flex mt-1">
        {BELTS.map((b) => <span key={b.name} className="flex-1 text-[11px] text-center" style={{ color: C.tx3 }}>{b.kr}</span>)}
      </div>
    </div>
  )
}

// ─── Avatar SVG ──────────────────────────────────────────────
function Avatar({ belt }: { belt: string }) {
  const bc = C.belt[belt] || "#3b82f6"
  return (
    <svg viewBox="0 0 120 160" className="w-full h-full" style={{ maxWidth: 120 }}>
      <circle cx="60" cy="30" r="20" fill="#52525b" />
      <path d="M32 58 Q32 48 42 46 L60 52 L78 46 Q88 48 88 58 L88 118 L32 118 Z" fill="#d4d4d8" stroke="#a1a1aa" strokeWidth="0.5" />
      <path d="M50 52 L60 70 L70 52" fill="none" stroke="#a1a1aa" strokeWidth="1" />
      <rect x="32" y="86" width="56" height="7" rx="1" fill={bc} />
      <path d="M57 93 Q54 100 48 104 M63 93 Q66 100 72 104" fill="none" stroke={bc} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M32 118 L36 152 L54 152 L60 122 L66 152 L84 152 L88 118 Z" fill="#3f3f46" />
    </svg>
  )
}

function fmtDur(m: number): string {
  const y = Math.floor(m / 12); const mo = m % 12
  if (y === 0) return `${mo}개월`
  if (mo === 0) return `${y}년`
  return `${y}년 ${mo}개월`
}

// ─── Main ────────────────────────────────────────────────────
export function SenseiDashboard({ onNavigate, onAskCoach }: SenseiDashboardProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [coachQ, setCoachQ] = useState("")
  useEffect(() => { setProfile(loadUserProfile()) }, [])

  const { data, isLoading, error } = useQuery<{ stats: BjjStats; tagFrequencies: Record<string, number> }>({
    queryKey: ["sensei-stats"],
    queryFn: async () => { const r = await fetch("/api/notion/sensei/stats"); if (!r.ok) throw new Error("err"); return r.json() },
  })

  const { data: coachData } = useQuery<{ reply: string }>({
    queryKey: ["sensei-coach-oneliner", data?.stats?.level],
    queryFn: async () => {
      const r = await fetch("/api/ai/sensei-coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "oneliner", stats: data?.stats }) })
      if (!r.ok) throw new Error("err"); return r.json()
    },
    enabled: !!data?.stats, staleTime: 1000 * 60 * 30,
  })

  const arch = useMemo(() => {
    if (!data?.stats?.combined.closestArchetype) return null
    return ARCHETYPES.find((a) => a.name === data.stats.combined.closestArchetype) ?? null
  }, [data])

  const barData = useMemo(() => {
    if (!data?.stats) return []
    const a = data.stats.combined.attributes
    return ATTR_CFG.map(({ key, label, color }) => ({ name: label, value: a[key], color }))
  }, [data])

  if (isLoading || !profile) return <div className="flex justify-center py-20"><span className="text-[13px]" style={{ color: C.tx2 }}>스탯 불러오는 중...</span></div>
  if (error || !data) return <div className="text-center py-20"><p className="text-[13px]" style={{ color: "#ef4444" }}>스탯을 불러올 수 없습니다</p></div>

  const { stats, tagFrequencies } = data

  return (
    <div className="max-w-[1080px] mx-auto space-y-4">
      {/* ═══ Profile 3-col ═══ */}
      <Card>
        <div className="grid grid-cols-[80px_1fr] md:grid-cols-[140px_1fr_280px] gap-5">
          <div className="flex items-center justify-center">
            <div className="w-[120px] h-[140px] rounded-xl overflow-hidden" style={{ background: C.bgAccent }}>
              <Avatar belt={stats.belt} />
            </div>
          </div>
          <div className="flex flex-col justify-center gap-1.5">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[24px] font-semibold tracking-[-0.3px] text-white">{profile.name}</span>
              <span className="text-[13px] font-medium" style={{ color: "#3b82f6" }}>Lv.{stats.level}</span>
              <span className="text-[13px] font-medium" style={{ color: C.tx2 }}>{stats.playstyle}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-medium" style={{ color: C.belt[stats.belt] || "#3b82f6" }}>
                현재: {BELT_DISPLAY[stats.belt] || stats.belt} {stats.beltStripes}그랄
              </span>
              <span className="text-[13px] font-medium" style={{ color: C.tx2 }}>OVR {stats.combined.ovr}</span>
            </div>
            <XPBar current={stats.xpCurrent} total={stats.xpToNext} level={stats.level} />
          </div>
          <div className="col-span-full md:col-span-1 rounded-xl p-4" style={{ background: C.bgAccent, border: `1px solid ${C.border}` }}>
            <Lbl>최근 수련 기록</Lbl>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mt-2 text-[12px]">
              {([["수련 기간", fmtDur(stats.trainingMonths)], ["기록된 수련", `${stats.totalSessions}회`], ["연속", `${stats.streaks.current}주`], ["최장", `${stats.streaks.best}주`], ["Gi 비율", `${Math.round(stats.giRatio * 100)}%`]] as [string, string][]).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt style={{ color: C.tx2 }}>{k}</dt>
                  <dd className="text-right font-medium text-white">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Card>

      {/* ═══ Belt ═══ */}
      <Card><BeltBar belt={stats.belt} stripes={stats.beltStripes} /></Card>

      {/* ═══ Radar + BarChart ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card onClick={() => onNavigate("stats")}>
          <Lbl>능력치 레이더</Lbl>
          <div className="mt-2"><RadarChart attributes={stats.combined.attributes} compareAttributes={arch?.stats ?? null} compareName={arch?.name} maxDomain={40} /></div>
        </Card>
        <Card>
          <Lbl>능력치 상세</Lbl>
          <div className="mt-2">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: C.tx2, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide domain={[0, 40]} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
                  <LabelList dataKey="value" position="top" style={{ fill: C.tx1, fontSize: 14, fontWeight: 600 }} />
                  {barData.map((e, i) => <Cell key={String(i)} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {arch && (
            <div className="mt-2 text-center">
              <span className="text-[11px]" style={{ color: C.tx3 }}>가장 유사한 아키타입: </span>
              <span className="text-[12px] font-medium" style={{ color: C.tx2 }}>{arch.flag} {arch.name} — {arch.playstyle}</span>
            </div>
          )}
        </Card>
      </div>

      {/* ═══ Focus + Goal ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <Lbl>최근 포커스</Lbl>
          <div className="flex flex-wrap gap-2 mt-3">
            {stats.recentFocus.length > 0 ? stats.recentFocus.map((tag) => {
              const color = C.cat[Object.keys(C.cat).find((k) => tag.toLowerCase().includes(k)) || ""] || "#a855f7"
              return (
                <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium" style={{ background: `${color}1F`, color: `${color}cc` }}>
                  {tag}
                  {tagFrequencies[tag] && <span style={{ opacity: 0.6, fontSize: 11 }}>{tagFrequencies[tag]}</span>}
                </span>
              )
            }) : <span className="text-[12px]" style={{ color: C.tx3 }}>수련 기록이 쌓이면 태그가 표시됩니다</span>}
          </div>
        </Card>
        <Card accent>
          <div className="flex items-center justify-between">
            <Lbl>{profile.nextGoalTitle || "목표"}</Lbl>
            {profile.nextGoalProgress != null && <span className="text-[13px] font-semibold tabular-nums text-white">{profile.nextGoalProgress}%</span>}
          </div>
          {profile.nextGoalText && <p className="text-[13px] mt-1" style={{ color: C.tx2 }}>{profile.nextGoalText}</p>}
          <div className="h-2 rounded mt-3 overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="h-full rounded" style={{ width: `${profile.nextGoalProgress ?? 0}%`, background: "#3b82f6" }} />
          </div>
        </Card>
      </div>

      {/* ═══ Coach ═══ */}
      <Card>
        <div className="flex items-center gap-3">
          <span className="text-[16px]">🤖</span>
          <p className="flex-1 text-[13px] leading-relaxed" style={{ color: coachData?.reply ? C.tx2 : C.tx3 }}>
            {coachData?.reply || "코치 추천 로딩 중..."}
          </p>
          <input
            type="text" value={coachQ} onChange={(e) => setCoachQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && coachQ.trim()) { onAskCoach(coachQ.trim()); setCoachQ("") } }}
            placeholder="코치에게 질문..."
            className="w-[220px] px-3 py-2 rounded-lg text-[13px] text-white/90 placeholder:text-white/25 focus:outline-none"
            style={{ background: C.bgCard, border: `1px solid rgba(255,255,255,0.08)` }}
          />
        </div>
      </Card>

      {/* ═══ Nav ═══ */}
      <div className="flex gap-2 flex-wrap pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
        {[{ t: "journal", l: "수련 기록", i: "📝" }, { t: "stats", l: "상세 스탯", i: "📊" }, { t: "heroes", l: "BJJ Heroes", i: "🏆" }, { t: "competition", l: "대회", i: "📅" }].map(({ t, l, i }) => (
          <button key={t} type="button" onClick={() => onNavigate(t)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] transition-all hover:text-white/70"
            style={{ background: C.bgCard, border: `1px solid rgba(255,255,255,0.08)`, color: C.tx2 }}>
            <span>{i}</span><span>{l}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
