"use client"

import { useState, useMemo, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { RadarChart } from "./RadarChart"
import { StatBar } from "./StatBar"
import { TAG_CATEGORIES, TAG_TO_CATEGORY } from "@/lib/ai/bjjTags"
import type { TagCategory } from "@/lib/ai/bjjTags"
import { SKILL_CONNECTIONS } from "@/lib/sensei/skillConnections"
import type { BjjStats, BjjAttributes, BjjStatsSet } from "@/lib/types/sensei"

// ─── Design Tokens ───────────────────────────────────────────

const CARD = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 12,
  padding: 20,
} as const


const TEXT = {
  primary: "#ffffff",
  secondary: "rgba(255,255,255,0.5)",
  tertiary: "rgba(255,255,255,0.25)",
} as const

const BORDER_DEFAULT = "rgba(255,255,255,0.06)"

// ─── Category Colors ─────────────────────────────────────────

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
      textFill: "rgba(255,255,255,0.25)",
      opacity: 0.5,
    }
  }
  const intensity = level / 5
  // Build fill color with category color at varying alpha
  const alpha = Math.round((intensity * 0.25 + 0.05) * 255)
    .toString(16)
    .padStart(2, "0")
  return {
    fill: `${categoryColor}${alpha}`,
    stroke: categoryColor,
    textFill: level >= 3 ? TEXT.primary : TEXT.secondary,
    opacity: 0.4 + intensity * 0.6,
  }
}

// ─── Tag Color Helper (12% opacity bg + bright text) ─────────


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

  for (const abbr of tagAbbrs) {
    allNodeIds.add(abbr)
  }

  // Find root nodes
  const nonRoots = new Set<string>()
  for (const id of allNodeIds) {
    if (parentOf[id] && parentOf[id].size > 0) {
      nonRoots.add(id)
    }
  }
  const roots: string[] = []
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

  // Orphan nodes
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
    const cat = TAG_TO_CATEGORY[id]
    if (cat && TAG_CATEGORIES[cat]?.[id]) {
      return TAG_CATEGORIES[cat][id]
    }
    return id
  }, [])

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

  const catColor = CATEGORY_COLORS[treeCategory] || "#a855f7"

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ── Gi / No-Gi Toggle ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {(["gi", "nogi"] as const).map((m) => {
          const isActive = mode === m
          const color = m === "gi" ? GI_COLOR : NOGI_COLOR
          const r = parseInt(color.slice(1, 3), 16)
          const g = parseInt(color.slice(3, 5), 16)
          const b = parseInt(color.slice(5, 7), 16)
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
                background: isActive ? `rgba(${r},${g},${b},0.12)` : "rgba(255,255,255,0.03)",
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

      {/* ── Lower Section: Skill Tree ── */}
      <div
        style={{
          background: CARD.background,
          border: CARD.border,
          borderRadius: CARD.borderRadius,
          overflow: "hidden",
        }}
      >
        {/* Category Tabs */}
        <div
          style={{
            display: "flex",
            overflowX: "auto",
            borderBottom: `1px solid ${BORDER_DEFAULT}`,
            padding: "8px 8px 0",
            gap: 4,
          }}
        >
          {SKILL_TREE_CATEGORIES.map((cat) => {
            const isActive = treeCategory === cat
            const color = CATEGORY_COLORS[cat]
            const r = parseInt(color.slice(1, 3), 16)
            const g = parseInt(color.slice(3, 5), 16)
            const b = parseInt(color.slice(5, 7), 16)
            return (
              <button
                key={cat}
                onClick={() => setTreeCategory(cat)}
                style={{
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  borderRadius: "8px 8px 0 0",
                  border: "none",
                  borderBottom: isActive ? `2px solid ${color}` : "2px solid transparent",
                  background: isActive ? `rgba(${r},${g},${b},0.08)` : "transparent",
                  color: isActive ? TEXT.primary : TEXT.secondary,
                  cursor: "pointer",
                  transition: "all 150ms ease",
                }}
              >
                {cat === "LegLocks" ? "Leg Locks" : cat}
              </button>
            )
          })}
        </div>

        {/* SVG Skill Tree */}
        <div style={{ overflowX: "auto", padding: CARD.padding }}>
          {treeLayout.nodes.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: TEXT.tertiary,
                fontSize: 13,
                padding: "32px 0",
              }}
            >
              이 카테고리에 스킬이 없습니다
            </div>
          ) : (
            <svg
              width={svgDimensions.width}
              height={svgDimensions.height}
              style={{ display: "block", margin: "0 auto", minWidth: svgDimensions.width }}
            >
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
                    strokeOpacity={bothUnlocked ? 0.5 : 0.15}
                  />
                )
              })}

              {/* Nodes */}
              {treeLayout.nodes.map((node) => {
                const style = getNodeStyle(node.level, catColor)
                const isHovered = hoveredNode === node.id
                const fullName = getNodeLabel(node.id)
                const abbr = node.id.length > 8 ? node.id.slice(0, 7) + "\u2026" : node.id

                return (
                  <g
                    key={node.id}
                    onMouseEnter={() => setHoveredNode(node.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    style={{ cursor: "pointer" }}
                  >
                    {/* Node rect — flat design, NO glow filter */}
                    <rect
                      x={node.x - 30}
                      y={node.y - 20}
                      width={60}
                      height={40}
                      rx={8}
                      fill={style.fill}
                      stroke={style.stroke}
                      strokeWidth={node.level >= 3 ? 1.5 : 1}
                      opacity={style.opacity}
                    />
                    {/* Abbreviation */}
                    <text
                      x={node.x}
                      y={node.y - 3}
                      textAnchor="middle"
                      fill={style.textFill}
                      fontSize={11}
                      fontWeight={node.level >= 3 ? 600 : 400}
                      fontFamily="monospace"
                    >
                      {abbr}
                    </text>
                    {/* Level / Count */}
                    <text
                      x={node.x}
                      y={node.y + 11}
                      textAnchor="middle"
                      fill={node.level > 0 ? catColor : TEXT.tertiary}
                      fontSize={11}
                      fontWeight={400}
                      fontFamily="monospace"
                    >
                      {node.level > 0 ? `Lv.${node.level} (${node.count})` : "---"}
                    </text>

                    {/* Tooltip on hover */}
                    {isHovered && (
                      <g>
                        <rect
                          x={node.x - 55}
                          y={node.y - 50}
                          width={110}
                          height={22}
                          rx={6}
                          fill="#0a0a0a"
                          stroke="rgba(255,255,255,0.08)"
                          strokeWidth={1}
                        />
                        <text
                          x={node.x}
                          y={node.y - 35}
                          textAnchor="middle"
                          fill={TEXT.primary}
                          fontSize={11}
                          fontWeight={400}
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: "0 20px 12px",
            flexWrap: "wrap",
          }}
        >
          {[0, 1, 2, 3, 4, 5].map((lv) => {
            const lvStyle = getNodeStyle(lv, catColor)
            return (
              <div key={lv} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 4,
                    backgroundColor: lvStyle.fill,
                    border: `1px solid ${lvStyle.stroke}`,
                    opacity: lvStyle.opacity,
                  }}
                />
                <span style={{ fontSize: 11, color: TEXT.secondary }}>
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
