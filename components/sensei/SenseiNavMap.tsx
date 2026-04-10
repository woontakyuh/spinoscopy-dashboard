"use client"

import { useState, useMemo } from "react"
import { useSenseiData } from "@/lib/sensei/useSenseiData"
import type { Position, Transition, PositionLayer, TransitionType } from "@/lib/types/sensei"

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

const LAYER_ORDER: PositionLayer[] = ["standing", "guard", "passing", "control", "leglock", "submission"]
const LAYER_Y: Record<PositionLayer, number> = {
  standing: 60,
  guard: 180,
  passing: 340,
  control: 480,
  leglock: 600,
  submission: 720,
}

// ─── Game Plans ─────────────────────────────────────────────
interface GamePlan {
  id: string
  label: string
  positionIds: string[]
}

const GAME_PLANS: GamePlan[] = [
  { id: "all", label: "전체", positionIds: [] },
  { id: "dlr", label: "DLR 게임", positionIds: ["dlr", "rdlr", "standing", "berimbolo", "backtake", "rnc", "open", "kguard", "slx", "sweepFinish"] },
  { id: "half", label: "하프가드", positionIds: ["hg", "dhg", "kshield", "halfbutt", "waiter", "underhook", "sweepFinish", "side", "mount"] },
  { id: "pass", label: "패스 게임", positionIds: ["standing", "hq", "smash", "side", "mount", "kob", "north", "open", "closed", "hg"] },
  { id: "leglock", label: "레그락", positionIds: ["slx", "xguard", "ashi", "insideashi", "outsideashi", "5050", "honeyhole", "heelhook", "kneebar"] },
  { id: "back", label: "백→피니시", positionIds: ["backtake", "backcontrol", "rnc", "armbar", "triangle", "mount", "seatbelt"] },
  { id: "closed", label: "클로즈 가드", positionIds: ["closed", "overhook", "hipbump", "scissor", "armbar", "triangle", "omoplata", "sweepFinish"] },
]

