"use client"

import { useState, useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { RadarChart } from "./RadarChart"
import { XPBar } from "./XPBar"
import { Badge } from "@/components/ui/badge"
import { loadUserProfile } from "@/lib/sensei/userProfile"
import { ARCHETYPES } from "@/lib/sensei/archetypes"
import type { BjjStats, BjjAttributes, UserProfile } from "@/lib/types/sensei"

interface SenseiDashboardProps {
  onNavigate: (tab: string) => void
  onAskCoach: (question?: string) => void
}

// --- Belt Progression Bar ---

const BELT_SEQUENCE = [
  { name: "white", color: "#e4e4e7", stripes: 4 },
  { name: "blue", color: "#3b82f6", stripes: 4 },
  { name: "purple", color: "#a855f7", stripes: 4 },
  { name: "brown", color: "#92400e", stripes: 4 },
  { name: "black", color: "#18181b", stripes: 4 },
]

function beltProgress(belt: string, stripes: number): number {
  const idx = BELT_SEQUENCE.findIndex((b) => b.name === belt.toLowerCase())
  if (idx < 0) return 0
  // Each belt has 5 steps (0-stripe through 4-stripe), total = 5 belts * 5 = 25 steps
  const step = idx * 5 + Math.min(stripes, 4)
  return (step / 24) * 100 // 24 = max (black 4-stripe)
}

function BeltProgressionBar({ belt, stripes }: { belt: string; stripes: number }) {
  const progress = beltProgress(belt, stripes)

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Belt Progression</span>
      </div>
      <div className="relative h-5 rounded-full overflow-hidden flex">
        {BELT_SEQUENCE.map((b, i) => {
          const segStart = (i / 5) * 100
          const isPast = progress >= segStart
          return (
            <div
              key={b.name}
              className="flex-1 relative transition-opacity duration-500"
              style={{
                backgroundColor: b.color,
                opacity: isPast ? 1 : 0.3,
                borderRight: i < 4 ? "1px solid rgba(0,0,0,0.3)" : undefined,
              }}
            >
              {/* Stripe marks within each belt segment */}
              {Array.from({ length: b.stripes }).map((_, si) => {
                const stripePos = ((si + 1) / (b.stripes + 1)) * 100
                return (
                  <div
                    key={si}
                    className="absolute top-1 bottom-1 w-px"
                    style={{
                      left: `${stripePos}%`,
                      backgroundColor:
                        b.name === "white" ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.2)",
                    }}
                  />
                )
              })}
            </div>
          )
        })}
        {/* Glowing current position dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
          style={{ left: `${progress}%` }}
        >
          <div className="w-4 h-4 rounded-full bg-orange-400 border-2 border-white shadow-[0_0_10px_rgba(251,146,60,0.8)]" />
        </div>
      </div>
      {/* Belt labels */}
      <div className="flex mt-1">
        {BELT_SEQUENCE.map((b) => (
          <span key={b.name} className="flex-1 text-[9px] text-zinc-500 text-center capitalize">
            {b.name}
          </span>
        ))}
      </div>
    </div>
  )
}

// --- Vertical Bar Chart ---

const ATTR_CONFIG: { key: keyof BjjAttributes; label: string; color: string }[] = [
  { key: "guard", label: "Guard", color: "#a855f7" },
  { key: "passing", label: "Passing", color: "#22c55e" },
  { key: "control", label: "Control", color: "#f97316" },
  { key: "finishing", label: "Finishing", color: "#ef4444" },
  { key: "takedowns", label: "Takedowns", color: "#06b6d4" },
  { key: "legLocks", label: "Leg Locks", color: "#eab308" },
]

