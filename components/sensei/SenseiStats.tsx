"use client"

import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { RadarChart } from "./RadarChart"
import { StatBar } from "./StatBar"
import { POSITIONS, TRANSITIONS, getPositionById, getTransitionsFrom } from "@/lib/sensei/skillConnections"
import { LESSON_VIDEOS } from "@/lib/sensei/lessonVideos"
import type { Position, LessonVideo, BjjStats, BjjAttributes, BjjStatsSet } from "@/lib/types/sensei"

// ─── Design Tokens ───────────────────────────────────────────

const CARD = {
  background: "var(--muted)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
} as const

const TEXT = {
  primary: "var(--foreground)",
  secondary: "var(--muted-foreground)",
  tertiary: "var(--muted-foreground)",
} as const

const BORDER_DEFAULT = "var(--border)"

const LAYER_COLORS: Record<string, string> = {
  standing: "#06b6d4",
  guard: "#a855f7",
  passing: "#22c55e",
  control: "#f97316",
  submission: "#ef4444",
  leglock: "#eab308",
}

const TRANSITION_TYPE_COLORS: Record<string, string> = {
  sweep: "#22c55e",
  pass: "#f97316",
  escape: "#3b82f6",
  submission: "#ef4444",
  transition: "var(--muted-foreground)",
  takedown: "#06b6d4",
  guard_pull: "#a855f7",
  recovery: "#3b82f6",
}

const CATEGORY_COLORS: Record<string, string> = {
  Guard: "#a855f7",
  Passing: "#22c55e",
  Control: "#f97316",
  Finishing: "#ef4444",
  Takedowns: "#06b6d4",
  LegLocks: "#eab308",
}

const GI_COLOR = "#3b82f6"
const NOGI_COLOR = "#ef4444"

const ATTR_KEYS: (keyof BjjAttributes)[] = [
  "guard", "passing", "control", "finishing", "takedowns", "legLocks",
]

const ATTR_LABELS: Record<keyof BjjAttributes, string> = {
  guard: "Guard",
  passing: "Passing",
  control: "Control",
  finishing: "Finishing",
  takedowns: "Takedowns",
  legLocks: "Leg Locks",
}

const ATTR_TO_CATEGORY: Record<keyof BjjAttributes, string> = {
  guard: "Guard",
  passing: "Passing",
  control: "Control",
  finishing: "Finishing",
  takedowns: "Takedowns",
  legLocks: "LegLocks",
}

const DRILL_SUGGESTIONS: Record<keyof BjjAttributes, string> = {
  guard: "Half Guard → Sweep 드릴 추천",
  passing: "KCP → SideCtrl 패스 드릴 추천",
  control: "SideCtrl → Mount 드릴 추천",
  finishing: "Mount → Sub 피니싱 드릴 추천",
  takedowns: "Single Leg 드릴 추천",
  legLocks: "SLX → Ashi 엔트리 드릴 추천",
}

// ─── Tag → Position ID mapping ──────────────────────────────

const TAG_TO_POSITION: Record<string, string> = {
  HG: "hg", DHG: "dhg", DLR: "dlr", RDLR: "rdlr",
  SLX: "slx", XG: "xg", Butterfly: "butterfly", Closed: "closed",
  Open: "open", Spider: "spider", Lasso: "lasso", "Sit-up": "situp",
  Lapel: "lapel", Worm: "worm", Squid: "squid", Rubber: "rubber",
  KShield: "kshield", Waiter: "waiter", KGuard: "kguard", HalfButt: "halfbutt",
  Bolo: "bolo",
  KCP: "kcp", Torreando: "torreando", Smash: "smash", HalfPass: "halfpass",
  LongStep: "longstep", HQ: "hq",
  Mount: "mount_top", "S-Mount": "mount_top", Side: "side_top", NS: "ns_top",
  KoB: "kob_top", Back: "back_top", Turtle: "turtle_top",
  RNC: "rnc", Triangle: "triangle", Armbar: "armb", Kimura: "kimura",
  Guillotine: "guillotine", Darce: "darce", Americana: "americana",
  CrossChoke: "crosschoke", BowArrow: "bowarrow", Ezekiel: "ezekiel",
  IHH: "ihh", OHH: "ohh", SFL: "sfl", KneeBar: "kneebar", ToeHold: "toehold",
  Ashi: "ashi", Saddle: "saddle", "50/50": "5050",
  Standing: "standing",
}

// Build reverse map: positionId → aggregated frequency from tags
function buildPositionFrequency(tagFrequencies: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [tag, count] of Object.entries(tagFrequencies)) {
    const posId = TAG_TO_POSITION[tag]
    if (posId) {
      result[posId] = (result[posId] || 0) + count
    }
  }
  return result
}

// ─── Skill Tree View Types ───────────────────────────────────

type SkillTreeView = "map" | "guard" | "journey" | "lesson"

const SKILL_TREE_VIEWS: { id: SkillTreeView; label: string }[] = [
  { id: "map", label: "전체 맵" },
  { id: "guard", label: "가드 상세" },
  { id: "journey", label: "내 경로" },
  { id: "lesson", label: "교본 연결" },
]

