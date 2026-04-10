"use client"

import { useState, useMemo, useRef, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { useSenseiData } from "@/lib/sensei/useSenseiData"
import type { Position, PositionLayer, TransitionType, SenseiEntry } from "@/lib/types/sensei"

// ─── Colors ─────────────────────────────────────────────────
const LAYER_COLORS: Record<PositionLayer, string> = {
  standing: "#71717a",
  guard: "#3b82f6",
  passing: "#22c55e",
  control: "#f59e0b",
  submission: "#ef4444",
  leglock: "#dc2626",
}

const EDGE_COLORS: Record<TransitionType | string, string> = {
  sweep: "#22c55e",
  pass: "#3b82f6",
  submission: "#ef4444",
  escape: "#eab308",
  transition: "#71717a",
  takedown: "#a855f7",
  guard_pull: "#8b5cf6",
  recovery: "#06b6d4",
}

// ─── Guard family Y offsets (서브행 분리) ────────────────────
const GUARD_FAMILY_ORDER = ["closed", "half", "sitting", "open", "butterfly"] as const
const GUARD_FAMILY_Y: Record<string, number> = {
  closed: 0,
  half: 70,
  sitting: 140,
  open: 210,
  butterfly: 310,
}
const GUARD_FAMILY_LABELS: Record<string, string> = {
  closed: "Closed",
  half: "Half",
  sitting: "Sitting",
  open: "Open",
  butterfly: "Butterfly",
}

// ─── Layer Y positions (guard expanded) ─────────────────────
const GUARD_START_Y = 100
const GUARD_HEIGHT = 380
const LAYER_Y_MAP: Record<PositionLayer, number> = {
  standing: 40,
  guard: GUARD_START_Y, // base — actual Y computed per family
  passing: GUARD_START_Y + GUARD_HEIGHT + 40,
  control: GUARD_START_Y + GUARD_HEIGHT + 160,
  leglock: GUARD_START_Y + GUARD_HEIGHT + 280,
  submission: GUARD_START_Y + GUARD_HEIGHT + 380,
}

const SVG_W = 1200
const SVG_H = LAYER_Y_MAP.submission + 80

// ─── Node abbreviation ─────────────────────────────────────
function abbr(pos: Position): string {
  // Use id for short names (they're already abbrs like "hg", "dlr", "kob")
  if (pos.id.length <= 4) return pos.id.toUpperCase()
  // Otherwise first 3 chars of nameKr
  return (pos.nameKr || pos.name).slice(0, 3)
}

// ─── Game Plans ─────────────────────────────────────────────
const GAME_PLANS = [
  { id: "all", label: "전체", positionIds: [] as string[] },
  { id: "dlr", label: "DLR 게임", positionIds: ["dlr", "rdlr", "standing", "berimbolo", "backtake", "rnc", "open", "kguard", "slx", "butterfly"] },
  { id: "half", label: "하프가드", positionIds: ["hg", "dhg", "kshield", "halfbutt", "waiter", "underhook", "side", "mount", "standing"] },
  { id: "pass", label: "패스 게임", positionIds: ["standing", "hq", "smash", "side", "mount", "kob", "north", "open", "closed", "hg"] },
  { id: "leglock", label: "레그락", positionIds: ["slx", "xg", "ashi", "insideashi", "outsideashi", "5050", "honeyhole", "heelhook", "kneebar", "butterfly"] },
  { id: "back", label: "백→피니시", positionIds: ["backtake", "backcontrol", "rnc", "armbar", "triangle", "mount"] },
  { id: "closed", label: "클로즈 가드", positionIds: ["closed", "armbar", "triangle", "omoplata", "standing", "mount", "side"] },
]

// ─── Component ──────────────────────────────────────────────
// ─── Training log per-position mapping ──────────────────────
interface PositionTrainingInfo {
  count: number
  lastDate: string | null
  videos: Array<{ url: string; title?: string }>
  recentNotes: Array<{ date: string; note: string }>
}

function buildPositionTrainingMap(
  entries: SenseiEntry[],
  positions: Position[]
): Record<string, PositionTrainingInfo> {
  const map: Record<string, PositionTrainingInfo> = {}

  // Build lookup: for each position, what strings to match
  const matchTerms: Record<string, string[]> = {}
  for (const p of positions) {
    const terms = [p.id.toLowerCase(), p.name.toLowerCase()]
    if (p.nameKr) terms.push(p.nameKr.toLowerCase())
    matchTerms[p.id] = terms
  }

  for (const entry of entries) {
    const allTags = [...entry.classTags, ...entry.sparringTags, ...entry.studyTags]
      .map((t) => t.toLowerCase())

    for (const pos of positions) {
      const terms = matchTerms[pos.id]
      const matched = allTags.some((tag) =>
        terms.some((term) => tag.includes(term) || term.includes(tag))
      )
      if (!matched) continue

      if (!map[pos.id]) {
        map[pos.id] = { count: 0, lastDate: null, videos: [], recentNotes: [] }
      }
      const info = map[pos.id]
      info.count++
      if (entry.date && (!info.lastDate || entry.date > info.lastDate)) {
        info.lastDate = entry.date
      }
      if (entry.videoUrl && info.videos.length < 3 && !info.videos.some((v) => v.url === entry.videoUrl)) {
        info.videos.push({ url: entry.videoUrl, title: entry.videoTitle })
      }
      if (entry.note && info.recentNotes.length < 2) {
        info.recentNotes.push({
          date: entry.date ?? "",
          note: entry.note.slice(0, 100),
        })
      }
    }
  }
  return map
}

export function SenseiNavMap() {
  const { positions, transitions } = useSenseiData()
  const [selectedPlan, setSelectedPlan] = useState("all")
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [ruleSetFilter, setRuleSetFilter] = useState<"all" | "gi" | "nogi">("all")

  // Training Log fetch
  const { data: trainingEntries } = useQuery<SenseiEntry[]>({
    queryKey: ["sensei-entries-navmap"],
    queryFn: async () => {
      const res = await fetch("/api/notion/sensei")
      if (!res.ok) throw new Error("training log fetch failed")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const trainingMap = useMemo(
    () => buildPositionTrainingMap(trainingEntries ?? [], positions),
    [trainingEntries, positions]
  )

  // Zoom/pan state
  const svgRef = useRef<SVGSVGElement>(null)
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: SVG_W, h: SVG_H })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 })

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 1.1 : 0.9
    setViewBox((v) => {
      const nw = v.w * factor
      const nh = v.h * factor
      return { x: v.x + (v.w - nw) / 2, y: v.y + (v.h - nh) / 2, w: nw, h: nh }
    })
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    setIsPanning(true)
    panStart.current = { x: e.clientX, y: e.clientY, vx: viewBox.x, vy: viewBox.y }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }, [viewBox])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const scaleX = viewBox.w / rect.width
    const scaleY = viewBox.h / rect.height
    const dx = (e.clientX - panStart.current.x) * scaleX
    const dy = (e.clientY - panStart.current.y) * scaleY
    setViewBox((v) => ({ ...v, x: panStart.current.vx - dx, y: panStart.current.vy - dy }))
  }, [isPanning, viewBox.w, viewBox.h])

  const handlePointerUp = useCallback(() => setIsPanning(false), [])

  const resetZoom = useCallback(() => setViewBox({ x: 0, y: 0, w: SVG_W, h: SVG_H }), [])

  // Filter by ruleSet
  const filteredPositions = useMemo(() => {
    if (ruleSetFilter === "all") return positions
    return positions.filter((p) => p.ruleSet === "common" || p.ruleSet === ruleSetFilter)
  }, [positions, ruleSetFilter])

  const filteredTransitions = useMemo(() => {
    if (ruleSetFilter === "all") return transitions
    return transitions.filter((t) => t.ruleSet === "common" || t.ruleSet === ruleSetFilter)
  }, [transitions, ruleSetFilter])

  // Game plan highlight
  const activePlan = GAME_PLANS.find((g) => g.id === selectedPlan)
  const highlightIds = useMemo(() => {
    if (!activePlan || activePlan.id === "all") return null
    return new Set(activePlan.positionIds)
  }, [activePlan])

  // Layout — guard family sub-rows, other layers single row
  const nodePositions = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {}

    for (const layer of ["standing", "passing", "control", "leglock", "submission"] as PositionLayer[]) {
      const items = filteredPositions.filter((p) => p.layer === layer)
      const w = SVG_W - 120
      const gap = items.length > 1 ? w / (items.length + 1) : w / 2
      items.forEach((p, i) => {
        map[p.id] = { x: 80 + gap * (i + 1), y: LAYER_Y_MAP[layer] }
      })
    }

    // Guard — group by family, each family gets its own sub-row
    const guardPositions = filteredPositions.filter((p) => p.layer === "guard")
    const byFamily: Record<string, Position[]> = {}
    for (const p of guardPositions) {
      const fam = p.family || "other"
      if (!byFamily[fam]) byFamily[fam] = []
      byFamily[fam].push(p)
    }

    for (const fam of [...GUARD_FAMILY_ORDER, "other"]) {
      const items = byFamily[fam] ?? []
      if (items.length === 0) continue
      const yOff = GUARD_FAMILY_Y[fam] ?? 350
      const w = SVG_W - 180
      const gap = items.length > 1 ? w / (items.length + 1) : w / 2
      items.forEach((p, i) => {
        map[p.id] = { x: 130 + gap * (i + 1), y: GUARD_START_Y + yOff }
      })
    }

    return map
  }, [filteredPositions])

  // Visible transitions
  const visibleTransitions = useMemo(() => {
    const nodeIds = new Set(Object.keys(nodePositions))
    return filteredTransitions.filter((t) => nodeIds.has(t.from) && nodeIds.has(t.to))
  }, [filteredTransitions, nodePositions])

  // Active node = selected or hovered
  const activeNodeId = selectedNodeId ?? hoveredNodeId

  // Selected node details
  const selectedNode = filteredPositions.find((p) => p.id === selectedNodeId)
  const outgoing = useMemo(
    () => (selectedNodeId ? visibleTransitions.filter((t) => t.from === selectedNodeId) : []),
    [selectedNodeId, visibleTransitions]
  )
  const incoming = useMemo(
    () => (selectedNodeId ? visibleTransitions.filter((t) => t.to === selectedNodeId) : []),
    [selectedNodeId, visibleTransitions]
  )

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 flex-wrap">
          {GAME_PLANS.map((gp) => (
            <button
              key={gp.id}
              type="button"
              onClick={() => { setSelectedPlan(gp.id); setSelectedNodeId(null) }}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                selectedPlan === gp.id
                  ? "bg-orange-600 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {gp.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={resetZoom} className="text-[10px] text-muted-foreground hover:text-foreground">Reset</button>
          <div className="flex gap-1">
            {(["all", "gi", "nogi"] as const).map((rs) => (
              <button
                key={rs}
                type="button"
                onClick={() => setRuleSetFilter(rs)}
                className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                  ruleSetFilter === rs
                    ? "border-orange-500/60 text-orange-300 bg-orange-500/10"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {rs === "all" ? "All" : rs === "gi" ? "Gi" : "NoGi"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* SVG Map */}
        <div className="flex-1 overflow-hidden border border-border rounded-xl bg-card p-1">
          <svg
            ref={svgRef}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            className="w-full touch-none"
            style={{ minHeight: 500, cursor: isPanning ? "grabbing" : "grab" }}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--foreground)" opacity={0.6} />
              </marker>
            </defs>

            {/* Layer labels */}
            {(["standing", "passing", "control", "leglock", "submission"] as PositionLayer[]).map((layer) => (
              <text key={layer} x={15} y={LAYER_Y_MAP[layer] + 4} fill={LAYER_COLORS[layer]} fontSize={10} fontWeight={600} opacity={0.4}>
                {layer.toUpperCase()}
              </text>
            ))}

            {/* Guard family labels */}
            {GUARD_FAMILY_ORDER.map((fam) => (
              <text key={fam} x={15} y={GUARD_START_Y + GUARD_FAMILY_Y[fam] + 4} fill={LAYER_COLORS.guard} fontSize={9} fontWeight={500} opacity={0.35}>
                {GUARD_FAMILY_LABELS[fam]}
              </text>
            ))}

            {/* Guard region background */}
            <rect x={5} y={GUARD_START_Y - 15} width={SVG_W - 10} height={GUARD_HEIGHT + 20} rx={8} fill={LAYER_COLORS.guard} fillOpacity={0.03} stroke={LAYER_COLORS.guard} strokeOpacity={0.08} />

            {/* Edges — only show when node is active (hovered/selected) or game plan non-all */}
            {visibleTransitions.map((t, i) => {
              const from = nodePositions[t.from]
              const to = nodePositions[t.to]
              if (!from || !to) return null

              const isHighlightedPlan = !highlightIds || (highlightIds.has(t.from) && highlightIds.has(t.to))
              const isConnected = activeNodeId && (t.from === activeNodeId || t.to === activeNodeId)

              // Only show edges when: node active OR game plan selected
              if (!isConnected && highlightIds === null) return null
              if (!isHighlightedPlan && !isConnected) return null

              const color = EDGE_COLORS[t.type] || EDGE_COLORS.transition
              const opacity = isConnected ? 0.8 : 0.25

              // Quadratic bezier
              const midX = (from.x + to.x) / 2
              const midY = (from.y + to.y) / 2
              const dx = to.x - from.x
              const curvature = Math.min(Math.abs(dx) * 0.3, 60)
              const cx = midX + (from.y === to.y ? 0 : (dx > 0 ? -curvature : curvature))
              const cy = midY - curvature * 0.5

              return (
                <path
                  key={`e-${i}`}
                  d={`M${from.x},${from.y} Q${cx},${cy} ${to.x},${to.y}`}
                  stroke={color}
                  strokeWidth={isConnected ? 2.5 : 1}
                  fill="none"
                  opacity={opacity}
                  markerEnd="url(#arrowhead)"
                />
              )
            })}

            {/* Nodes */}
            {filteredPositions.map((pos) => {
              const xy = nodePositions[pos.id]
              if (!xy) return null

              const isHighlighted = !highlightIds || highlightIds.has(pos.id)
              const isSelected = pos.id === selectedNodeId
              const isHovered = pos.id === hoveredNodeId
              const isActive = isSelected || isHovered
              const color = LAYER_COLORS[pos.layer]
              const nodeOpacity = isHighlighted ? 1 : 0.1
              const r = isActive ? 20 : 16

              return (
                <g
                  key={pos.id}
                  transform={`translate(${xy.x}, ${xy.y})`}
                  onClick={(e) => { e.stopPropagation(); setSelectedNodeId(pos.id === selectedNodeId ? null : pos.id) }}
                  onPointerEnter={() => setHoveredNodeId(pos.id)}
                  onPointerLeave={() => setHoveredNodeId(null)}
                  className="cursor-pointer"
                  opacity={nodeOpacity}
                >
                  {/* Glow for active */}
                  {isActive && <circle r={r + 6} fill={color} fillOpacity={0.12} />}
                  <circle
                    r={r}
                    fill={color}
                    fillOpacity={isActive ? 0.25 : 0.12}
                    stroke={color}
                    strokeWidth={isActive ? 2.5 : 1.5}
                  />
                  {/* Abbreviation inside node */}
                  <text
                    textAnchor="middle"
                    dy={4}
                    fill={color}
                    fontSize={8}
                    fontWeight={700}
                    style={{ pointerEvents: "none" }}
                  >
                    {abbr(pos)}
                  </text>
                  {/* Full name below */}
                  <text
                    textAnchor="middle"
                    dy={r + 12}
                    fill="var(--foreground)"
                    fontSize={8}
                    opacity={isActive ? 0.9 : 0.5}
                    fontWeight={isActive ? 600 : 400}
                    style={{ pointerEvents: "none" }}
                  >
                    {pos.nameKr || pos.name}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Detail Panel */}
        {selectedNode && (
          <div className="w-64 shrink-0 border border-border rounded-xl bg-card p-4 space-y-3 hidden md:block">
            <div>
              <h3 className="text-foreground font-semibold text-sm">{selectedNode.nameKr}</h3>
              <p className="text-muted-foreground text-xs">{selectedNode.name}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className="inline-block px-2 py-0.5 rounded text-[10px] font-medium"
                  style={{ backgroundColor: LAYER_COLORS[selectedNode.layer] + "30", color: LAYER_COLORS[selectedNode.layer] }}
                >
                  {selectedNode.layer}
                </span>
                {selectedNode.family && (
                  <span className="text-[10px] text-muted-foreground">· {selectedNode.family}</span>
                )}
                {selectedNode.perspective && (
                  <span className="text-[10px] text-muted-foreground">· {selectedNode.perspective}</span>
                )}
              </div>
            </div>

            {/* Training Log Info */}
            {(() => {
              const info = trainingMap[selectedNode.id]
              if (!info) return (
                <p className="text-muted-foreground/60 text-[11px]">수업 기록 없음</p>
              )
              return (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-xs">
                    <div>
                      <span className="text-foreground font-semibold">{info.count}</span>
                      <span className="text-muted-foreground ml-1">세션</span>
                    </div>
                    {info.lastDate && (
                      <div className="text-muted-foreground">
                        최근 <span className="text-foreground/80">{info.lastDate.slice(5)}</span>
                      </div>
                    )}
                  </div>
                  {info.videos.length > 0 && (
                    <div>
                      <h4 className="text-[10px] text-muted-foreground mb-0.5">영상</h4>
                      {info.videos.map((v, vi) => (
                        <a
                          key={vi}
                          href={v.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-[11px] text-blue-400 hover:text-blue-300 truncate"
                        >
                          🎬 {v.title || v.url.slice(0, 40)}
                        </a>
                      ))}
                    </div>
                  )}
                  {info.recentNotes.length > 0 && (
                    <div>
                      <h4 className="text-[10px] text-muted-foreground mb-0.5">최근 노트</h4>
                      {info.recentNotes.map((n, ni) => (
                        <div key={ni} className="text-[10px] text-foreground/70 leading-tight mb-1">
                          <span className="text-muted-foreground">{n.date.slice(5)}</span>{" "}
                          {n.note}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            <div className="border-t border-border pt-2" />

            {outgoing.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-foreground/80 mb-1">→ 전환 ({outgoing.length})</h4>
                <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                  {outgoing.map((t, i) => {
                    const toPos = filteredPositions.find((p) => p.id === t.to)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedNodeId(t.to)}
                        className="w-full text-left flex items-center gap-1.5 px-2 py-1 rounded text-[11px] hover:bg-muted transition-colors"
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: EDGE_COLORS[t.type] }} />
                        <span className="text-foreground/90 truncate">{t.action}</span>
                        <span className="text-muted-foreground ml-auto shrink-0 text-[10px]">→ {toPos?.nameKr || t.to}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {incoming.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-foreground/80 mb-1">← 진입 ({incoming.length})</h4>
                <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                  {incoming.map((t, i) => {
                    const fromPos = filteredPositions.find((p) => p.id === t.from)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedNodeId(t.from)}
                        className="w-full text-left flex items-center gap-1.5 px-2 py-1 rounded text-[11px] hover:bg-muted transition-colors"
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: EDGE_COLORS[t.type] }} />
                        <span className="text-muted-foreground shrink-0 text-[10px]">{fromPos?.nameKr || t.from} →</span>
                        <span className="text-foreground/90 truncate ml-auto">{t.action}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