function VerticalBarChart({ attributes, archetype }: { attributes: BjjAttributes; archetype: string | null }) {
  const maxVal = 100

  return (
    <div>
      <div className="flex items-end justify-between gap-2 h-40">
        {ATTR_CONFIG.map(({ key, label, color }) => {
          const val = attributes[key]
          const pct = (val / maxVal) * 100
          return (
            <div key={key} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[11px] font-mono font-bold" style={{ color }}>
                {val}
              </span>
              <div className="w-full flex justify-center">
                <div
                  className="w-6 sm:w-8 rounded-t transition-all duration-700 ease-out"
                  style={{
                    height: `${pct}%`,
                    minHeight: "4px",
                    background: `linear-gradient(to top, ${color}88, ${color})`,
                  }}
                />
              </div>
              <span className="text-[9px] text-zinc-500 text-center leading-tight whitespace-nowrap">
                {label}
              </span>
            </div>
          )
        })}
      </div>
      {archetype && (
        <div className="mt-3 text-center">
          <span className="text-[10px] text-zinc-500">가장 유사한 아키타입: </span>
          <span className="text-xs font-medium text-orange-400">{archetype}</span>
        </div>
      )}
    </div>
  )
}

// --- Belt display helpers ---

const BELT_DISPLAY: Record<string, string> = {
  white: "화이트벨트",
  blue: "블루벨트",
  purple: "퍼플벨트",
  brown: "브라운벨트",
  black: "블랙벨트",
}

const BELT_COLORS: Record<string, string> = {
  white: "#e4e4e7",
  blue: "#3b82f6",
  purple: "#a855f7",
  brown: "#92400e",
  black: "#18181b",
}