// ─── Lesson category grouping ────────────────────────────────

const LESSON_CATEGORY_LABELS: Record<string, string> = {
  drill: "필수 드릴",
  side_escape: "사이드 탈출",
  side_control: "사이드 컨트롤",
  side_submission: "사이드 서브미션",
  side_transition: "사이드 전환",
  closed_guard: "클로즈 가드",
  guard_pass: "가드 패스",
  half_pass: "하프가드 패스",
  half_guard: "하프가드 (바텀)",
  connection: "연결 동작",
  kob_control: "니온벨리 컨트롤",
  kob_submission: "니온벨리 서브미션",
  kob_escape: "니온벨리 탈출",
  butterfly: "버터플라이 가드",
  slx: "SLX",
  slx_pass: "SLX 패스",
  guard_recovery: "가드 리커버리",
  sitting_guard: "시팅가드",
  mount_control: "마운트 컨트롤",
  mount_submission: "마운트 서브미션",
  mount_escape: "마운트 탈출",
  back_submission: "백 서브미션",
  back_escape: "백 탈출",
  back_control: "백 컨트롤",
  turtle_attack: "터틀 공격",
  turtle_escape: "터틀 탈출",
  standing: "스탠딩",
}

// ─── Helper: hex color to rgba ───────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

function colorWithAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

// ─── Position Node Component ─────────────────────────────────

function PositionNode({
  position,
  frequency,
  isSelected,
  onClick,
  dimLevel,
}: {
  position: Position
  frequency: number
  isSelected?: boolean
  onClick?: () => void
  dimLevel?: "bright" | "normal" | "dim" | "very-dim"
}) {
  const layerColor = LAYER_COLORS[position.layer] || "#a855f7"
  const hasLesson = position.lessonNumbers && position.lessonNumbers.length > 0

  const dim = dimLevel || (frequency > 0 ? "normal" : "dim")
  const opacity = dim === "bright" ? 1 : dim === "normal" ? 0.85 : dim === "dim" ? 0.5 : 0.3
  const textColor = dim === "bright" || dim === "normal" ? TEXT.primary : TEXT.tertiary

  const perspectiveTint =
    position.perspective === "top"
      ? "rgba(34,197,94,0.06)"
      : position.perspective === "bottom"
        ? "rgba(239,68,68,0.06)"
        : "transparent"

  return (
    <div
      onClick={onClick}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: "8px 12px",
        borderRadius: 8,
        border: hasLesson
          ? `1px solid ${colorWithAlpha(layerColor, isSelected ? 0.6 : 0.25)}`
          : `1px dashed ${colorWithAlpha(layerColor, 0.15)}`,
        background: isSelected
          ? colorWithAlpha(layerColor, 0.12)
          : perspectiveTint !== "transparent"
            ? perspectiveTint
            : colorWithAlpha(layerColor, 0.04),
        opacity,
        cursor: onClick ? "pointer" : "default",
        transition: "all 150ms ease",
        minWidth: 80,
        textAlign: "center",
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 500, color: textColor }}>
        {position.nameKr}
      </span>
      {hasLesson && (
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "center" }}>
          {position.lessonNumbers!.slice(0, 4).map((n) => (
            <span
              key={n}
              style={{
                fontSize: 10,
                color: layerColor,
                background: colorWithAlpha(layerColor, 0.1),
                borderRadius: 4,
                padding: "1px 4px",
              }}
            >
              #{n}
            </span>
          ))}
          {position.lessonNumbers!.length > 4 && (
            <span style={{ fontSize: 10, color: TEXT.tertiary }}>
              +{position.lessonNumbers!.length - 4}
            </span>
          )}
        </div>
      )}
      {!hasLesson && (
        <span style={{ fontSize: 10, color: TEXT.tertiary }}>심화</span>
      )}
      {frequency > 0 && (
        <span style={{ fontSize: 10, color: layerColor }}>
          {frequency}회
        </span>
      )}
    </div>
  )
}

// ─── Transition Badge ────────────────────────────────────────

function TransitionBadge({ type }: { type: string }) {
  const color = TRANSITION_TYPE_COLORS[type] || TEXT.tertiary
  const label: Record<string, string> = {
    sweep: "스윕",
    pass: "패스",
    escape: "탈출",
    submission: "서브",
    transition: "전환",
    takedown: "테이크다운",
    guard_pull: "가드풀",
    recovery: "리커버리",
  }
  return (
    <span
      style={{
        fontSize: 10,
        color,
        background: colorWithAlpha(color.startsWith("rgba") ? "#ffffff" : color, 0.1),
        borderRadius: 4,
        padding: "1px 6px",
        fontWeight: 500,
      }}
    >
      {label[type] || type}
    </span>
  )
}

// ─── View 1: Position Map — SVG Graph ────────────────────────

type LayerFilter = "all" | "guard" | "passing" | "control" | "leglock"
const LAYER_FILTERS: { id: LayerFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "guard", label: "가드" },
  { id: "passing", label: "패스" },
  { id: "control", label: "컨트롤" },
  { id: "leglock", label: "레그락" },
]

