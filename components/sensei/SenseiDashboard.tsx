"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts"
import { loadUserProfile } from "@/lib/sensei/userProfile"
import { useSenseiData } from "@/lib/sensei/useSenseiData"
import { BELT_CAPS, PROMOTION_HISTORY } from "@/lib/sensei/stats"
import { calculateOvr } from "@/lib/sensei/ovr"
import type { BjjStats, BjjAttributes, UserProfile, Archetype, PositionLayer } from "@/lib/types/sensei"

const LAYER_COLORS_MAP: Record<PositionLayer, string> = {
  standing: "#71717a",
  guard: "#3b82f6",
  passing: "#22c55e",
  control: "#f59e0b",
  submission: "#ef4444",
  leglock: "#dc2626",
}

interface SenseiDashboardProps { onNavigate: (tab: string) => void }

const STAT_BARS: { key: keyof BjjAttributes; name: string; color: string; hex: string }[] = [
  { key: "guard", name: "Guard", color: "bg-purple-500", hex: "#a855f7" },
  { key: "passing", name: "Passing", color: "bg-green-500", hex: "#22c55e" },
  { key: "control", name: "Control", color: "bg-orange-600", hex: "#ea580c" },
  { key: "finishing", name: "Submission", color: "bg-red-500", hex: "#ef4444" },
  { key: "takedowns", name: "Standing", color: "bg-cyan-500", hex: "#06b6d4" },
  { key: "legLocks", name: "Leg Locks", color: "bg-yellow-500", hex: "#eab308" },
]

const BELTS = [
  { id: "white", color: "bg-zinc-200", hex: "#d4d4d8" },
  { id: "blue", color: "bg-blue-600", hex: "#3b82f6" },
  { id: "purple", color: "bg-purple-600", hex: "#a855f7" },
  { id: "brown", color: "bg-amber-800", hex: "#92400e" },
  { id: "black", color: "bg-card", hex: "#27272a" },
]

function getClipPath(i: number, len: number) {
  if (i === 0) return "polygon(0% 0%, calc(100% - 1.5rem) 0%, 100% 50%, calc(100% - 1.5rem) 100%, 0% 100%)"
  if (i === len - 1) return "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 1.5rem 50%)"
  return "polygon(0% 0%, calc(100% - 1.5rem) 0%, 100% 50%, calc(100% - 1.5rem) 100%, 0% 100%, 1.5rem 50%)"
}

function getStripesForBelt(belt: string) {
  const entries = PROMOTION_HISTORY.filter((p) => p.belt === belt)
  return { reached: entries.length > 0 ? Math.max(...entries.map((e) => e.stripes)) : 0 }
}

function cosineSimilarity(a: BjjAttributes, b: BjjAttributes): number {
  const keys: (keyof BjjAttributes)[] = ["guard", "passing", "control", "finishing", "takedowns", "legLocks"]
  let dot = 0, magA = 0, magB = 0
  for (const k of keys) { dot += a[k] * b[k]; magA += a[k] ** 2; magB += b[k] ** 2 }
  if (magA === 0 || magB === 0) return 0
  return Math.round((dot / (Math.sqrt(magA) * Math.sqrt(magB))) * 100)
}

type CatFilter = "all" | "gi-legend" | "gi-active" | "nogi" | "special"

