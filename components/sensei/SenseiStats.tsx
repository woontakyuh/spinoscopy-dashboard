"use client"

import { useState, useMemo, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { RadarChart } from "./RadarChart"
import { StatBar } from "./StatBar"
import { Badge } from "@/components/ui/badge"
import { TAG_CATEGORIES, TAG_TO_CATEGORY } from "@/lib/ai/bjjTags"
import type { TagCategory } from "@/lib/ai/bjjTags"
import { SKILL_CONNECTIONS } from "@/lib/sensei/skillConnections"
import type { BjjStats, BjjAttributes, BjjStatsSet } from "@/lib/types/sensei"

// ─── Constants ────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  Guard: "#a855f7",
  Passing: "#22c55e",
  Control: "#f97316",
  Finishing: "#ef4444",
  Takedowns: "#06b6d4",
  LegLocks: "#eab308",
}

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

const SKILL_TREE_CATEGORIES: TagCategory[] = [
  "Guard", "Passing", "Control", "Finishing", "Takedowns", "LegLocks",
]

const DRILL_SUGGESTIONS: Record<keyof BjjAttributes, string> = {
  guard: "Half Guard → Sweep 드릴 추천",
  passing: "KCP → SideCtrl 패스 드릴 추천",
  control: "SideCtrl → Mount 드릴 추천",
  finishing: "Mount → Sub 피니싱 드릴 추천",
  takedowns: "Single Leg 드릴 추천",
  legLocks: "SLX → Ashi 엔트리 드릴 추천",
}

// ─── Skill Level Helper ───────────────────────────────────────