// ─── Component ──────────────────────────────────────────────
export function SenseiNavMap() {
  const { positions, transitions } = useSenseiData()
  const [selectedPlan, setSelectedPlan] = useState("all")
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [ruleSetFilter, setRuleSetFilter] = useState<"all" | "gi" | "nogi">("all")

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

  // Layout: compute X positions per layer (distribute horizontally)
  const nodePositions = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {}
    const byLayer: Record<string, Position[]> = {}
    for (const p of filteredPositions) {
      if (!byLayer[p.layer]) byLayer[p.layer] = []
      byLayer[p.layer].push(p)
    }
    for (const layer of LAYER_ORDER) {
      const items = byLayer[layer] ?? []
      const totalWidth = 1000
      const gap = items.length > 1 ? totalWidth / (items.length + 1) : totalWidth / 2
      items.forEach((p, i) => {
        map[p.id] = {
          x: gap * (i + 1),
          y: LAYER_Y[layer] + (i % 2 === 0 ? 0 : 25), // slight stagger
        }
      })
    }
    return map
  }, [filteredPositions])

  // Visible transitions (only between visible nodes)
  const visibleTransitions = useMemo(() => {
    const nodeIds = new Set(Object.keys(nodePositions))
    return filteredTransitions.filter((t) => nodeIds.has(t.from) && nodeIds.has(t.to))
  }, [filteredTransitions, nodePositions])

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

  const svgWidth = 1100
  const svgHeight = 800

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Game plan tabs */}
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

        <div className="ml-auto flex gap-1">
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

      <div className="flex gap-4 items-start">
        {/* SVG Map */}
        <div className="flex-1 overflow-x-auto border border-border rounded-xl bg-card p-2">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full"
            style={{ minHeight: 500 }}
          >
            {/* Layer labels */}
            {LAYER_ORDER.map((layer) => (
              <text
                key={layer}
                x={20}
                y={LAYER_Y[layer] + 5}
                fill={LAYER_COLORS[layer]}
                fontSize={11}
                fontWeight={600}
                opacity={0.5}
              >
                {layer.toUpperCase()}
              </text>
            ))}

            {/* Edges */}
            {visibleTransitions.map((t, i) => {
              const from = nodePositions[t.from]
              const to = nodePositions[t.to]
              if (!from || !to) return null

              const isHighlighted = !highlightIds || (highlightIds.has(t.from) && highlightIds.has(t.to))
              const isConnected = selectedNodeId && (t.from === selectedNodeId || t.to === selectedNodeId)
              const color = EDGE_COLORS[t.type] || EDGE_COLORS.transition
              const opacity = !isHighlighted ? 0.05 : isConnected ? 0.9 : 0.2

              // Curved path
              const dx = to.x - from.x
              const dy = to.y - from.y
              const cx = from.x + dx * 0.5
              const cy = from.y + dy * 0.3

              return (
                <path
                  key={`e-${i}`}
                  d={`M${from.x},${from.y} Q${cx},${cy} ${to.x},${to.y}`}
                  stroke={color}
                  strokeWidth={isConnected ? 2 : 1}
                  fill="none"
                  opacity={opacity}
                  markerEnd={isConnected ? "url(#arrowhead)" : undefined}
                />
              )
            })}

            {/* Arrow marker */}
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--foreground)" opacity={0.6} />
              </marker>
            </defs>

            {/* Nodes */}
            {filteredPositions.map((pos) => {
              const xy = nodePositions[pos.id]
              if (!xy) return null

              const isHighlighted = !highlightIds || highlightIds.has(pos.id)
              const isSelected = pos.id === selectedNodeId
              const color = LAYER_COLORS[pos.layer]
              const opacity = isHighlighted ? 1 : 0.15

              return (
                <g
                  key={pos.id}
                  transform={`translate(${xy.x}, ${xy.y})`}
                  onClick={() => setSelectedNodeId(pos.id === selectedNodeId ? null : pos.id)}
                  className="cursor-pointer"
                  opacity={opacity}
                >
                  <circle
                    r={isSelected ? 18 : 14}
                    fill={color}
                    fillOpacity={isSelected ? 0.3 : 0.15}
                    stroke={color}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                  <text
                    textAnchor="middle"
                    dy={-20}
                    fill={color}
                    fontSize={9}
                    fontWeight={isSelected ? 700 : 500}
                  >
                    {pos.nameKr || pos.name}
                  </text>
                  <text
                    textAnchor="middle"
                    dy={4}
                    fill="var(--foreground)"
                    fontSize={7}
                    opacity={0.7}
                  >
                    {pos.id}
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
              <span
                className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: LAYER_COLORS[selectedNode.layer] + "30", color: LAYER_COLORS[selectedNode.layer] }}
              >
                {selectedNode.layer}
              </span>
              {selectedNode.family && (
                <span className="ml-1 text-[10px] text-muted-foreground">({selectedNode.family})</span>
              )}
            </div>

            {outgoing.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-foreground/80 mb-1">→ 갈 수 있는 곳 ({outgoing.length})</h4>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {outgoing.map((t, i) => {
                    const toPos = filteredPositions.find((p) => p.id === t.to)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedNodeId(t.to)}
                        className="w-full text-left flex items-center gap-1.5 px-2 py-1 rounded text-[11px] hover:bg-muted transition-colors"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: EDGE_COLORS[t.type] }}
                        />
                        <span className="text-foreground/90 truncate">{t.action}</span>
                        <span className="text-muted-foreground ml-auto shrink-0">→ {toPos?.nameKr || t.to}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {incoming.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-foreground/80 mb-1">← 올 수 있는 곳 ({incoming.length})</h4>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {incoming.map((t, i) => {
                    const fromPos = filteredPositions.find((p) => p.id === t.from)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedNodeId(t.from)}
                        className="w-full text-left flex items-center gap-1.5 px-2 py-1 rounded text-[11px] hover:bg-muted transition-colors"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: EDGE_COLORS[t.type] }}
                        />
                        <span className="text-muted-foreground shrink-0">{fromPos?.nameKr || t.from} →</span>
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
