"use client"

import { useState, useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { loadUserProfile } from "@/lib/sensei/userProfile"
import { useSenseiData } from "@/lib/sensei/useSenseiData"
import { BELT_CAPS } from "@/lib/sensei/stats"
import type { BjjStats, UserProfile, Archetype } from "@/lib/types/sensei"
import { AthleteComparisonPanel } from "@/components/sensei/character/AthleteComparisonPanel"
import {
  BELTS,
  STAT_BARS as CHARACTER_STAT_BARS,
  cosineSimilarity,
  type RadarDatum,
} from "@/components/sensei/character/statConfig"
import { useAthleteComparison } from "@/components/sensei/character/useAthleteComparison"
import { AttributePanel } from "@/components/sensei/character/AttributePanel"
import { BeltTimeline } from "@/components/sensei/character/BeltTimeline"
import { characterImageSrc } from "@/lib/sensei/characterImage"

interface SenseiDashboardProps { onNavigate: (tab: string) => void }

export function SenseiDashboard({ onNavigate }: SenseiDashboardProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [giMode, setGiMode] = useState<"gi" | "nogi">("gi")
  const [imgError, setImgError] = useState(false)

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

  const athleteComparison = useAthleteComparison(
    archetypes,
    closestArch?.arch ?? null,
  )
  const activeCompare = athleteComparison.activeAthlete

  if (isLoading || !profile) return <div className="flex justify-center py-20"><span className="text-sm text-muted-foreground animate-pulse">스탯 불러오는 중...</span></div>
  if (error || !data) return <div className="text-center py-20"><p className="text-sm text-red-400">스탯을 불러올 수 없습니다</p></div>

  const { stats, tagFrequencies } = data
  const activeStats = stats[giMode]
  const attrs = activeStats.attributes
  const beltCap = BELT_CAPS[stats.belt] ?? 40
  const beltHex = BELTS.find((b) => b.id === stats.belt)?.hex || "#3b82f6"
  const portraitSrc = characterImageSrc(stats.belt)
  const radarData: RadarDatum[] = CHARACTER_STAT_BARS.map((s) => ({
    subject: s.name,
    value: attrs[s.key],
    cap: beltCap,
    ...(activeCompare ? { compare: activeCompare.stats[s.key] } : {}),
    fullMark: 100,
  }))

  const weakest = CHARACTER_STAT_BARS.reduce(
    (min, stat) => attrs[stat.key] < attrs[min.key] ? stat : min,
    CHARACTER_STAT_BARS[0],
  )

  return (
    <div className="text-foreground font-sans">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* ══ 메인 카드: 이미지 | 스탯 ══ */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-[240px_1fr]">

          {/* 좌: 포트레이트 (모바일 숨김) — 벨트 상태에 따라 이미지가 바뀐다 */}
          <div className="hidden md:flex relative bg-muted items-end justify-center overflow-hidden">
            {portraitSrc && !imgError ? (
              <img
                src={portraitSrc}
                alt={`${profile.name} 캐릭터 포트레이트`}
                className="absolute inset-0 w-full h-full object-cover object-center"
                onError={() => setImgError(true)}
              />
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
                { v: `${stats.streaks.current}`, l: "주 연속" },
                { v: `${Math.round(stats.giRatio * 100)}%`, l: "Gi 비율" },
              ].map(({ v, l }) => (
                <div key={l}>
                  <p className="text-sm font-semibold text-foreground">{v}</p>
                  <p className="text-[9px] text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>

            <BeltTimeline belt={stats.belt} stripes={stats.beltStripes} />

            <AttributePanel
              attrs={attrs}
              belt={{ cap: beltCap, hex: beltHex }}
              radarData={radarData}
              activeCompare={activeCompare}
              closestArch={closestArch}
            />

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

        <AthleteComparisonPanel
          attributes={attrs}
          positions={positions}
          controller={athleteComparison}
          onNavigate={onNavigate}
        />

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
          {[{ t: "navmap", l: "Skills", i: "🗺️" }, { t: "training", l: "수련 기록", i: "📝" }, { t: "competitions", l: "대회", i: "📅" }].map(({ t, l, i }) => (
            <button key={t} type="button" onClick={() => onNavigate(t)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-muted-foreground bg-card border border-border hover:text-foreground/90 hover:border-border transition-colors">
              <span>{i}</span><span>{l}</span>
            </button>
          ))}
        </div>

      </div>
    </div>
  )
}
