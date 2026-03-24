"use client"

import { useState, useEffect, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { loadMyStrategies, saveMyStrategies, getAllProStrategies } from "@/lib/sensei/strategies"
import { POSITIONS, getPositionById } from "@/lib/sensei/skillConnections"
import type { Strategy, StrategyStep } from "@/lib/types/sensei"

type ViewMode = "mine" | "pro"

const LAYER_COLORS: Record<string, string> = {
  standing: "#06b6d4", guard: "#a855f7", passing: "#22c55e",
  control: "#f97316", submission: "#ef4444", leglock: "#eab308",
}

function posColor(posId: string): string {
  const pos = getPositionById(posId)
  return pos ? (LAYER_COLORS[pos.layer] || "#a855f7") : "#71717a"
}

function newId(): string {
  return `strat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

// ─── Flow Renderer: absolute div 노드 + SVG 라인 ─────────────

const NODE_W = 160
const NODE_H = 56
const GAP_Y = 100
const PAD = 30

interface FlowNode {
  idx: number
  x: number
  y: number
  step: StrategyStep
}

function layoutFlow(flow: StrategyStep[]): { nodes: FlowNode[]; width: number; height: number } {
  if (flow.length === 0) return { nodes: [], width: 400, height: 80 }
  const nodes: FlowNode[] = []
  const centerX = 280
  for (let i = 0; i < flow.length; i++) {
    nodes.push({ idx: i, x: centerX, y: PAD + i * GAP_Y, step: flow[i] })
  }
  return { nodes, width: Math.max(620, centerX + NODE_W / 2 + 200), height: PAD + flow.length * GAP_Y + NODE_H }
}

function FlowChart({ strategy, onStepClick, selectedStep }: {
  strategy: Strategy
  onStepClick: (idx: number) => void
  selectedStep: number | null
}) {
  const { nodes, width, height } = useMemo(() => layoutFlow(strategy.flow), [strategy.flow])

  // Connected set for dim logic
  const connectedIds = useMemo(() => {
    if (selectedStep === null) return null
    const ids = new Set<number>([selectedStep])
    const step = strategy.flow[selectedStep]
    if (step?.branches) {
      for (const b of step.branches) {
        if (b.nextStepIndex >= 0) ids.add(b.nextStepIndex)
      }
    }
    // Also find steps that branch TO this one
    strategy.flow.forEach((s, i) => {
      if (s.branches?.some((b) => b.nextStepIndex === selectedStep)) ids.add(i)
    })
    return ids
  }, [selectedStep, strategy.flow])

  return (
    <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ position: "relative", width, height, minWidth: width, background: "rgba(255,255,255,0.01)" }}>

        {/* SVG layer: lines only (z-0) */}
        <svg style={{ position: "absolute", top: 0, left: 0, width, height, zIndex: 0, pointerEvents: "none" }}>
          {/* Main sequential lines */}
          {nodes.map((node, i) => {
            if (i === 0) return null
            const prev = nodes[i - 1]
            const dimmed = connectedIds && (!connectedIds.has(i) || !connectedIds.has(i - 1))
            return (
              <line
                key={`seq-${String(i)}`}
                x1={prev.x} y1={prev.y + NODE_H}
                x2={node.x} y2={node.y}
                stroke={dimmed ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.08)"}
                strokeWidth={1.2}
              />
            )
          })}

          {/* Branch lines */}
          {nodes.map((node) => {
            const branches = node.step.branches
            if (!branches) return null
            return branches.map((b, bi) => {
              const target = b.nextStepIndex >= 0 ? nodes.find((n) => n.idx === b.nextStepIndex) : null
              if (!target) return null
              const isHighlighted = connectedIds?.has(node.idx) && connectedIds?.has(target.idx)
              const dimmed = connectedIds && !isHighlighted
              const color = isHighlighted ? posColor(target.step.positionId) : "rgba(255,255,255,0.08)"

              // Curved path: exit right side, curve to target
              const exitX = node.x + NODE_W / 2
              const exitY = node.y + NODE_H / 2 + bi * 6
              const enterX = target.x + NODE_W / 2
              const enterY = target.y + NODE_H / 2
              const cpX = Math.max(exitX, enterX) + 40 + bi * 30

              return (
                <path
                  key={`br-${node.idx}-${String(bi)}`}
                  d={`M${exitX},${exitY} C${cpX},${exitY} ${cpX},${enterY} ${enterX},${enterY}`}
                  fill="none"
                  stroke={dimmed ? "rgba(255,255,255,0.03)" : color}
                  strokeWidth={isHighlighted ? 2.5 : 1.2}
                  strokeOpacity={dimmed ? 0.3 : isHighlighted ? 0.7 : 0.4}
                />
              )
            })
          })}
        </svg>

        {/* Div layer: nodes (z-10) */}
        {nodes.map((node) => {
          const color = posColor(node.step.positionId)
          const pos = getPositionById(node.step.positionId)
          const isSelected = selectedStep === node.idx
          const isHub = node.step.action.includes("★")
          const dimmed = connectedIds && !connectedIds.has(node.idx)

          return (
            <div
              key={node.idx}
              onClick={() => onStepClick(node.idx)}
              style={{
                position: "absolute",
                left: node.x - NODE_W / 2,
                top: node.y,
                width: NODE_W,
                height: NODE_H,
                zIndex: 10,
                cursor: "pointer",
                transition: "opacity 150ms ease",
                opacity: dimmed ? 0.12 : 1,
              }}
            >
              <div
                className="w-full h-full rounded-lg flex flex-col items-center justify-center gap-0.5 px-2"
                style={{
                  background: `rgba(${hexRgb(color)},${isSelected ? 0.15 : 0.06})`,
                  border: `${isHub ? 2.5 : 1.5}px solid rgba(${hexRgb(color)},${isSelected ? 0.6 : 0.3})`,
                }}
              >
                <div className="flex items-center gap-1.5">
                  {isHub && <span style={{ color, fontSize: 10 }}>★</span>}
                  <span className="text-[11px] font-medium" style={{ color }}>
                    {pos?.nameKr || node.step.positionId}
                  </span>
                  {node.step.lessonNumber && (
                    <a
                      href={node.step.videoUrl || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[9px] hover:underline"
                      style={{ color, opacity: 0.6 }}
                    >
                      #{node.step.lessonNumber}
                    </a>
                  )}
                  {node.step.videoUrl && !node.step.lessonNumber && (
                    <a
                      href={node.step.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px]"
                    >
                      📺
                    </a>
                  )}
                </div>
                <span className="text-[9px] text-center leading-tight" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {node.step.action.replace("★ ", "").slice(0, 28)}{node.step.action.length > 28 ? "…" : ""}
                </span>
              </div>
            </div>
          )
        })}

        {/* Branch condition labels (absolute div on midpoint) */}
        {nodes.map((node) => {
          const branches = node.step.branches
          if (!branches) return null
          return branches.map((b, bi) => {
            const target = b.nextStepIndex >= 0 ? nodes.find((n) => n.idx === b.nextStepIndex) : null
            if (!target) return null
            const dimmed = connectedIds && !(connectedIds.has(node.idx) && connectedIds.has(target.idx))
            const midX = Math.max(node.x + NODE_W / 2, target.x + NODE_W / 2) + 50 + bi * 30
            const midY = (node.y + NODE_H / 2 + target.y + NODE_H / 2) / 2

            return (
              <div
                key={`lbl-${node.idx}-${String(bi)}`}
                onClick={() => onStepClick(target.idx)}
                style={{
                  position: "absolute",
                  left: midX - 4,
                  top: midY - 8,
                  zIndex: 15,
                  cursor: "pointer",
                  opacity: dimmed ? 0.12 : 1,
                  transition: "opacity 150ms ease",
                }}
              >
                <span className="text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap" style={{
                  color: "rgba(255,255,255,0.4)",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}>
                  {b.condition}
                </span>
              </div>
            )
          })
        })}
      </div>
    </div>
  )
}

function hexRgb(hex: string): string {
  const h = hex.startsWith("#") ? hex.slice(1) : hex
  if (h.length < 6) return "168,85,247"
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`
}

// ─── Strategy Builder (자연어 + 클릭 선택) ───────────────────

function StepBuilder({ onAdd }: { onAdd: (step: StrategyStep) => void }) {
  const [mode, setMode] = useState<"text" | "pick">("pick")
  const [textInput, setTextInput] = useState("")
  const [pickLayer, setPickLayer] = useState<string | null>(null)
  const [selectedPosId, setSelectedPosId] = useState<string | null>(null)
  const [action, setAction] = useState("")
  const [notes, setNotes] = useState("")

  const layers = ["standing", "guard", "passing", "control", "submission", "leglock"]
  const layerLabels: Record<string, string> = {
    standing: "스탠딩", guard: "가드", passing: "패싱", control: "컨트롤", submission: "서브미션", leglock: "레그락",
  }

  const filteredPositions = pickLayer
    ? POSITIONS.filter((p) => p.layer === pickLayer)
    : POSITIONS.filter((p) => p.layer !== "submission")

  function handleTextSubmit() {
    if (!textInput.trim()) return
    // Parse simple patterns: "하프가드에서 스윕" → positionId: hg, action: 스윕
    const step: StrategyStep = {
      positionId: "hg", // default, user can edit
      action: textInput.trim(),
    }
    // Try to detect position from text
    const posMap: Record<string, string> = {
      "스탠딩": "standing", "클로즈": "closed", "하프": "hg", "딥하프": "dhg",
      "니쉴드": "kshield", "싯업": "situp", "오픈": "open", "DLR": "dlr",
      "버터플라이": "butterfly", "SLX": "slx", "사이드": "side_top",
      "마운트": "mount_top", "백": "back_top", "터틀": "turtle_top",
    }
    for (const [keyword, posId] of Object.entries(posMap)) {
      if (textInput.includes(keyword)) {
        step.positionId = posId
        break
      }
    }
    onAdd(step)
    setTextInput("")
  }

  function handlePickSubmit() {
    if (!selectedPosId || !action.trim()) return
    onAdd({
      positionId: selectedPosId,
      action: action.trim(),
      notes: notes.trim() || undefined,
    })
    setSelectedPosId(null)
    setAction("")
    setNotes("")
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-400">스텝 추가:</span>
        <button
          onClick={() => setMode("text")}
          className={`px-2 py-1 rounded text-xs ${mode === "text" ? "bg-zinc-800 text-white" : "text-zinc-500"}`}
        >
          자연어 입력
        </button>
        <button
          onClick={() => setMode("pick")}
          className={`px-2 py-1 rounded text-xs ${mode === "pick" ? "bg-zinc-800 text-white" : "text-zinc-500"}`}
        >
          클릭 선택
        </button>
      </div>

      {mode === "text" ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleTextSubmit() }}
            placeholder="예: 하프가드에서 언더훅 잡고 코요테 스윕"
            className="flex-1 px-3 py-2 rounded-lg text-xs text-white bg-zinc-800 border border-zinc-700 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          />
          <Button size="sm" onClick={handleTextSubmit} disabled={!textInput.trim()}>추가</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Layer filter */}
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setPickLayer(null)}
              className={`px-2 py-0.5 rounded text-[10px] ${!pickLayer ? "bg-zinc-800 text-white" : "text-zinc-500"}`}
            >
              전체
            </button>
            {layers.map((l) => (
              <button
                key={l}
                onClick={() => setPickLayer(l)}
                className={`px-2 py-0.5 rounded text-[10px] ${pickLayer === l ? "text-white" : "text-zinc-500"}`}
                style={pickLayer === l ? { background: `${LAYER_COLORS[l]}20`, color: LAYER_COLORS[l] } : {}}
              >
                {layerLabels[l]}
              </button>
            ))}
          </div>

          {/* Position picker */}
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {filteredPositions.map((p) => {
              const c = LAYER_COLORS[p.layer] || "#a855f7"
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPosId(p.id)}
                  className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                    selectedPosId === p.id ? "text-white" : "text-zinc-500 border-zinc-800"
                  }`}
                  style={selectedPosId === p.id ? { background: `${c}20`, borderColor: `${c}40`, color: c } : {}}
                >
                  {p.nameKr}
                </button>
              )
            })}
          </div>

          {selectedPosId && (
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <input
                type="text"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="이 포지션에서 할 행동 (예: 언더훅 잡고 스윕)"
                className="w-full px-3 py-2 rounded-lg text-xs text-white bg-zinc-800 border border-zinc-700 placeholder:text-zinc-600 focus:outline-none"
              />
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="메모 (선택)"
                className="w-full px-3 py-1.5 rounded-lg text-xs text-white bg-zinc-800 border border-zinc-700 placeholder:text-zinc-600 focus:outline-none"
              />
              <Button size="sm" onClick={handlePickSubmit} disabled={!action.trim()}>스텝 추가</Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Step Editor (인라인 수정) ───────────────────────────────

function StepEditor({ step, onChange, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: {
  step: StrategyStep
  onChange: (s: StrategyStep) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  const pos = getPositionById(step.positionId)
  const color = posColor(step.positionId)

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 justify-between">
        <span className="text-xs font-medium" style={{ color }}>{pos?.nameKr || step.positionId}</span>
        <div className="flex gap-1">
          <button onClick={onMoveUp} disabled={!canMoveUp} className="text-[10px] text-zinc-600 hover:text-zinc-300 disabled:opacity-30">↑</button>
          <button onClick={onMoveDown} disabled={!canMoveDown} className="text-[10px] text-zinc-600 hover:text-zinc-300 disabled:opacity-30">↓</button>
          <button onClick={onDelete} className="text-[10px] text-red-500/50 hover:text-red-400">삭제</button>
        </div>
      </div>
      <input
        type="text"
        value={step.action}
        onChange={(e) => onChange({ ...step, action: e.target.value })}
        className="w-full px-2 py-1 rounded text-xs text-white bg-zinc-800 border border-zinc-700 focus:outline-none"
      />
      <input
        type="text"
        value={step.notes || ""}
        onChange={(e) => onChange({ ...step, notes: e.target.value || undefined })}
        placeholder="메모 (선택)"
        className="w-full px-2 py-1 rounded text-[11px] text-zinc-400 bg-zinc-800 border border-zinc-700 placeholder:text-zinc-600 focus:outline-none"
      />
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────

export function SenseiStrategy() {
  const [viewMode, setViewMode] = useState<ViewMode>("mine")
  const [mounted, setMounted] = useState(false)
  const [myStrategies, setMyStrategies] = useState<Strategy[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedStep, setSelectedStep] = useState<number | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [showBuilder, setShowBuilder] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState("")
  const [newRuleSet, setNewRuleSet] = useState<"gi" | "nogi">("gi")

  const proStrategies = useMemo(() => getAllProStrategies(), [])

  useEffect(() => {
    setMyStrategies(loadMyStrategies())
    setMounted(true)
  }, [])

  function persist(updated: Strategy[]) {
    setMyStrategies(updated)
    saveMyStrategies(updated)
  }

  const strategies = viewMode === "mine" ? myStrategies : proStrategies
  const selected = strategies.find((s) => s.id === selectedId) ?? strategies[0] ?? null

  useEffect(() => {
    if (strategies.length > 0 && !strategies.find((s) => s.id === selectedId)) {
      setSelectedId(strategies[0].id)
      setSelectedStep(null)
      setEditMode(false)
    }
  }, [viewMode, strategies, selectedId])

  // CRUD
  function createStrategy() {
    if (!newName.trim()) return
    const s: Strategy = {
      id: newId(),
      name: newName.trim(),
      ruleSet: newRuleSet,
      type: "mine",
      flow: [],
      createdAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString().slice(0, 10),
    }
    const updated = [...myStrategies, s]
    persist(updated)
    setSelectedId(s.id)
    setShowNewForm(false)
    setNewName("")
    setEditMode(true)
    setShowBuilder(true)
  }

  function deleteStrategy(id: string) {
    persist(myStrategies.filter((s) => s.id !== id))
    setSelectedId(null)
  }

  function importProStrategy(pro: Strategy) {
    const imported: Strategy = {
      ...pro,
      id: newId(),
      name: `${pro.proName}의 게임플랜 (복사)`,
      type: "mine",
      proName: undefined,
      createdAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString().slice(0, 10),
    }
    const updated = [...myStrategies, imported]
    persist(updated)
    setViewMode("mine")
    setSelectedId(imported.id)
  }

  function addStep(step: StrategyStep) {
    if (!selected || selected.type !== "mine") return
    const updated = myStrategies.map((s) =>
      s.id === selected.id
        ? { ...s, flow: [...s.flow, step], updatedAt: new Date().toISOString().slice(0, 10) }
        : s
    )
    persist(updated)
  }

  function updateStep(idx: number, step: StrategyStep) {
    if (!selected || selected.type !== "mine") return
    const updated = myStrategies.map((s) =>
      s.id === selected.id
        ? { ...s, flow: s.flow.map((st, i) => (i === idx ? step : st)), updatedAt: new Date().toISOString().slice(0, 10) }
        : s
    )
    persist(updated)
  }

  function deleteStep(idx: number) {
    if (!selected || selected.type !== "mine") return
    const updated = myStrategies.map((s) =>
      s.id === selected.id
        ? { ...s, flow: s.flow.filter((_, i) => i !== idx), updatedAt: new Date().toISOString().slice(0, 10) }
        : s
    )
    persist(updated)
    setSelectedStep(null)
  }

  function moveStep(idx: number, dir: -1 | 1) {
    if (!selected || selected.type !== "mine") return
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= selected.flow.length) return
    const updated = myStrategies.map((s) => {
      if (s.id !== selected.id) return s
      const flow = [...s.flow]
      const temp = flow[idx]
      flow[idx] = flow[newIdx]
      flow[newIdx] = temp
      return { ...s, flow, updatedAt: new Date().toISOString().slice(0, 10) }
    })
    persist(updated)
    setSelectedStep(newIdx)
  }

  if (!mounted) {
    return <div className="text-sm text-zinc-500 p-8 text-center">로딩 중...</div>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* ═══ Top Bar ═══ */}
      <div className="bg-[#121212] border border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1">
            <button
              onClick={() => { setViewMode("mine"); setEditMode(false); setSelectedStep(null) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === "mine" ? "bg-orange-500/15 text-orange-400 border border-orange-500/30" : "text-zinc-500 border border-zinc-800"
              }`}
            >
              내 전략
            </button>
            <button
              onClick={() => { setViewMode("pro"); setEditMode(false); setSelectedStep(null) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === "pro" ? "bg-blue-500/15 text-blue-400 border border-blue-500/30" : "text-zinc-500 border border-zinc-800"
              }`}
            >
              선수 전략
            </button>
          </div>

          <div className="h-4 w-px bg-zinc-800" />

          <div className="flex gap-1.5 flex-wrap flex-1">
            {strategies.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSelectedId(s.id); setSelectedStep(null); setEditMode(false) }}
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                  selected?.id === s.id ? "bg-zinc-800 text-white border border-zinc-700" : "text-zinc-500 border border-zinc-800/50 hover:text-zinc-300"
                }`}
              >
                {s.proName || s.name}
              </button>
            ))}
          </div>

          {viewMode === "mine" && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-zinc-700 text-zinc-400"
              onClick={() => setShowNewForm(!showNewForm)}
            >
              + 새 전략
            </Button>
          )}
        </div>

        {/* New strategy form */}
        {showNewForm && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createStrategy() }}
              placeholder="전략 이름"
              className="flex-1 px-3 py-1.5 rounded-lg text-xs text-white bg-zinc-800 border border-zinc-700 placeholder:text-zinc-600 focus:outline-none"
            />
            <select
              value={newRuleSet}
              onChange={(e) => setNewRuleSet(e.target.value as "gi" | "nogi")}
              className="px-2 py-1.5 rounded-lg text-xs bg-zinc-800 border border-zinc-700 text-white"
            >
              <option value="gi">Gi</option>
              <option value="nogi">NoGi</option>
            </select>
            <Button size="sm" onClick={createStrategy} disabled={!newName.trim()}>생성</Button>
          </div>
        )}
      </div>

      {/* ═══ Strategy Content ═══ */}
      {selected && (
        <div className="bg-[#121212] border border-zinc-800 rounded-2xl p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="text-base font-semibold text-white">{selected.name}</h2>
                <Badge className="text-[10px] border-zinc-700 bg-zinc-800 text-zinc-400">{selected.ruleSet.toUpperCase()}</Badge>
                {selected.proName && <Badge className="text-[10px] border-blue-500/30 bg-blue-500/10 text-blue-400">{selected.proName}</Badge>}
              </div>
              {selected.description && <p className="text-xs text-zinc-500">{selected.description}</p>}
            </div>
            <div className="flex gap-2">
              {/* Import button (pro → mine) */}
              {viewMode === "pro" && (
                <Button size="sm" variant="outline" className="text-xs border-zinc-700 text-zinc-400" onClick={() => importProStrategy(selected)}>
                  내 전략으로 가져오기
                </Button>
              )}
              {/* Edit toggle (mine only) */}
              {viewMode === "mine" && selected.type === "mine" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className={`text-xs ${editMode ? "border-orange-500/30 text-orange-400" : "border-zinc-700 text-zinc-400"}`}
                    onClick={() => { setEditMode(!editMode); setShowBuilder(!editMode) }}
                  >
                    {editMode ? "편집 완료" : "편집"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs border-red-500/20 text-red-400/60 hover:text-red-400"
                    onClick={() => deleteStrategy(selected.id)}
                  >
                    삭제
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* SVG Flow Chart */}
          {selected.flow.length > 0 ? (
            <FlowChart
              strategy={selected}
              selectedStep={selectedStep}
              onStepClick={(idx: number) => setSelectedStep(selectedStep === idx ? null : idx)}
            />
          ) : (
            <div className="text-center py-8 text-xs text-zinc-600">
              아직 스텝이 없습니다. 아래에서 추가하세요.
            </div>
          )}

          {/* Selected step detail */}
          {selectedStep !== null && selected.flow[selectedStep] && (
            <div className="mt-3 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-2">
              {editMode && selected.type === "mine" ? (
                <StepEditor
                  step={selected.flow[selectedStep]}
                  onChange={(s) => updateStep(selectedStep, s)}
                  onDelete={() => deleteStep(selectedStep)}
                  onMoveUp={() => moveStep(selectedStep, -1)}
                  onMoveDown={() => moveStep(selectedStep, 1)}
                  canMoveUp={selectedStep > 0}
                  canMoveDown={selectedStep < selected.flow.length - 1}
                />
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium" style={{ color: posColor(selected.flow[selectedStep].positionId) }}>
                      {getPositionById(selected.flow[selectedStep].positionId)?.nameKr}
                    </span>
                    {selected.flow[selectedStep].lessonNumber && (
                      <span className="text-[10px] text-zinc-600">#{selected.flow[selectedStep].lessonNumber}</span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-300">{selected.flow[selectedStep].action}</p>
                  {selected.flow[selectedStep].notes && (
                    <p className="text-[11px] text-zinc-500">{selected.flow[selectedStep].notes}</p>
                  )}
                  {selected.flow[selectedStep].videoUrl && (
                    <a
                      href={selected.flow[selectedStep].videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300"
                    >
                      📺 교본 영상 보기
                    </a>
                  )}
                  {selected.flow[selectedStep].branches && selected.flow[selectedStep].branches!.length > 0 && (
                    <div className="pt-2 border-t border-zinc-800 space-y-1">
                      {selected.flow[selectedStep].branches!.map((b, bi) => {
                        const target = b.nextStepIndex >= 0 && b.nextStepIndex < selected.flow.length
                          ? getPositionById(selected.flow[b.nextStepIndex].positionId)
                          : null
                        return (
                          <div key={String(bi)} className="flex items-center gap-1.5 text-[11px]">
                            <span className="text-zinc-600">↳</span>
                            <span className="text-zinc-500 italic">{b.condition}</span>
                            {target && (
                              <>
                                <span className="text-zinc-700">→</span>
                                <button
                                  onClick={() => setSelectedStep(b.nextStepIndex)}
                                  className="font-medium hover:underline"
                                  style={{ color: posColor(selected.flow[b.nextStepIndex].positionId) }}
                                >
                                  {target.nameKr}
                                </button>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step Builder (edit mode) */}
          {editMode && showBuilder && selected.type === "mine" && (
            <div className="mt-4">
              <StepBuilder onAdd={addStep} />
            </div>
          )}

          {/* Tags */}
          {selected.tags && selected.tags.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-wrap gap-1.5">
              {selected.tags.map((tag) => (
                <span key={tag} className="text-[10px] text-zinc-500 px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900">{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