// Manual x,y layout for each position
const NODE_XY: Record<string, { x: number; y: number }> = {
  // Standing (row 0)
  standing: { x: 480, y: 40 },
  // Guard — Closed (row 1)
  closed: { x: 100, y: 150 },
  // Guard — Half (row 2)
  hg: { x: 250, y: 150 },
  dhg: { x: 180, y: 250 },
  kshield: { x: 300, y: 250 },
  halfbutt: { x: 240, y: 330 },
  waiter: { x: 120, y: 330 },
  // Guard — Sitting
  situp: { x: 420, y: 250 },
  // Guard — Open (row 2-3)
  open: { x: 580, y: 150 },
  dlr: { x: 530, y: 250 },
  rdlr: { x: 650, y: 250 },
  bolo: { x: 590, y: 330 },
  spider: { x: 760, y: 250 },
  lasso: { x: 830, y: 330 },
  lapel: { x: 870, y: 250 },
  worm: { x: 920, y: 330 },
  squid: { x: 980, y: 330 },
  rubber: { x: 700, y: 330 },
  kguard: { x: 470, y: 330 },
  // Guard — Butterfly/SLX (row 3-4)
  butterfly: { x: 340, y: 400 },
  slx: { x: 460, y: 400 },
  xg: { x: 400, y: 470 },
  // Passing (row 5)
  hq: { x: 480, y: 540 },
  kcp: { x: 320, y: 600 },
  torreando: { x: 440, y: 600 },
  overunder: { x: 560, y: 600 },
  legdrag: { x: 680, y: 600 },
  halfpass: { x: 200, y: 600 },
  smash: { x: 560, y: 660 },
  longstep: { x: 680, y: 660 },
  // Control Top (row 6)
  side_top: { x: 200, y: 740 },
  kob_top: { x: 350, y: 740 },
  mount_top: { x: 500, y: 740 },
  ns_top: { x: 650, y: 740 },
  back_top: { x: 800, y: 740 },
  turtle_top: { x: 900, y: 740 },
  // Control Bottom (row 7)
  side_bottom: { x: 200, y: 830 },
  kob_bottom: { x: 350, y: 830 },
  mount_bottom: { x: 500, y: 830 },
  back_bottom: { x: 800, y: 830 },
  turtle_bottom: { x: 900, y: 830 },
  // Leg Locks (row 8)
  ashi: { x: 300, y: 920 },
  slashi: { x: 420, y: 920 },
  saddle: { x: 540, y: 920 },
  outashi: { x: 660, y: 920 },
  "5050": { x: 780, y: 920 },
  // Submissions (row 9)
  rnc: { x: 100, y: 1010 },
  triangle: { x: 200, y: 1010 },
  armb: { x: 300, y: 1010 },
  kimura: { x: 400, y: 1010 },
  guillotine: { x: 500, y: 1010 },
  darce: { x: 600, y: 1010 },
  crosschoke: { x: 700, y: 1010 },
  bowarrow: { x: 780, y: 1010 },
  ezekiel: { x: 860, y: 1010 },
  americana: { x: 940, y: 1010 },
  ihh: { x: 300, y: 1000 },
  ohh: { x: 420, y: 1000 },
  sfl: { x: 540, y: 1000 },
  kneebar: { x: 660, y: 1000 },
  toehold: { x: 780, y: 1000 },
}

const NW = 80 // node width
const NH = 34 // node height

function isPositionInFilter(pos: Position, filter: LayerFilter): boolean {
  if (filter === "all") return true
  if (filter === "guard") return pos.layer === "guard" || pos.layer === "standing"
  if (filter === "passing") return pos.layer === "passing" || pos.layer === "guard" || pos.layer === "control"
  if (filter === "control") return pos.layer === "control" || pos.layer === "submission"
  if (filter === "leglock") return pos.layer === "leglock" || pos.layer === "submission" || pos.layer === "guard"
  return true
}

