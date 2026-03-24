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

// ─── SVG Flow Renderer (박스 + 연결선) ───────────────────────

const NODE_W = 140
const NODE_H = 52
const GAP_Y = 24
const BRANCH_GAP_X = 160
const PAD = 24

interface FlowNode {
  idx: number
  x: number
  y: number
  step: StrategyStep
}

function layoutFlow(flow: StrategyStep[]): { nodes: FlowNode[]; width: number; height: number } {
  if (flow.length === 0) return { nodes: [], width: 400, height: 100 }

  const nodes: FlowNode[] = []
  const centerX = 300
  let y = PAD

  for (let i = 0; i < flow.length; i++) {
    nodes.push({ idx: i, x: centerX, y, step: flow[i] })
    y += NODE_H + GAP_Y

    // If branches exist, add horizontal space
    const branches = flow[i].branches
    if (branches && branches.length > 1) {
      y += 8
    }
  }

  const maxX = centerX + NODE_W / 2 + BRANCH_GAP_X + PAD
  return { nodes, width: Math.max(600, maxX), height: y + PAD }
}

function FlowSVG({ strategy, onStepClick, selectedStep, onVideoClick }: {
  strategy: Strategy
  onStepClick: (idx: number) => void
  selectedStep: number | null
  onVideoClick?: (url: string) => void
}) {
  const { nodes, width, height } = useMemo(() => layoutFlow(strategy.flow), [strategy.flow])

  return (
    <div className="overflow-x-auto" style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
      <svg width={width} height={height} style={{ display: "block", background: "rgba(255,255,255,0.01)", minWidth: width }}>
        {/* Edges: main flow line */}
        {nodes.map((node, i) => {
          if (i === 0) return null
          const prev = nodes[i - 1]
          return (
            <line
              key={`main-${String(i)}`}
              x1={prev.x} y1={prev.y + NODE_H / 2}
              x2={node.x} y2={node.y - NODE_H / 2}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth={1.5}
            />
          )
        })}

        {/* Branch lines */}
        {nodes.map((node) => {
          const branches = node.step.branches
          if (!branches) return null
          return branches.map((b, bi) => {
            const targetNode = b.nextStepIndex >= 0 ? nodes.find((n) => n.idx === b.nextStepIndex) : null
            if (!targetNode) return null
            const offsetX = (bi + 1) * 20
            const midY = (node.y + NODE_H / 2 + targetNode.y - NODE_H / 2) / 2
            return (
              <g key={`br-${node.idx}-${String(bi)}`}>
                <path
                  d={`M${node.x + NODE_W / 2} ${node.y + 10 + bi * 8}
                      Q${node.x + NODE_W / 2 + offsetX} ${midY}
                      ${targetNode.x + NODE_W / 2 - 4} ${targetNode.y}`}
                  fill="none"
                  stroke={posColor(targetNode.step.positionId)}
                  strokeWidth={1}
                  strokeOpacity={0.3}
                  strokeDasharray="4 3"
                />
                {/* Branch label */}
                <text
                  x={node.x + NODE_W / 2 + offsetX + 4}
                  y={midY}
                  fontSize={9}
                  fill="rgba(255,255,255,0.25)"
                >
                  {b.condition}
                </text>
              </g>
            )
          })
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const color = posColor(node.step.positionId)
          const pos = getPositionById(node.step.positionId)
          const isSelected = selectedStep === node.idx
          const isCore = node.step.action.includes("★")
          const hasVideo = !!node.step.videoUrl

          return (
            <g
              key={node.idx}
              onClick={() => onStepClick(node.idx)}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={node.x - NODE_W / 2}
                y={node.y - NODE_H / 2}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill={isSelected ? `${color}20` : "rgba(255,255,255,0.03)"}
                stroke={color}
                strokeWidth={isSelected ? 2 : isCore ? 1.5 : 1}
                strokeOpacity={isSelected ? 0.8 : 0.3}
              />
              {/* Position name */}
              <text
                x={node.x}
                y={node.y - 6}
                textAnchor="middle"
                fill={color}
                fontSize={11}
                fontWeight={500}
              >
                {pos?.nameKr || node.step.positionId}
              </text>
              {/* Action (truncated) */}
              <text
                x={node.x}
                y={node.y + 10}
                textAnchor="middle"
                fill="rgba(255,255,255,0.5)"
                fontSize={9}
              >
                {node.step.action.replace("★ ", "").slice(0, 22)}{node.step.action.length > 22 ? "…" : ""}
              </text>
              {/* Lesson # badge */}
              {node.step.lessonNumber && (
                <text
                  x={node.x + NODE_W / 2 - 6}
                  y={node.y - NODE_H / 2 + 12}
                  textAnchor="end"
                  fill={color}
                  fontSize={8}
                  opacity={0.6}
                >
                  #{node.step.lessonNumber}
                </text>
              )}
              {/* Video icon */}
              {hasVideo && (
                <text
                  x={node.x - NODE_W / 2 + 8}
                  y={node.y - NODE_H / 2 + 12}
                  fontSize={10}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (onVideoClick && node.step.videoUrl) onVideoClick(node.step.videoUrl)
                  }}
                >
                  📺
                </text>
              )}
              {/* Core marker */}
              {isCore && (
                <text
                  x={node.x - NODE_W / 2 + 8}
                  y={node.y + NODE_H / 2 - 4}
                  fontSize={10}
                  fill={color}
                >
                  ★
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
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
            <FlowSVG
              strategy={selected}
              selectedStep={selectedStep}
              onStepClick={(idx) => setSelectedStep(selectedStep === idx ? null : idx)}
              onVideoClick={(url) => window.open(url, "_blank")}
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