function formatTrainingDuration(months: number): string {
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m}개월`
  if (m === 0) return `${y}년`
  return `${y}년 ${m}개월`
}

// --- Avatar SVG (simple dobok + belt) ---

function AvatarIllustration({ belt }: { belt: string }) {
  const beltColor = BELT_COLORS[belt.toLowerCase()] || "#3b82f6"

  return (
    <svg viewBox="0 0 120 160" className="w-full h-full max-w-[100px] mx-auto">
      {/* Head */}
      <circle cx="60" cy="32" r="22" fill="#71717a" />
      {/* Body / Gi top */}
      <path
        d="M30 60 Q30 50 40 48 L60 55 L80 48 Q90 50 90 60 L90 120 L30 120 Z"
        fill="#d4d4d8"
        stroke="#a1a1aa"
        strokeWidth="1"
      />
      {/* Gi lapel */}
      <path d="M48 55 L60 75 L72 55" fill="none" stroke="#a1a1aa" strokeWidth="1.5" />
      {/* Belt */}
      <rect x="30" y="88" width="60" height="8" rx="2" fill={beltColor} />
      {/* Belt knot */}
      <path
        d="M58 96 Q55 104 48 108 M62 96 Q65 104 72 108"
        fill="none"
        stroke={beltColor}
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Pants */}
      <path d="M30 120 L35 155 L55 155 L60 125 L65 155 L85 155 L90 120 Z" fill="#52525b" />
    </svg>
  )
}

// --- Main Dashboard ---

export function SenseiDashboard({ onNavigate, onAskCoach }: SenseiDashboardProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [coachQuestion, setCoachQuestion] = useState("")

  useEffect(() => {
    setProfile(loadUserProfile())
  }, [])

  const { data, isLoading, error } = useQuery<{ stats: BjjStats; tagFrequencies: Record<string, number> }>({
    queryKey: ["sensei-stats"],
    queryFn: async () => {
      const res = await fetch("/api/notion/sensei/stats")
      if (!res.ok) throw new Error("Failed to fetch stats")
      return res.json()
    },
  })

  const stats = data?.stats
  const tagFrequencies = data?.tagFrequencies

  // Coach one-liner
  const { data: coachData } = useQuery<{ reply: string }>({
    queryKey: ["sensei-coach-oneliner", stats?.level],
    queryFn: async () => {
      const res = await fetch("/api/ai/sensei-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "oneliner", stats }),
      })
      if (!res.ok) throw new Error("Coach API failed")
      return res.json()
    },
    enabled: !!stats,
    staleTime: 1000 * 60 * 30, // 30min
  })

  // Top recent focus tags sorted by frequency
  const topTags = useMemo(() => {
    if (!tagFrequencies) return []
    return Object.entries(tagFrequencies)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
  }, [tagFrequencies])

  // Find archetype details for tooltip
  const archetypeInfo = useMemo(() => {
    if (!stats?.combined.closestArchetype) return null
    return ARCHETYPES.find((a) => a.name === stats.combined.closestArchetype) ?? null
  }, [stats])

  if (isLoading || !profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-zinc-500 text-sm">스탯 불러오는 중...</div>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 text-sm mb-2">스탯을 불러올 수 없습니다</p>
        <button
          type="button"
          onClick={() => onNavigate("journal")}
          className="text-xs text-orange-400 hover:underline"
        >
          수련 기록 먼저 등록하기
        </button>
      </div>
    )
  }

  const beltName = BELT_DISPLAY[stats.belt.toLowerCase()] || stats.belt
  const combinedAttrs = stats.combined.attributes

  return (
    <div className="space-y-4">
      {/* ===== Top Section: Avatar + Info + Recent Stats ===== */}
      <div className="grid grid-cols-12 gap-3">
        {/* Left: Avatar */}
        <div className="col-span-3 sm:col-span-2 flex items-center justify-center">
          <div className="w-20 h-28 sm:w-24 sm:h-32">
            <AvatarIllustration belt={stats.belt} />
          </div>
        </div>

        {/* Center: Name + Level + Belt + XP */}
        <div className="col-span-9 sm:col-span-5 flex flex-col justify-center gap-1.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-lg sm:text-xl font-bold text-white">{profile.name}</span>
            <span className="text-sm font-mono text-orange-400">Lv.{stats.level}</span>
            <span className="text-xs text-zinc-400">{stats.playstyle}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full border"
              style={{
                color: BELT_COLORS[stats.belt.toLowerCase()] || "#3b82f6",
                borderColor: BELT_COLORS[stats.belt.toLowerCase()] || "#3b82f6",
              }}
            >
              {beltName} {stats.beltStripes}그랄
            </span>
            <span className="text-xs text-zinc-500">OVR {stats.combined.ovr}</span>
          </div>
          <XPBar current={stats.xpCurrent} total={stats.xpToNext} level={stats.level} />
        </div>

        {/* Right: Quick stats */}
        <div className="col-span-12 sm:col-span-5 bg-zinc-900/50 rounded-lg border border-zinc-800 p-3">
          <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2 font-medium">최근 수련 기록</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-400">수련 기간</span>
              <span className="text-white font-medium">{formatTrainingDuration(stats.trainingMonths)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">기록된 수련</span>
              <span className="text-white font-medium">{stats.totalSessions}회</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">연속 수련</span>
              <span className="text-white font-medium">{stats.streaks.current}주</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">최장 연속</span>
              <span className="text-white font-medium">{stats.streaks.best}주</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Gi 비율</span>
              <span className="text-white font-medium">{Math.round(stats.giRatio * 100)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">역할</span>
              <span className="text-white font-medium">{stats.combined.ovrRole}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Belt Progression ===== */}
      <div className="bg-zinc-900/50 rounded-lg border border-zinc-800 p-3">
        <BeltProgressionBar belt={stats.belt} stripes={stats.beltStripes} />
      </div>

      {/* ===== Radar + Bar Chart ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Radar Chart */}
        <div className="bg-zinc-900/50 rounded-lg border border-zinc-800 p-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">능력치 레이더</h3>
            {archetypeInfo && (
              <span className="text-[10px] text-zinc-500">
                vs. <span className="text-blue-400">{archetypeInfo.name}</span>
              </span>
            )}
          </div>
          <RadarChart
            attributes={combinedAttrs}
            compareAttributes={archetypeInfo?.stats ?? null}
            compareName={archetypeInfo?.name}
          />
        </div>

        {/* Vertical Bar Chart */}
        <div className="bg-zinc-900/50 rounded-lg border border-zinc-800 p-3">
          <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-1">능력치 상세</h3>
          <div className="h-[280px] flex items-end">
            <div className="w-full">
              <VerticalBarChart
                attributes={combinedAttrs}
                archetype={stats.combined.closestArchetype}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ===== Recent Focus + Goal Progress ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Recent Focus Tags */}
        <div className="bg-zinc-900/50 rounded-lg border border-zinc-800 p-3">
          <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">최근 포커스 태그</h3>
          {stats.recentFocus.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {stats.recentFocus.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="text-[11px] border-zinc-700 text-zinc-300 bg-zinc-800/50"
                >
                  {tag}
                  {tagFrequencies?.[tag] && (
                    <span className="ml-1 text-zinc-500">{tagFrequencies[tag]}</span>
                  )}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-600">수련 기록이 쌓이면 태그가 나타납니다</p>
          )}
          {topTags.length > 0 && (
            <div className="mt-3 pt-2 border-t border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">가장 많이 기록된 태그</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {topTags.map(([tag, count]) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[11px] border-orange-800/40 text-orange-300 bg-orange-950/20"
                  >
                    {tag}
                    <span className="ml-1 text-orange-500/60">{count}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Goal Progress */}
        <div className="bg-zinc-900/50 rounded-lg border border-zinc-800 p-3">
          <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">목표 프로그레스</h3>
          {profile.nextGoalTitle ? (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white">{profile.nextGoalTitle}</span>
                  <span className="text-xs text-zinc-400">{profile.nextGoalProgress ?? 0}%</span>
                </div>
                {profile.nextGoalText && (
                  <p className="text-xs text-zinc-500 mb-2">{profile.nextGoalText}</p>
                )}
                <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${profile.nextGoalProgress ?? 0}%`,
                      background: "linear-gradient(90deg, #a855f7, #3b82f6)",
                    }}
                  />
                </div>
              </div>
              {/* Quick stats for goal context */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800">
                <div className="text-center">
                  <div className="text-lg font-bold text-white font-mono">{stats.totalSessions}</div>
                  <div className="text-[10px] text-zinc-500">총 수련</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-orange-400 font-mono">{stats.streaks.current}</div>
                  <div className="text-[10px] text-zinc-500">연속 주</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-400 font-mono">{stats.combined.ovr}</div>
                  <div className="text-[10px] text-zinc-500">OVR</div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-600">프로필에서 목표를 설정해보세요</p>
          )}
        </div>
      </div>

      {/* ===== Coach Widget ===== */}
      <div className="bg-zinc-900/50 rounded-lg border border-zinc-800 p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm">🤖</span>
          <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">AI Coach</h3>
        </div>
        {coachData?.reply ? (
          <p className="text-sm text-zinc-200 mb-3 leading-relaxed">{coachData.reply}</p>
        ) : (
          <p className="text-sm text-zinc-600 mb-3 animate-pulse">코치 추천 로딩 중...</p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={coachQuestion}
            onChange={(e) => setCoachQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && coachQuestion.trim()) {
                onAskCoach(coachQuestion.trim())
                setCoachQuestion("")
              }
            }}
            placeholder="코치에게 질문하기..."
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20"
          />
          <button
            type="button"
            onClick={() => {
              if (coachQuestion.trim()) {
                onAskCoach(coachQuestion.trim())
                setCoachQuestion("")
              } else {
                onAskCoach()
              }
            }}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
          >
            질문
          </button>
        </div>
      </div>

      {/* ===== Quick Nav ===== */}
      <div className="flex gap-2 flex-wrap">
        {[
          { tab: "journal", label: "수련 기록", icon: "📝" },
          { tab: "stats", label: "상세 스탯", icon: "📊" },
          { tab: "heroes", label: "BJJ Heroes", icon: "🏆" },
          { tab: "competition", label: "대회", icon: "📅" },
        ].map(({ tab, label, icon }) => (
          <button
            key={tab}
            type="button"
            onClick={() => onNavigate(tab)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
          >
            <span>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