function getSkillLevel(count: number): number {
  if (count === 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  if (count <= 10) return 3
  if (count <= 20) return 4
  return 5
}

function getNodeStyle(level: number, categoryColor: string) {
  if (level === 0) {
    return {
      fill: "#18181b",
      stroke: "#27272a",
      textFill: "#52525b",
      glow: "none",
      opacity: 0.5,
    }
  }
  const intensity = level / 5
  return {
    fill: `${categoryColor}${Math.round(intensity * 40 + 10).toString(16).padStart(2, "0")}`,
    stroke: categoryColor,
    textFill: level >= 3 ? "#fafafa" : "#a1a1aa",
    glow: level >= 4 ? categoryColor : "none",
    opacity: 0.4 + intensity * 0.6,
  }
}

// ─── Tree Layout ──────────────────────────────────────────────

interface TreeNode {
  id: string
  x: number
  y: number
  count: number
  level: number
}

interface TreeEdge {
  from: string
  to: string
}

function layoutSkillTree(
  category: string,
  tagFrequencies: Record<string, number>,
): { nodes: TreeNode[]; edges: TreeEdge[] } {
  const connections = SKILL_CONNECTIONS[category] || []
  const categoryTags = TAG_CATEGORIES[category as TagCategory] || {}
  const tagAbbrs = Object.keys(categoryTags)

  // Build adjacency
  const childrenOf: Record<string, string[]> = {}
  const parentOf: Record<string, Set<string>> = {}
  const allNodeIds = new Set<string>()

  for (const conn of connections) {
    allNodeIds.add(conn.from)
    if (!childrenOf[conn.from]) childrenOf[conn.from] = []
    for (const to of conn.to) {
      allNodeIds.add(to)
      if (!childrenOf[conn.from].includes(to)) childrenOf[conn.from].push(to)
      if (!parentOf[to]) parentOf[to] = new Set()
      parentOf[to].add(conn.from)
    }
  }

  // Also add tags from the category that aren't in connections
  for (const abbr of tagAbbrs) {
    allNodeIds.add(abbr)
  }

  // Find root nodes (no parents within this category, or explicitly first in connections)
  const roots: string[] = []
  const nonRoots = new Set<string>()
  for (const id of allNodeIds) {
    if (parentOf[id] && parentOf[id].size > 0) {
      nonRoots.add(id)
    }
  }
  for (const id of allNodeIds) {
    if (!nonRoots.has(id)) roots.push(id)
  }

  // BFS to assign layers
  const layerOf: Record<string, number> = {}
  const visited = new Set<string>()
  let queue = [...roots]
  for (const r of roots) {
    layerOf[r] = 0
    visited.add(r)
  }

  while (queue.length > 0) {
    const nextQueue: string[] = []
    for (const node of queue) {
      const children = childrenOf[node] || []
      for (const child of children) {
        if (!visited.has(child)) {
          visited.add(child)
          layerOf[child] = (layerOf[node] || 0) + 1
          nextQueue.push(child)
        }
      }
    }
    queue = nextQueue
  }

  // Orphan nodes that weren't reached
  let maxLayer = 0
  for (const v of Object.values(layerOf)) {
    if (v > maxLayer) maxLayer = v
  }
  for (const id of allNodeIds) {
    if (!visited.has(id)) {
      layerOf[id] = maxLayer + 1
    }
  }

  // Group by layer
  const layers: Record<number, string[]> = {}
  for (const [id, layer] of Object.entries(layerOf)) {
    if (!layers[layer]) layers[layer] = []
    layers[layer].push(id)
  }

  const NODE_W = 70
  const NODE_H = 70
  const PAD_X = 20
  const PAD_Y = 30

  const sortedLayers = Object.keys(layers).map(Number).sort((a, b) => a - b)

  // Calculate max width
  let maxNodesInLayer = 0
  for (const l of sortedLayers) {
    if (layers[l].length > maxNodesInLayer) maxNodesInLayer = layers[l].length
  }

  const nodes: TreeNode[] = []
  const nodeMap: Record<string, TreeNode> = {}

  for (const layer of sortedLayers) {
    const items = layers[layer]
    const totalWidth = items.length * NODE_W + (items.length - 1) * PAD_X
    const startX = (maxNodesInLayer * NODE_W + (maxNodesInLayer - 1) * PAD_X - totalWidth) / 2

    items.forEach((id, i) => {
      const count = tagFrequencies[id] || 0
      const node: TreeNode = {
        id,
        x: startX + i * (NODE_W + PAD_X) + NODE_W / 2,
        y: PAD_Y + layer * (NODE_H + PAD_Y) + NODE_H / 2,
        count,
        level: getSkillLevel(count),
      }
      nodes.push(node)
      nodeMap[id] = node
    })
  }

  // Edges
  const edges: TreeEdge[] = []
  for (const conn of connections) {
    for (const to of conn.to) {
      if (nodeMap[conn.from] && nodeMap[to]) {
        edges.push({ from: conn.from, to })
      }
    }
  }

  return { nodes, edges }
}

// ─── Main Component ───────────────────────────────────────────

export function SenseiStats() {
  const [mode, setMode] = useState<"gi" | "nogi">("gi")
  const [treeCategory, setTreeCategory] = useState<TagCategory>("Guard")

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

  // Skill tree layout
  const treeLayout = useMemo(
    () => layoutSkillTree(treeCategory, tagFrequencies),
    [treeCategory, tagFrequencies],
  )

  // SVG dimensions
  const svgDimensions = useMemo(() => {
    if (treeLayout.nodes.length === 0) return { width: 400, height: 200 }
    let maxX = 0
    let maxY = 0
    for (const n of treeLayout.nodes) {
      if (n.x + 40 > maxX) maxX = n.x + 40
      if (n.y + 40 > maxY) maxY = n.y + 40
    }
    return { width: Math.max(400, maxX + 40), height: Math.max(200, maxY + 40) }
  }, [treeLayout])

  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  const getNodeLabel = useCallback((id: string) => {
    // Get full name from TAG_CATEGORIES
    const cat = TAG_TO_CATEGORY[id]
    if (cat && TAG_CATEGORIES[cat]?.[id]) {
      return TAG_CATEGORIES[cat][id]
    }
    return id
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-zinc-500 text-sm animate-pulse">스탯 로딩 중...</div>
      </div>
    )
  }

  if (error || !data || !statsSet || !analysis) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-red-400 text-sm">스탯을 불러올 수 없습니다</div>
      </div>
    )
  }

  const catColor = CATEGORY_COLORS[treeCategory] || "#a855f7"

  return (
    <div className="space-y-6">
      {/* ── Gi / No-Gi Toggle ── */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMode("gi")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            mode === "gi"
              ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50"
              : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Gi
        </button>
        <button
          onClick={() => setMode("nogi")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            mode === "nogi"
              ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/50"
              : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300"
          }`}
        >
          No-Gi
        </button>
        <div className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
          <span>OVR</span>
          <span className="text-lg font-bold text-white">{statsSet.ovr}</span>
          {statsSet.ovrRole && (
            <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
              {statsSet.ovrRole}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Upper Section: Radar + Stat Bars ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Radar Chart */}
        <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800/50">
          <RadarChart attributes={statsSet.attributes} />
        </div>

        {/* Right: Stat Bars + Analysis */}
        <div className="space-y-4">
          <div className="space-y-3">
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
          <div className="space-y-2 pt-2 border-t border-zinc-800/50">
            <div className="flex items-start gap-2">
              <span className="text-green-400 text-xs mt-0.5">&#9650;</span>
              <p className="text-xs text-zinc-300">
                <span className="text-green-400 font-medium">{ATTR_LABELS[analysis.strongest]}</span>
                이(가) 가장 강합니다{" "}
                <span className="text-zinc-500">({statsSet.attributes[analysis.strongest]})</span>
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-red-400 text-xs mt-0.5">&#9660;</span>
              <p className="text-xs text-zinc-300">
                <span className="text-red-400 font-medium">{ATTR_LABELS[analysis.weakest]}</span>
                이(가) 가장 부족합니다{" "}
                <span className="text-zinc-500">({statsSet.attributes[analysis.weakest]})</span>
                {" — "}
                <span className="text-zinc-400">{DRILL_SUGGESTIONS[analysis.weakest]}</span>
              </p>
            </div>
            {statsSet.closestArchetype && (
              <div className="flex items-start gap-2 pt-1">
                <span className="text-xs mt-0.5">🎯</span>
                <p className="text-xs text-zinc-300">
                  가장 유사한 아키타입:{" "}
                  <span className="text-amber-400 font-medium">{statsSet.closestArchetype}</span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Lower Section: Skill Tree ── */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 overflow-hidden">
        {/* Category Tabs */}
        <div className="flex overflow-x-auto border-b border-zinc-800/50 px-2 pt-2 gap-1">
          {SKILL_TREE_CATEGORIES.map((cat) => {
            const isActive = treeCategory === cat
            const color = CATEGORY_COLORS[cat]
            return (
              <button
                key={cat}
                onClick={() => setTreeCategory(cat)}
                className={`px-3 py-2 text-xs font-medium rounded-t-lg whitespace-nowrap transition-all ${
                  isActive
                    ? "text-white border-b-2"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
                style={isActive ? { borderBottomColor: color, backgroundColor: `${color}15` } : {}}
              >
                {cat === "LegLocks" ? "Leg Locks" : cat}
              </button>
            )
          })}
        </div>

        {/* SVG Skill Tree */}
        <div className="overflow-x-auto p-4">
          {treeLayout.nodes.length === 0 ? (
            <div className="text-center text-zinc-600 text-sm py-8">
              이 카테고리에 스킬이 없습니다
            </div>
          ) : (
            <svg
              width={svgDimensions.width}
              height={svgDimensions.height}
              className="mx-auto"
              style={{ minWidth: svgDimensions.width }}
            >
              <defs>
                <filter id={`glow-${treeCategory}`}>
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Edges */}
              {treeLayout.edges.map((edge, i) => {
                const fromNode = treeLayout.nodes.find((n) => n.id === edge.from)
                const toNode = treeLayout.nodes.find((n) => n.id === edge.to)
                if (!fromNode || !toNode) return null
                const bothUnlocked = fromNode.level > 0 && toNode.level > 0
                return (
                  <line
                    key={`edge-${i}`}
                    x1={fromNode.x}
                    y1={fromNode.y}
                    x2={toNode.x}
                    y2={toNode.y}
                    stroke={bothUnlocked ? catColor : "#27272a"}
                    strokeWidth={bothUnlocked ? 1.5 : 1}
                    strokeOpacity={bothUnlocked ? 0.6 : 0.2}
                  />
                )
              })}

              {/* Nodes */}
              {treeLayout.nodes.map((node) => {
                const style = getNodeStyle(node.level, catColor)
                const isHovered = hoveredNode === node.id
                const fullName = getNodeLabel(node.id)
                const abbr = node.id.length > 8 ? node.id.slice(0, 7) + "…" : node.id

                return (
                  <g
                    key={node.id}
                    onMouseEnter={() => setHoveredNode(node.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    style={{ cursor: "pointer" }}
                    filter={node.level >= 4 ? `url(#glow-${treeCategory})` : undefined}
                  >
                    {/* Node circle */}
                    <rect
                      x={node.x - 30}
                      y={node.y - 20}
                      width={60}
                      height={40}
                      rx={8}
                      fill={style.fill}
                      stroke={style.stroke}
                      strokeWidth={node.level >= 3 ? 2 : 1}
                      opacity={style.opacity}
                    />
                    {/* Abbreviation */}
                    <text
                      x={node.x}
                      y={node.y - 3}
                      textAnchor="middle"
                      fill={style.textFill}
                      fontSize={10}
                      fontWeight={node.level >= 3 ? "bold" : "normal"}
                      fontFamily="monospace"
                    >
                      {abbr}
                    </text>
                    {/* Count */}
                    <text
                      x={node.x}
                      y={node.y + 11}
                      textAnchor="middle"
                      fill={node.level > 0 ? catColor : "#3f3f46"}
                      fontSize={9}
                      fontFamily="monospace"
                    >
                      {node.level > 0 ? `Lv.${node.level} (${node.count})` : "🔒"}
                    </text>

                    {/* Tooltip on hover */}
                    {isHovered && (
                      <g>
                        <rect
                          x={node.x - 55}
                          y={node.y - 50}
                          width={110}
                          height={22}
                          rx={4}
                          fill="#09090b"
                          stroke="#3f3f46"
                          strokeWidth={1}
                        />
                        <text
                          x={node.x}
                          y={node.y - 35}
                          textAnchor="middle"
                          fill="#e4e4e7"
                          fontSize={9}
                        >
                          {fullName}
                        </text>
                      </g>
                    )}
                  </g>
                )
              })}
            </svg>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 px-4 pb-3 flex-wrap">
          {[0, 1, 2, 3, 4, 5].map((lv) => {
            const style = getNodeStyle(lv, catColor)
            return (
              <div key={lv} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded"
                  style={{
                    backgroundColor: style.fill,
                    border: `1px solid ${style.stroke}`,
                    opacity: style.opacity,
                  }}
                />
                <span className="text-[10px] text-zinc-500">
                  {lv === 0 ? "잠김" : `Lv.${lv}`}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