export function SenseiDashboard({ onNavigate }: SenseiDashboardProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [hoveredBelt, setHoveredBelt] = useState<{ belt: string; stripe: number } | null>(null)
  const [giMode, setGiMode] = useState<"gi" | "nogi">("gi")
  const [imgError, setImgError] = useState(false)
  const [compareArch, setCompareArch] = useState<Archetype | null>(null)
  const [catFilter, setCatFilter] = useState<CatFilter>("all")

  useEffect(() => { setProfile(loadUserProfile()) }, [])

  const { data, isLoading, error } = useQuery<{ stats: BjjStats; tagFrequencies: Record<string, number>; studyTagFrequencies: Record<string, number> }>({
    queryKey: ["sensei-stats"],
    queryFn: async () => { const r = await fetch("/api/notion/sensei/stats"); if (!r.ok) throw new Error("err"); return r.json() },
  })

  const { archetypes, positions } = useSenseiData()

  const closestArch = useMemo(() => {
    if (!data?.stats) return null
    const myAttrs = data.stats[giMode].attributes
    let best: Archetype | null = null
    let bestSim = 0
    for (const a of archetypes) {
      const sim = cosineSimilarity(myAttrs, a.stats)
      if (sim > bestSim) { bestSim = sim; best = a }
    }
    return best ? { arch: best, similarity: bestSim } : null
  }, [data, archetypes, giMode])

  const [hoveredArch, setHoveredArch] = useState<Archetype | null>(null)
  const activeCompare = compareArch ?? hoveredArch ?? closestArch?.arch ?? null

  // 가로 스크롤 마우스 드래그
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragState = useRef({ isDown: false, startX: 0, scrollLeft: 0 })
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current; if (!el) return
    dragState.current = { isDown: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft }
    el.style.cursor = "grabbing"
  }, [])
  const onMouseUp = useCallback(() => {
    if (scrollRef.current) scrollRef.current.style.cursor = "grab"
    dragState.current.isDown = false
  }, [])
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState.current.isDown) return; e.preventDefault()
    const el = scrollRef.current; if (!el) return
    const x = e.pageX - el.offsetLeft
    el.scrollLeft = dragState.current.scrollLeft - (x - dragState.current.startX)
  }, [])

  const filteredArchetypes = useMemo(() => {
    if (catFilter === "all") return archetypes
    return archetypes.filter((a) => a.category === catFilter)
  }, [archetypes, catFilter])

  if (isLoading || !profile) return <div className="flex justify-center py-20"><span className="text-sm text-muted-foreground animate-pulse">스탯 불러오는 중...</span></div>
  if (error || !data) return <div className="text-center py-20"><p className="text-sm text-red-400">스탯을 불러올 수 없습니다</p></div>

  const { stats, tagFrequencies } = data
  const activeStats = stats[giMode]
  const attrs = activeStats.attributes
  const beltCap = BELT_CAPS[stats.belt] ?? 40
  const beltHex = BELTS.find((b) => b.id === stats.belt)?.hex || "#3b82f6"
  const currentBeltIdx = BELTS.findIndex((b) => b.id === stats.belt)

  const radarData = STAT_BARS.map((s) => ({
    subject: s.name,
    value: attrs[s.key],
    cap: beltCap,
    ...(activeCompare ? { compare: activeCompare.stats[s.key] } : {}),
    fullMark: 100,
  }))

  const weakest = STAT_BARS.reduce((min, s) => attrs[s.key] < attrs[min.key] ? s : min, STAT_BARS[0])

  function getPromoDate(belt: string, stripe: number): string | undefined {
    return PROMOTION_HISTORY.find((p) => p.belt === belt && p.stripes === stripe)?.date
  }

  return (
    <div className="text-foreground font-sans">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* ══ 메인 카드: 이미지 | 스탯 ══ */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-[240px_1fr]">

          {/* 좌: 이미지 (모바일 숨김) */}
          <div className="hidden md:flex bg-muted items-end justify-center">
            {!imgError ? (
              <img src="/images/character_full.png" alt="" className="w-full max-w-[240px] max-h-[520px] object-contain object-bottom" onError={() => setImgError(true)} />
            ) : (
              <svg viewBox="0 0 120 160" className="w-28 mb-4"><circle cx="60" cy="30" r="20" fill="#52525b"/><path d="M32 58 Q32 48 42 46 L60 52 L78 46 Q88 48 88 58 L88 118 L32 118 Z" fill="#d4d4d8"/><rect x="32" y="86" width="56" height="7" rx="1" fill={beltHex}/><path d="M32 118 L36 152 L54 152 L60 122 L66 152 L84 152 L88 118 Z" fill="#3f3f46"/></svg>
            )}
          </div>

          {/* 우: 스탯 패널 */}
          <div className="p-5 flex flex-col gap-4">

            {/* 이름 + OVR + Gi/NoGi */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-amber-600 to-yellow-500 flex flex-col items-center justify-center shadow-md shrink-0">
                <span className="text-xl font-black text-white leading-none">{activeStats.ovr}</span>
                <span className="text-[7px] font-semibold text-white/70 tracking-wider">OVR</span>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">{profile.name}</h1>
                <p className="text-xs text-muted-foreground">{activeStats.ovrRole} · {stats.playstyle}</p>
              </div>
              <div className="flex gap-1 ml-auto">
                <button onClick={() => setGiMode("gi")} className={`px-2.5 py-0.5 rounded text-xs ${giMode === "gi" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "text-muted-foreground border border-transparent"}`}>Gi</button>
                <button onClick={() => setGiMode("nogi")} className={`px-2.5 py-0.5 rounded text-xs ${giMode === "nogi" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "text-muted-foreground border border-transparent"}`}>NoGi</button>
              </div>
            </div>

            {/* 수련 요약 */}
            <div className="grid grid-cols-5 gap-2 text-center">
              {[
                { v: "2019.11", l: "수련 시작" },
                { v: String(stats.totalSessions), l: "총 세션" },
                { v: String(stats.sessions2026), l: "올해" },
                { v: `${stats.streaks.current}`, l: "연속" },
                { v: `${Math.round(stats.giRatio * 100)}%`, l: "Gi 비율" },
              ].map(({ v, l }) => (
                <div key={l}>
                  <p className="text-sm font-semibold text-foreground">{v}</p>
                  <p className="text-[9px] text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>

            {/* 벨트 타임라인 (chevron + 승급날짜) */}
            <div className="flex items-center h-11 relative w-full gap-0.5">
              {BELTS.map((belt, idx) => {
                const isPast = currentBeltIdx >= idx
                const isCur = belt.id === stats.belt
                const filled = isPast ? (isCur ? stats.beltStripes : getStripesForBelt(belt.id).reached) : 0
                return (
                  <div key={belt.id} className={`relative h-full flex-1 ${belt.color} ${!isPast ? "opacity-30 grayscale" : ""}`} style={{ clipPath: getClipPath(idx, BELTS.length) }}>
                    <div className="absolute inset-0 flex items-center">
                      {[0,1,2,3,4].map((si) => (
                        <div key={si} className="flex-1 flex items-center justify-center h-full" style={{ minWidth: 14 }}
                          onMouseEnter={() => isPast && setHoveredBelt({ belt: belt.id, stripe: si })}
                          onMouseLeave={() => setHoveredBelt(null)}>
                          {si === 0
                            ? <div className={`w-1.5 h-1.5 rounded-full ${isPast && si <= filled ? "bg-white" : "bg-muted"}`}/>
                            : <div className={`w-1 h-[50%] rounded-sm ${isPast && si <= filled ? "bg-white" : "bg-muted/50"}`}/>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              {hoveredBelt && (() => {
                const d = hoveredBelt.stripe === 0
                  ? getPromoDate(hoveredBelt.belt, 0) || PROMOTION_HISTORY.find((p) => p.belt === hoveredBelt.belt)?.date
                  : getPromoDate(hoveredBelt.belt, hoveredBelt.stripe)
                const bi = BELTS.findIndex((b) => b.id === hoveredBelt.belt)
                const pct = (bi + (hoveredBelt.stripe + 0.5) / 5) / BELTS.length * 100
                return (
                  <div className="absolute top-[-40px] bg-muted text-[10px] px-2 py-1 rounded border border-border z-20 pointer-events-none whitespace-nowrap" style={{ left: `${pct}%`, transform: "translateX(-50%)" }}>
                    {hoveredBelt.stripe === 0 ? `${hoveredBelt.belt} 승급` : `${hoveredBelt.belt} ${hoveredBelt.stripe}그랄`}
                    {d && <span className="ml-1 text-muted-foreground">{d}</span>}
                  </div>
                )
              })()}
            </div>

            {/* 레이더 + 6축바 나란히 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* 레이더 (비교 오버레이) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[10px] font-medium text-muted-foreground">능력치 레이더</h3>
                  {activeCompare && <span className="text-[9px] text-muted-foreground">vs {activeCompare.name}</span>}
                </div>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="68%" data={radarData}>
                      <PolarGrid stroke="var(--border)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="Cap" dataKey="cap" stroke={beltHex} strokeWidth={1} strokeDasharray="4 3" fill="none" />
                      <Radar name="Me" dataKey="value" stroke="#f97316" strokeWidth={2} fill="#f97316" fillOpacity={0.2} />
                      {activeCompare && (
                        <Radar name={activeCompare.name} dataKey="compare" stroke="#f87171" strokeWidth={1.5} fill="none" strokeDasharray="5 3" />
                      )}
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                {closestArch && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    {closestArch.arch.flag} {closestArch.arch.name} — {closestArch.similarity}% match
                  </p>
                )}
              </div>

              {/* 6축 바 (비교 마커 포함) */}
              <div>
                <h3 className="text-[10px] font-medium text-muted-foreground mb-2">능력치</h3>
                <div className="space-y-1.5">
                  {STAT_BARS.map((s) => {
                    const compVal = activeCompare?.stats[s.key]
                    return (
                      <div key={s.name}>
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span className="text-muted-foreground">{s.name}</span>
                          <span className="font-semibold text-foreground">{attrs[s.key]}</span>
                        </div>
                        <div className="relative w-full h-1.5 bg-muted rounded-full overflow-visible">
                          <div className={`h-full ${s.color} rounded-full`} style={{ width: `${attrs[s.key]}%` }} />
                          <div className="absolute top-0 h-full w-px" style={{ left: `${beltCap}%`, background: beltHex, opacity: 0.4 }} />
                          {compVal !== undefined && (
                            <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 rounded-full bg-foreground/40" style={{ left: `${compVal}%` }} title={`${activeCompare?.name}: ${compVal}`} />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* 최근 포커스 + 관심사 */}
            <div className="pt-2 border-t border-border space-y-2">
              <h3 className="text-[10px] font-medium text-muted-foreground">최근 포커스</h3>
              <div className="flex flex-wrap gap-1.5">
                {stats.recentFocus.length > 0 ? stats.recentFocus.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 bg-orange-900/20 text-orange-500 border border-orange-900/50 rounded text-[10px] font-medium">
                    {tag}{tagFrequencies[tag] ? <span className="ml-1 text-orange-700">{tagFrequencies[tag]}</span> : null}
                  </span>
                )) : <span className="text-[10px] text-muted-foreground/70">수련 기록이 쌓이면 표시됩니다</span>}
              </div>
              {data.studyTagFrequencies && Object.keys(data.studyTagFrequencies).length > 0 && (
                <>
                  <h3 className="text-[10px] font-medium text-muted-foreground">🎥 요즘 관심사</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(data.studyTagFrequencies).sort(([, a], [, b]) => b - a).slice(0, 8).map(([tag, count]) => (
                      <span key={tag} className="px-2 py-0.5 bg-green-900/20 text-green-500 border border-green-900/50 rounded text-[10px] font-medium">
                        {tag}<span className="ml-1 text-green-700">{count}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

          </div>
        </div>

        {/* ══ 선수 비교 (from Character) ══ */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-medium text-muted-foreground">선수 비교</h3>
            <div className="flex gap-1 flex-wrap">
              {([
                { id: "all", label: "전체" }, { id: "gi-legend", label: "Gi Legend" },
                { id: "gi-active", label: "Gi Active" }, { id: "nogi", label: "NoGi" },
                { id: "special", label: "Special" },
              ] as { id: CatFilter; label: string }[]).map((f) => (
                <button key={f.id} onClick={() => setCatFilter(f.id)}
                  className={`px-2 py-0.5 text-[10px] rounded transition-colors ${catFilter === f.id ? "bg-orange-600 text-white" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                >{f.label}</button>
              ))}
            </div>
          </div>
          <div ref={scrollRef} className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide cursor-grab select-none"
            onMouseDown={onMouseDown} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onMouseMove={onMouseMove}>
            {filteredArchetypes.map((a) => {
              const isSelected = compareArch?.name === a.name
              const firstName = a.name.split(" ")[0]
              return (
                <button key={a.name} type="button"
                  onClick={() => setCompareArch(isSelected ? null : a)}
                  onPointerEnter={() => setHoveredArch(a)}
                  onPointerLeave={() => setHoveredArch(null)}
                  className={`shrink-0 w-20 rounded-xl border p-1.5 text-center transition-all ${isSelected ? "border-orange-500 bg-orange-500/10 ring-1 ring-orange-500/30" : "border-border bg-muted/50 hover:border-foreground/20"}`}
                >
                  <p className="text-[11px] font-bold text-foreground truncate">{firstName}</p>
                  <p className="text-[8px]">{a.flag}</p>
                  <p className="text-[7px] text-muted-foreground truncate">{a.nickname}</p>
                </button>
              )
            })}
          </div>

          {/* 선수 상세 (클릭 고정 or 호버) */}
          {activeCompare && (
            <div className="mt-3 border border-border rounded-xl bg-muted/30 p-4 space-y-3">
              {/* 헤더: Full name 크게 */}
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <h4 className="text-base font-bold text-foreground">{activeCompare.name}</h4>
                  <p className="text-xs text-muted-foreground">{activeCompare.flag} {activeCompare.nickname} · {activeCompare.team}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{activeCompare.playstyle}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-lg font-bold text-amber-500">{calculateOvr(activeCompare.stats).ovr}</span>
                  <span className="text-[10px] text-muted-foreground ml-1">OVR</span>
                  <p className="text-[10px] text-muted-foreground">{cosineSimilarity(attrs, activeCompare.stats)}% match</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-4">
                <div className="space-y-3">
                  {/* 6축 비교 */}
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                    {STAT_BARS.map((s) => (
                      <div key={s.name} className="flex items-center gap-1.5 text-[10px]">
                        <span className="text-muted-foreground w-16 shrink-0">{s.name}</span>
                        <span className="font-semibold text-foreground w-5 text-right">{attrs[s.key]}</span>
                        <span className="text-muted-foreground/60">vs</span>
                        <span className="font-semibold w-5" style={{ color: activeCompare.stats[s.key] > attrs[s.key] ? "#f87171" : "#4ade80" }}>{activeCompare.stats[s.key]}</span>
                      </div>
                    ))}
                  </div>

                  {/* 시그니처 태그 */}
                  {activeCompare.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {activeCompare.tags.map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 text-[8px] bg-muted border border-border rounded text-muted-foreground">{tag}</span>
                      ))}
                    </div>
                  )}

                  {/* 게임플랜 — Map 스타일 SVG 시각화 */}
                  {activeCompare.gameplan.length > 0 && (
                    <div>
                      <h5 className="text-[10px] text-muted-foreground mb-1.5">게임플랜</h5>
                      <div className="border border-border rounded-lg bg-card p-2 overflow-x-auto">
                        <svg viewBox={`0 0 ${Math.max(activeCompare.gameplan.length * 140, 400)} 80`} className="w-full" style={{ minHeight: 70 }}>
                          {activeCompare.gameplan.map((step, i) => {
                            const x = 70 + i * 130
                            const y = 40
                            const pos = positions.find((p) => p.id === step.position || p.name === step.position || p.nameKr === step.position)
                            const layerColor = pos ? (LAYER_COLORS_MAP[pos.layer] || "#71717a") : "#71717a"
                            return (
                              <g key={i}>
                                {/* 연결선 */}
                                {i > 0 && (
                                  <path
                                    d={`M${x - 95},${y} Q${x - 60},${y - 15} ${x - 25},${y}`}
                                    stroke={layerColor}
                                    strokeWidth={1.5}
                                    fill="none"
                                    markerEnd="url(#gp-arrow)"
                                    opacity={0.6}
                                  />
                                )}
                                {/* 노드 */}
                                <circle cx={x} cy={y} r={16} fill={layerColor} fillOpacity={0.15} stroke={layerColor} strokeWidth={1.5}
                                  className="cursor-pointer" onClick={() => onNavigate("map")} />
                                <text x={x} y={y + 3} textAnchor="middle" fill={layerColor} fontSize={8} fontWeight={700}>{step.position.slice(0, 4)}</text>
                                {/* 액션 라벨 */}
                                <text x={x} y={y + 32} textAnchor="middle" fill="var(--muted-foreground)" fontSize={7} opacity={0.8}>
                                  {step.action.slice(0, 18)}
                                </text>
                              </g>
                            )
                          })}
                          <defs>
                            <marker id="gp-arrow" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
                              <polygon points="0 0, 6 2.5, 0 5" fill="var(--muted-foreground)" opacity={0.5} />
                            </marker>
                          </defs>
                        </svg>
                      </div>
                      <button type="button" onClick={() => onNavigate("map")} className="mt-1 text-[9px] text-blue-400 hover:text-blue-300">
                        Map에서 자세히 보기 →
                      </button>
                    </div>
                  )}
                </div>

                {/* 미니 레이더 */}
                <div className="hidden md:block">
                  <div className="h-[160px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                        <PolarGrid stroke="var(--border)" />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 8, fill: "var(--muted-foreground)" }} />
                        <Radar dataKey="value" stroke="#f97316" strokeWidth={1.5} fill="#f97316" fillOpacity={0.15} />
                        <Radar dataKey="compare" stroke="#f87171" strokeWidth={1.5} fill="none" strokeDasharray="4 3" />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ══ 성장 추천 ══ */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground">성장 추천</h3>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0" style={{ backgroundColor: weakest.hex + "20", color: weakest.hex }}>↑</div>
            <div>
              <p className="text-xs text-foreground font-medium"><span style={{ color: weakest.hex }}>{weakest.name}</span> 강화 권장</p>
              <p className="text-[10px] text-muted-foreground">현재 {attrs[weakest.key]}점 — 가장 낮은 영역</p>
            </div>
          </div>
          {(stats.completedCycles.length > 0 || stats.inProgressCycles.length > 0) && (
            <div>
              <h4 className="text-[10px] text-muted-foreground mb-1.5">학습 사이클</h4>
              <div className="flex flex-wrap gap-1.5">
                {stats.completedCycles.map((c) => (
                  <span key={`c-${c.tag}`} className="px-2 py-0.5 bg-emerald-900/20 text-emerald-400 border border-emerald-900/50 rounded text-[10px]">🔄 {c.tag}</span>
                ))}
                {stats.inProgressCycles.map((c) => (
                  <span key={`p-${c.tag}`} className="px-2 py-0.5 bg-muted text-muted-foreground border border-border rounded text-[10px]">
                    {c.tag} <span className="text-[9px]">{c.study ? "📹" : ""}{c.class ? "📖" : ""}{c.sparring ? "🥊" : ""}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ══ 네비 ══ */}
        <div className="flex gap-2 flex-wrap pt-2 border-t border-border">
          {[{ t: "skilltree", l: "Skill Tree", i: "🌳" }, { t: "map", l: "Map", i: "🗺️" }, { t: "journal", l: "수련 기록", i: "📝" }, { t: "strategy", l: "전략", i: "🎯" }, { t: "competition", l: "대회", i: "📅" }].map(({ t, l, i }) => (
            <button key={t} type="button" onClick={() => onNavigate(t)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-muted-foreground bg-card border border-border hover:text-foreground/90 hover:border-border transition-colors">
              <span>{i}</span><span>{l}</span>
            </button>
          ))}
        </div>

      </div>
    </div>
  )
}