function PositionMapView({ positionFreq }: { positionFreq: Record<string, number> }) {
  const [filter, setFilter] = useState<LayerFilter>("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const visiblePositions = useMemo(
    () => POSITIONS.filter((p) => NODE_XY[p.id] && isPositionInFilter(p, filter)),
    [filter],
  )
  const visibleIds = useMemo(() => new Set(visiblePositions.map((p) => p.id)), [visiblePositions])

  const visibleTransitions = useMemo(
    () => TRANSITIONS.filter((t) => visibleIds.has(t.from) && visibleIds.has(t.to) && NODE_XY[t.from] && NODE_XY[t.to]),
    [visibleIds],
  )

  // Connected set for highlight
  const connectedIds = useMemo(() => {
    if (!selectedId) return null
    const ids = new Set<string>([selectedId])
    for (const t of TRANSITIONS) {
      if (t.from === selectedId) ids.add(t.to)
      if (t.to === selectedId) ids.add(t.from)
    }
    return ids
  }, [selectedId])

  const connectedEdges = useMemo(() => {
    if (!selectedId) return null
    return new Set(
      TRANSITIONS.filter((t) => t.from === selectedId || t.to === selectedId).map((t) => `${t.from}-${t.to}`)
    )
  }, [selectedId])

  const selectedTransitions = useMemo(
    () => (selectedId ? getTransitionsFrom(selectedId) : []),
    [selectedId],
  )

  // SVG bounds
  const svgW = 1060
  const svgH = filter === "all" ? 1060 : filter === "guard" ? 520 : filter === "control" ? 400 : 600

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Layer Filter */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {LAYER_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => { setFilter(f.id); setSelectedId(null) }}
            style={{
              padding: "4px 12px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
              border: filter === f.id ? "1px solid var(--muted-foreground)" : `1px solid ${BORDER_DEFAULT}`,
              background: filter === f.id ? "var(--border)" : CARD.background,
              color: filter === f.id ? TEXT.primary : TEXT.secondary,
              cursor: "pointer",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* SVG Graph */}
      <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${BORDER_DEFAULT}` }}>
        <svg width={svgW} height={svgH} style={{ display: "block", background: "var(--border)" }}>
          <defs>
            <marker id="arrow" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
              <path d="M0,0 L6,2 L0,4" fill="var(--muted-foreground)" />
            </marker>
          </defs>

          {/* Edges */}
          {visibleTransitions.map((t, i) => {
            const from = NODE_XY[t.from]
            const to = NODE_XY[t.to]
            if (!from || !to) return null
            const edgeKey = `${t.from}-${t.to}`
            const isHighlighted = connectedEdges?.has(edgeKey)
            const isDimmed = connectedEdges && !isHighlighted
            const edgeColor = TRANSITION_TYPE_COLORS[t.type] || "var(--muted-foreground)"

            return (
              <line
                key={`e-${String(i)}`}
                x1={from.x} y1={from.y}
                x2={to.x} y2={to.y}
                stroke={isDimmed ? "var(--border)" : isHighlighted ? edgeColor : "var(--border)"}
                strokeWidth={isHighlighted ? 2 : 1}
                strokeOpacity={isDimmed ? 0.3 : isHighlighted ? 0.8 : 0.4}
                markerEnd={isHighlighted ? undefined : "url(#arrow)"}
              />
            )
          })}

          {/* Nodes */}
          {visiblePositions.map((pos) => {
            const xy = NODE_XY[pos.id]
            if (!xy) return null
            const layerColor = LAYER_COLORS[pos.layer] || "#a855f7"
            const hasLesson = (pos.lessonNumbers?.length ?? 0) > 0
            const freq = positionFreq[pos.id] || 0
            const isSelected = selectedId === pos.id
            const isConnected = connectedIds?.has(pos.id)
            const isDimmed = connectedIds && !isConnected
            const opacity = isDimmed ? 0.2 : isSelected ? 1 : isConnected ? 0.9 : freq > 0 ? 0.8 : 0.5

            return (
              <g
                key={pos.id}
                onClick={() => setSelectedId(selectedId === pos.id ? null : pos.id)}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={xy.x - NW / 2}
                  y={xy.y - NH / 2}
                  width={NW}
                  height={NH}
                  rx={6}
                  fill={isSelected ? colorWithAlpha(layerColor, 0.15) : colorWithAlpha(layerColor, 0.05)}
                  stroke={layerColor}
                  strokeWidth={isSelected ? 2 : 1}
                  strokeDasharray={hasLesson ? undefined : "4 2"}
                  opacity={opacity}
                />
                <text
                  x={xy.x}
                  y={xy.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isDimmed ? TEXT.tertiary : TEXT.primary}
                  fontSize={11}
                  fontWeight={500}
                  opacity={opacity}
                >
                  {pos.nameKr}
                </text>
                {freq > 0 && !isDimmed && (
                  <text
                    x={xy.x + NW / 2 - 4}
                    y={xy.y - NH / 2 + 8}
                    textAnchor="end"
                    fill={layerColor}
                    fontSize={9}
                    opacity={0.7}
                  >
                    {freq}
                  </text>
                )}
                {hasLesson && !isDimmed && (
                  <text
                    x={xy.x - NW / 2 + 4}
                    y={xy.y - NH / 2 + 8}
                    textAnchor="start"
                    fill={layerColor}
                    fontSize={8}
                    opacity={0.5}
                  >
                    #{pos.lessonNumbers![0]}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Info Panel — selected node transitions */}
      {selectedId && (
        <div
          style={{
            background: "var(--border)",
            border: `1px solid ${BORDER_DEFAULT}`,
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT.primary, marginBottom: 8 }}>
            {getPositionById(selectedId)?.nameKr} — 전환 목록
          </div>
          {selectedTransitions.length === 0 ? (
            <div style={{ fontSize: 12, color: TEXT.tertiary }}>등록된 전환이 없습니다</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {selectedTransitions.map((t, i) => {
                const toPos = getPositionById(t.to)
                return (
                  <div
                    key={String(i)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: "var(--border)",
                      border: `1px solid ${BORDER_DEFAULT}`,
                    }}
                  >
                    <TransitionBadge type={t.type} />
                    <span style={{ fontSize: 12, color: TEXT.primary, fontWeight: 500 }}>
                      {t.action}
                    </span>
                    <span style={{ fontSize: 11, color: TEXT.tertiary }}>
                      → {toPos?.nameKr || t.to}
                    </span>
                    {t.condition && (
                      <span style={{ fontSize: 11, color: TEXT.secondary, fontStyle: "italic" }}>
                        ({t.condition})
                      </span>
                    )}
                    {t.lessonNumber && (
                      <span
                        style={{
                          fontSize: 10,
                          color: LAYER_COLORS[getPositionById(selectedId)?.layer || "guard"],
                          background: colorWithAlpha(LAYER_COLORS[getPositionById(selectedId)?.layer || "guard"], 0.1),
                          borderRadius: 4,
                          padding: "1px 4px",
                        }}
                      >
                        #{t.lessonNumber}
                      </span>
                    )}
                    {t.videoUrl && (
                      <a href={t.videoUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, textDecoration: "none" }} title="영상 보기">
                        📺
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, paddingTop: 4 }}>
        {Object.entries(LAYER_COLORS).map(([layer, color]) => (
          <div key={layer} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: colorWithAlpha(color, 0.3), border: `1px solid ${color}` }} />
            <span style={{ fontSize: 11, color: TEXT.secondary }}>
              {{ standing: "스탠딩", guard: "가드", passing: "패싱", control: "컨트롤", submission: "서브미션", leglock: "레그락" }[layer]}
            </span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
          <div style={{ width: 16, height: 0, border: "1px solid var(--muted-foreground)" }} />
          <span style={{ fontSize: 11, color: TEXT.secondary }}>교본</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 16, height: 0, border: "1px dashed var(--muted-foreground)" }} />
          <span style={{ fontSize: 11, color: TEXT.secondary }}>심화</span>
        </div>
      </div>
    </div>
  )
}

function LayerSection({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: colorWithAlpha(color, 0.03),
        border: `1px solid ${colorWithAlpha(color, 0.08)}`,
        borderRadius: 8,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 10 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>
    </div>
  )
}

// ─── View 2: Guard Detail ────────────────────────────────────

function GuardDetailView({ positionFreq }: { positionFreq: Record<string, number> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const guards = POSITIONS.filter((p) => p.layer === "guard")

  const families: Record<string, Position[]> = {}
  for (const g of guards) {
    const fam = g.family || "other"
    if (!families[fam]) families[fam] = []
    families[fam].push(g)
  }

  const familyLabels: Record<string, string> = {
    closed: "클로즈 계열",
    half: "하프 계열",
    open: "오픈 계열",
    sitting: "시팅 계열",
    butterfly: "버터플라이/SLX 계열",
  }

  const selectedTransitions = selectedId ? getTransitionsFrom(selectedId) : []
  const selectedPosition = selectedId ? getPositionById(selectedId) : null

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {Object.entries(families).map(([fam, positions]) => {
        // Show parent-child: roots first, then children indented
        const roots = positions.filter((p) => !p.parent || !positions.find((pp) => pp.id === p.parent))
        const children = positions.filter((p) => p.parent && positions.find((pp) => pp.id === p.parent))

        return (
          <div key={fam}>
            <div style={{ fontSize: 12, fontWeight: 600, color: LAYER_COLORS.guard, marginBottom: 8 }}>
              {familyLabels[fam] || fam}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {roots.map((root) => (
                <div key={root.id}>
                  <PositionNode
                    position={root}
                    frequency={positionFreq[root.id] || 0}
                    isSelected={selectedId === root.id}
                    onClick={() => setSelectedId(selectedId === root.id ? null : root.id)}
                  />
                  {/* Children */}
                  {children.filter((c) => c.parent === root.id).length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginLeft: 24, marginTop: 6 }}>
                      {children
                        .filter((c) => c.parent === root.id)
                        .map((child) => (
                          <PositionNode
                            key={child.id}
                            position={child}
                            frequency={positionFreq[child.id] || 0}
                            isSelected={selectedId === child.id}
                            onClick={() => setSelectedId(selectedId === child.id ? null : child.id)}
                          />
                        ))}
                    </div>
                  )}
                </div>
              ))}
              {/* Children that don't match their parent in this family (e.g. nested deeper) */}
              {children.filter((c) => !roots.find((r) => r.id === c.parent)).map((orphan) => (
                <div key={orphan.id} style={{ marginLeft: 24 }}>
                  <PositionNode
                    position={orphan}
                    frequency={positionFreq[orphan.id] || 0}
                    isSelected={selectedId === orphan.id}
                    onClick={() => setSelectedId(selectedId === orphan.id ? null : orphan.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Selected position transitions */}
      {selectedPosition && (
        <div
          style={{
            background: colorWithAlpha(LAYER_COLORS.guard, 0.04),
            border: `1px solid ${colorWithAlpha(LAYER_COLORS.guard, 0.12)}`,
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT.primary, marginBottom: 10 }}>
            {selectedPosition.nameKr}에서 가능한 전환
          </div>
          {selectedTransitions.length === 0 ? (
            <div style={{ fontSize: 12, color: TEXT.tertiary }}>등록된 전환이 없습니다</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {selectedTransitions.map((t, i) => {
                const toPos = getPositionById(t.to)
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: "var(--border)",
                      border: `1px solid ${BORDER_DEFAULT}`,
                    }}
                  >
                    <TransitionBadge type={t.type} />
                    <span style={{ fontSize: 12, color: TEXT.primary, fontWeight: 500 }}>
                      {t.action}
                    </span>
                    <span style={{ fontSize: 11, color: TEXT.tertiary }}>
                      → {toPos?.nameKr || t.to}
                    </span>
                    {t.condition && (
                      <span style={{ fontSize: 11, color: TEXT.secondary, fontStyle: "italic" }}>
                        ({t.condition})
                      </span>
                    )}
                    {t.lessonNumber && (
                      <span
                        style={{
                          fontSize: 10,
                          color: LAYER_COLORS.guard,
                          background: colorWithAlpha(LAYER_COLORS.guard, 0.1),
                          borderRadius: 4,
                          padding: "1px 4px",
                        }}
                      >
                        #{t.lessonNumber}
                      </span>
                    )}
                    {t.videoUrl && (
                      <a
                        href={t.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12, textDecoration: "none" }}
                        title="영상 보기"
                      >
                        📺
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── View 3: My Journey ──────────────────────────────────────

function MyJourneyView({ positionFreq }: { positionFreq: Record<string, number> }) {
  // Sort positions by frequency descending
  const maxFreq = Math.max(1, ...Object.values(positionFreq))

  // Determine dim level based on relative frequency
  function getDimLevel(posId: string): "bright" | "normal" | "dim" | "very-dim" {
    const freq = positionFreq[posId] || 0
    if (freq === 0) return "very-dim"
    const ratio = freq / maxFreq
    if (ratio >= 0.5) return "bright"
    if (ratio >= 0.15) return "normal"
    return "dim"
  }

  // Group positions by layer for display
  const layers: { key: string; label: string; positions: Position[] }[] = [
    { key: "standing", label: "스탠딩", positions: POSITIONS.filter((p) => p.layer === "standing") },
    { key: "guard", label: "가드", positions: POSITIONS.filter((p) => p.layer === "guard") },
    { key: "passing", label: "패싱", positions: POSITIONS.filter((p) => p.layer === "passing") },
    { key: "control", label: "컨트롤", positions: POSITIONS.filter((p) => p.layer === "control") },
    { key: "leglock", label: "레그락", positions: POSITIONS.filter((p) => p.layer === "leglock") },
    { key: "submission", label: "서브미션", positions: POSITIONS.filter((p) => p.layer === "submission") },
  ]

  // Most trained positions
  const topPositions = POSITIONS
    .map((p) => ({ ...p, freq: positionFreq[p.id] || 0 }))
    .filter((p) => p.freq > 0)
    .sort((a, b) => b.freq - a.freq)
    .slice(0, 10)

  // Most traveled paths: transitions where both from and to have high frequency
  const traveledPaths = TRANSITIONS
    .filter((t) => (positionFreq[t.from] || 0) > 0 && (positionFreq[t.to] || 0) > 0)
    .map((t) => ({ ...t, score: (positionFreq[t.from] || 0) + (positionFreq[t.to] || 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top trained */}
      {topPositions.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT.primary, marginBottom: 10 }}>
            가장 많이 훈련한 포지션
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {topPositions.map((p) => (
              <PositionNode
                key={p.id}
                position={p}
                frequency={p.freq}
                dimLevel="bright"
              />
            ))}
          </div>
        </div>
      )}

      {/* Most traveled paths */}
      {traveledPaths.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT.primary, marginBottom: 10 }}>
            자주 사용한 경로
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {traveledPaths.map((t, i) => {
              const fromPos = getPositionById(t.from)
              const toPos = getPositionById(t.to)
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: 6,
                    background: "var(--border)",
                    border: `1px solid ${BORDER_DEFAULT}`,
                  }}
                >
                  <span style={{ fontSize: 12, color: TEXT.primary, fontWeight: 500 }}>
                    {fromPos?.nameKr || t.from}
                  </span>
                  <span style={{ fontSize: 11, color: TEXT.tertiary }}>→</span>
                  <span style={{ fontSize: 12, color: TEXT.primary, fontWeight: 500 }}>
                    {toPos?.nameKr || t.to}
                  </span>
                  <TransitionBadge type={t.type} />
                  <span style={{ fontSize: 11, color: TEXT.secondary }}>
                    {t.action}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Full map with dim levels */}
      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT.primary, marginBottom: 4 }}>
        전체 포지션 훈련 현황
      </div>
      {layers.map(({ key, label, positions }) => (
        <LayerSection key={key} label={label} color={LAYER_COLORS[key]}>
          {positions.map((p) => (
            <PositionNode
              key={p.id}
              position={p}
              frequency={positionFreq[p.id] || 0}
              dimLevel={getDimLevel(p.id)}
            />
          ))}
        </LayerSection>
      ))}
    </div>
  )
}

// ─── View 4: Lesson Map ──────────────────────────────────────

function LessonMapView({ positionFreq }: { positionFreq: Record<string, number> }) {
  // Group lessons by category
  const lessonsByCategory: Record<string, { key: string; video: LessonVideo }[]> = {}
  for (const [key, video] of Object.entries(LESSON_VIDEOS)) {
    const cat = video.category
    if (!lessonsByCategory[cat]) lessonsByCategory[cat] = []
    lessonsByCategory[cat].push({ key, video })
  }

  // Check if a lesson has been "practiced" — if any position with that lesson number has frequency > 0
  function isLessonPracticed(key: string): boolean {
    // Extract lesson number
    const match = key.match(/lesson_(\d+)/)
    if (!match) {
      // drill entries are always considered accessible
      return true
    }
    const num = parseInt(match[1], 10)
    // Find positions that include this lesson number
    for (const pos of POSITIONS) {
      if (pos.lessonNumbers?.includes(num)) {
        if ((positionFreq[pos.id] || 0) > 0) return true
      }
    }
    return false
  }

  // Sort categories in a sensible order
  const categoryOrder = [
    "drill", "side_escape", "side_control", "side_submission", "side_transition",
    "closed_guard", "guard_pass", "half_pass", "half_guard",
    "connection", "kob_control", "kob_submission", "kob_escape",
    "butterfly", "slx", "slx_pass", "guard_recovery", "sitting_guard",
    "mount_control", "mount_submission", "mount_escape",
    "back_submission", "back_escape", "back_control",
    "turtle_attack", "turtle_escape", "standing",
  ]

  const sortedCategories = categoryOrder.filter((c) => lessonsByCategory[c])

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {sortedCategories.map((cat) => {
        const lessons = lessonsByCategory[cat]
        const label = LESSON_CATEGORY_LABELS[cat] || cat
        return (
          <div key={cat}>
            <div style={{ fontSize: 12, fontWeight: 600, color: TEXT.primary, marginBottom: 8 }}>
              {label}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {lessons.map(({ key, video }) => {
                const practiced = isLessonPracticed(key)
                const lessonNum = key.match(/lesson_(\d+)/)?.[1]
                return (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      borderRadius: 6,
                      background: practiced ? "var(--border)" : "var(--border)",
                      border: `1px solid ${practiced ? BORDER_DEFAULT : "var(--border)"}`,
                      opacity: practiced ? 1 : 0.5,
                    }}
                  >
                    {lessonNum && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: practiced ? "#a855f7" : TEXT.tertiary,
                          minWidth: 28,
                        }}
                      >
                        #{lessonNum}
                      </span>
                    )}
                    {!lessonNum && (
                      <span style={{ fontSize: 11, color: TEXT.tertiary, minWidth: 28 }}>
                        {key.startsWith("drill") ? "D" : ""}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 12,
                        color: practiced ? TEXT.primary : TEXT.secondary,
                        fontWeight: practiced ? 500 : 400,
                        flex: 1,
                      }}
                    >
                      {video.titleKr}
                    </span>
                    {!practiced && (
                      <span
                        style={{
                          fontSize: 10,
                          color: TEXT.tertiary,
                          background: "var(--border)",
                          borderRadius: 4,
                          padding: "1px 6px",
                        }}
                      >
                        아직 안 배웠어요
                      </span>
                    )}
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, textDecoration: "none" }}
                      title="영상 보기"
                    >
                      📺
                    </a>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────

export function SenseiStats() {
  const [mode, setMode] = useState<"gi" | "nogi">("gi")
  const [treeView, setTreeView] = useState<SkillTreeView>("map")

  const { data, isLoading, error } = useQuery<{
    stats: BjjStats
    tagFrequencies: Record<string, number>
  }>({
    queryKey: ["sensei-stats"],
    queryFn: async () => {
      const res = await fetch("/api/notion/sensei/stats")
      if (!res.ok) throw new Error("스탯 로딩 실패")
      return res.json()
    },
  })

  const statsSet: BjjStatsSet | null = data ? data.stats[mode] : null
  const tagFrequencies = data?.tagFrequencies || {}

  const positionFreq = useMemo(() => buildPositionFrequency(tagFrequencies), [tagFrequencies])

  // Strength / weakness analysis
  const analysis = useMemo(() => {
    if (!statsSet) return null
    const attrs = statsSet.attributes
    let strongest: keyof BjjAttributes = "guard"
    let weakest: keyof BjjAttributes = "guard"
    for (const key of ATTR_KEYS) {
      if (attrs[key] > attrs[strongest]) strongest = key
      if (attrs[key] < attrs[weakest]) weakest = key
    }
    return { strongest, weakest }
  }, [statsSet])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ padding: 48 }}>
        <div style={{ color: TEXT.secondary, fontSize: 13 }} className="animate-pulse">
          스탯 로딩 중...
        </div>
      </div>
    )
  }

  if (error || !data || !statsSet || !analysis) {
    return (
      <div className="flex items-center justify-center" style={{ padding: 48 }}>
        <div style={{ color: "#ef4444", fontSize: 13 }}>스탯을 불러올 수 없습니다</div>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ── Gi / No-Gi Toggle ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {(["gi", "nogi"] as const).map((m) => {
          const isActive = mode === m
          const color = m === "gi" ? GI_COLOR : NOGI_COLOR
          const { r, g, b } = hexToRgb(color)
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: "6px 16px",
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 500,
                border: isActive ? `1px solid rgba(${r},${g},${b},0.3)` : "1px solid transparent",
                background: isActive ? `rgba(${r},${g},${b},0.12)` : "var(--border)",
                color: isActive ? color : TEXT.secondary,
                cursor: "pointer",
                transition: "all 150ms ease",
              }}
            >
              {m === "gi" ? "Gi" : "No-Gi"}
            </button>
          )
        })}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: TEXT.secondary }}>OVR</span>
          <span style={{ fontSize: 24, fontWeight: 600, color: TEXT.primary }}>{statsSet.ovr}</span>
          {statsSet.ovrRole && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: TEXT.secondary,
                border: `1px solid ${BORDER_DEFAULT}`,
                borderRadius: 6,
                padding: "2px 6px",
              }}
            >
              {statsSet.ovrRole}
            </span>
          )}
        </div>
      </div>

      {/* ── Upper Section: Radar + Stat Bars ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Left: Radar Chart */}
        <div
          style={{
            background: CARD.background,
            border: CARD.border,
            borderRadius: CARD.borderRadius,
            padding: CARD.padding,
          }}
        >
          <RadarChart attributes={statsSet.attributes} compareAttributes={null} maxDomain={40} />
        </div>

        {/* Right: Stat Bars + Analysis */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {ATTR_KEYS.map((key) => (
              <StatBar
                key={key}
                label={ATTR_LABELS[key]}
                value={statsSet.attributes[key]}
                color={CATEGORY_COLORS[ATTR_TO_CATEGORY[key]]}
              />
            ))}
          </div>

          {/* Strength / Weakness */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              paddingTop: 12,
              borderTop: `1px solid ${BORDER_DEFAULT}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ color: "#22c55e", fontSize: 11, marginTop: 1 }}>&#9650;</span>
              <p style={{ fontSize: 12, color: TEXT.secondary, margin: 0 }}>
                <span style={{ color: "#22c55e", fontWeight: 500 }}>
                  {ATTR_LABELS[analysis.strongest]}
                </span>
                이(가) 가장 강합니다{" "}
                <span style={{ color: TEXT.tertiary }}>
                  ({statsSet.attributes[analysis.strongest]})
                </span>
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ color: "#ef4444", fontSize: 11, marginTop: 1 }}>&#9660;</span>
              <p style={{ fontSize: 12, color: TEXT.secondary, margin: 0 }}>
                <span style={{ color: "#ef4444", fontWeight: 500 }}>
                  {ATTR_LABELS[analysis.weakest]}
                </span>
                이(가) 가장 부족합니다{" "}
                <span style={{ color: TEXT.tertiary }}>
                  ({statsSet.attributes[analysis.weakest]})
                </span>
                {" — "}
                <span style={{ color: TEXT.secondary }}>{DRILL_SUGGESTIONS[analysis.weakest]}</span>
              </p>
            </div>
            {statsSet.closestArchetype && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingTop: 4 }}>
                <span style={{ fontSize: 11, marginTop: 1, color: TEXT.tertiary }}>*</span>
                <p style={{ fontSize: 12, color: TEXT.secondary, margin: 0 }}>
                  가장 유사한 아키타입:{" "}
                  <span style={{ color: "#eab308", fontWeight: 500 }}>
                    {statsSet.closestArchetype}
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Lower Section: Skill Tree (4 views) ── */}
      <div
        style={{
          background: CARD.background,
          border: CARD.border,
          borderRadius: CARD.borderRadius,
          overflow: "hidden",
        }}
      >
        {/* View Tabs */}
        <div
          style={{
            display: "flex",
            overflowX: "auto",
            borderBottom: `1px solid ${BORDER_DEFAULT}`,
            padding: "8px 8px 0",
            gap: 4,
          }}
        >
          {SKILL_TREE_VIEWS.map((view) => {
            const isActive = treeView === view.id
            return (
              <button
                key={view.id}
                onClick={() => setTreeView(view.id)}
                style={{
                  padding: "8px 16px",
                  fontSize: 12,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  borderRadius: "8px 8px 0 0",
                  border: "none",
                  borderBottom: isActive ? `2px solid #a855f7` : "2px solid transparent",
                  background: isActive ? "rgba(168,85,247,0.08)" : "transparent",
                  color: isActive ? TEXT.primary : TEXT.secondary,
                  cursor: "pointer",
                  transition: "all 150ms ease",
                }}
              >
                {view.label}
              </button>
            )
          })}
        </div>

        {/* View Content */}
        <div style={{ padding: CARD.padding, overflowX: "auto" }}>
          {treeView === "map" && <PositionMapView positionFreq={positionFreq} />}
          {treeView === "guard" && <GuardDetailView positionFreq={positionFreq} />}
          {treeView === "journey" && <MyJourneyView positionFreq={positionFreq} />}
          {treeView === "lesson" && <LessonMapView positionFreq={positionFreq} />}
        </div>
      </div>
    </div>
  )
}
