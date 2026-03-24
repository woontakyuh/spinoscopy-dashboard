"use client"

import { useState, useEffect, useMemo, useRef } from "react"
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

// ─── Flow Renderer: BFS layout + drag + persist ──────────────

const NODE_W = 160
const NODE_H = 56

function hexRgb(hex: string): string {
  const h = hex.startsWith("#") ? hex.slice(1) : hex
  if (h.length < 6) return "168,85,247"
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`
}

// BFS auto layout: 분기 있으면 좌우로 퍼짐
function autoLayout(flow: StrategyStep[]): Record<number, { x: number; y: number }> {
  if (flow.length === 0) return {}

  // Build adjacency from branches
  const childrenOf = new Map<number, number[]>()
  const hasParent = new Set<number>()
  flow.forEach((step, i) => {
    const targets: number[] = []
    if (step.branches) {
      for (const b of step.branches) {
        if (b.nextStepIndex >= 0 && b.nextStepIndex < flow.length) {
          targets.push(b.nextStepIndex)
          hasParent.add(b.nextStepIndex)
        }
      }
    }
    // Also connect sequential next if no branches point forward
    if (i + 1 < flow.length && !targets.includes(i + 1)) {
      targets.push(i + 1)
      hasParent.add(i + 1)
    }
    childrenOf.set(i, targets)
  })

  // BFS level assignment
  const levels = new Map<number, number>()
  const roots = flow.map((_, i) => i).filter((i) => !hasParent.has(i) || i === 0)
  const queue: { idx: number; level: number }[] = roots.map((idx) => ({ idx, level: 0 }))
  while (queue.length > 0) {
    const { idx, level } = queue.shift()!
    if (levels.has(idx)) continue
    levels.set(idx, level)
    const children = childrenOf.get(idx) || []
    for (const c of children) {
      if (!levels.has(c)) queue.push({ idx: c, level: level + 1 })
    }
  }
  // Assign remaining unvisited
  flow.forEach((_, i) => { if (!levels.has(i)) levels.set(i, (levels.size > 0 ? Math.max(...levels.values()) : 0) + 1) })

  // Group by level
  const groups = new Map<number, number[]>()
  levels.forEach((lv, idx) => {
    if (!groups.has(lv)) groups.set(lv, [])
    groups.get(lv)!.push(idx)
  })

  const positions: Record<number, { x: number; y: number }> = {}
  const sortedLevels = Array.from(groups.keys()).sort((a, b) => a - b)
  for (const lv of sortedLevels) {
    const group = groups.get(lv)!
    const totalW = group.length * (NODE_W + 40)
    const startX = Math.max(20, (700 - totalW) / 2)
    group.forEach((idx, gi) => {
      positions[idx] = { x: startX + gi * (NODE_W + 40) + NODE_W / 2, y: lv * 120 + 40 }
    })
  }
  return positions
}

// localStorage persist
function loadPositions(strategyId: string): Record<number, { x: number; y: number }> | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(`sensei-strategy-${strategyId}-positions`)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

function savePositions(strategyId: string, pos: Record<number, { x: number; y: number }>): void {
  if (typeof window === "undefined") return
  localStorage.setItem(`sensei-strategy-${strategyId}-positions`, JSON.stringify(pos))
}

function FlowChart({ strategy, onStepClick, selectedStep, editMode, onAddFromNode, onDeleteStep, onUpdateStepVideo }: {
  strategy: Strategy
  onStepClick: (idx: number) => void
  selectedStep: number | null
  editMode: boolean
  onAddFromNode?: (fromIdx: number, step: StrategyStep) => void
  onDeleteStep?: (idx: number) => void
  onUpdateStepVideo?: (idx: number, url: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [positions, setPositions] = useState<Record<number, { x: number; y: number }>>({})
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const dragStartPos = useRef<{ x: number; y: number } | null>(null)
  const hasMoved = useRef(false)
  // Context menu for "새 스텝 추가"
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; stepIdx: number } | null>(null)

  // Init positions
  useEffect(() => {
    const saved = loadPositions(strategy.id)
    if (saved && Object.keys(saved).length === strategy.flow.length) {
      setPositions(saved)
    } else {
      setPositions(autoLayout(strategy.flow))
    }
  }, [strategy.id, strategy.flow])

  // Save on edit mode exit
  useEffect(() => {
    if (!editMode) {
      setPositions((cur) => {
        if (Object.keys(cur).length > 0) savePositions(strategy.id, cur)
        return cur
      })
    }
  }, [editMode, strategy.id])

  // Pointer-capture drag: most reliable, works even outside element
  function onPointerDown(e: React.PointerEvent, idx: number) {
    if (!editMode) return
    if (e.button !== 0) return // 왼클릭만 드래그 (우클릭은 컨텍스트메뉴용)
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const pos = positions[idx]
    if (!pos) return
    dragStartPos.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    hasMoved.current = false
    setDraggingIdx(idx)
  }

  function onPointerMove(e: React.PointerEvent, idx: number) {
    if (draggingIdx !== idx || !dragStartPos.current) return
    hasMoved.current = true
    const newX = e.clientX - dragStartPos.current.x
    const newY = e.clientY - dragStartPos.current.y
    setPositions((prev) => ({
      ...prev,
      [idx]: { x: Math.max(NODE_W / 2, newX), y: Math.max(NODE_H / 2, newY) },
    }))
  }

  function onPointerUp(e: React.PointerEvent, idx: number) {
    if (draggingIdx !== idx) return
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    dragStartPos.current = null
    setDraggingIdx(null)
  }

  function handleNodeClick(idx: number) {
    if (editMode && hasMoved.current) return
    if (!editMode) onStepClick(idx)
  }

  function handleContextMenu(e: React.MouseEvent, idx: number) {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, stepIdx: idx })
  }

  // Connected set for dim
  const connectedIds = useMemo(() => {
    if (selectedStep === null || editMode) return null
    const ids = new Set<number>([selectedStep])
    const step = strategy.flow[selectedStep]
    if (step?.branches) {
      for (const b of step.branches) { if (b.nextStepIndex >= 0) ids.add(b.nextStepIndex) }
    }
    strategy.flow.forEach((s, i) => {
      if (s.branches?.some((b) => b.nextStepIndex === selectedStep)) ids.add(i)
    })
    return ids
  }, [selectedStep, strategy.flow, editMode])

  // Canvas size
  const canvasW = useMemo(() => {
    let maxX = 600
    for (const p of Object.values(positions)) { if (p.x + NODE_W / 2 + 30 > maxX) maxX = p.x + NODE_W / 2 + 30 }
    return maxX
  }, [positions])
  const canvasH = useMemo(() => {
    let maxY = 200
    for (const p of Object.values(positions)) { if (p.y + NODE_H + 30 > maxY) maxY = p.y + NODE_H + 30 }
    return maxY
  }, [positions])

  // Build edges
  const edges = useMemo(() => {
    const result: { fromIdx: number; toIdx: number; condition: string; isBranch: boolean }[] = []
    strategy.flow.forEach((step, i) => {
      // Sequential
      if (i + 1 < strategy.flow.length) {
        const hasBranchToNext = step.branches?.some((b) => b.nextStepIndex === i + 1)
        if (!hasBranchToNext) {
          result.push({ fromIdx: i, toIdx: i + 1, condition: "", isBranch: false })
        }
      }
      // Branches
      if (step.branches) {
        for (const b of step.branches) {
          if (b.nextStepIndex >= 0 && b.nextStepIndex < strategy.flow.length) {
            result.push({ fromIdx: i, toIdx: b.nextStepIndex, condition: b.condition, isBranch: true })
          }
        }
      }
    })
    return result
  }, [strategy.flow])

  if (Object.keys(positions).length === 0) return null

  return (
    <div
      ref={containerRef}
      className="overflow-auto rounded-lg"
      style={{ border: "1px solid rgba(255,255,255,0.06)", position: "relative", minHeight: Math.max(canvasH, 200) }}
    >
      <div style={{ width: canvasW, height: canvasH, position: "relative" }}>
        {/* SVG: lines (z-0) */}
        <svg style={{ position: "absolute", top: 0, left: 0, width: canvasW, height: canvasH, zIndex: 0, pointerEvents: "none" }}>
          {edges.map((edge, i) => {
            const from = positions[edge.fromIdx]
            const to = positions[edge.toIdx]
            if (!from || !to) return null
            const isHighlighted = connectedIds?.has(edge.fromIdx) && connectedIds?.has(edge.toIdx)
            const dimmed = connectedIds && !isHighlighted
            const color = isHighlighted ? posColor(strategy.flow[edge.toIdx]?.positionId || "") : "rgba(255,255,255,0.08)"

            if (!edge.isBranch) {
              // Straight sequential line
              return (
                <line
                  key={`e-${String(i)}`}
                  x1={from.x} y1={from.y + NODE_H / 2}
                  x2={to.x} y2={to.y - NODE_H / 2}
                  stroke={dimmed ? "rgba(255,255,255,0.03)" : isHighlighted ? color : "rgba(255,255,255,0.08)"}
                  strokeWidth={isHighlighted ? 2.5 : 1.2}
                  strokeOpacity={dimmed ? 0.3 : isHighlighted ? 0.5 : 0.15}
                />
              )
            }

            // Branch curve
            const exitX = from.x + NODE_W / 2 - 10
            const exitY = from.y + NODE_H / 4
            const enterX = to.x - NODE_W / 2 + 10
            const enterY = to.y
            const midX = (exitX + enterX) / 2 + Math.abs(edge.toIdx - edge.fromIdx) * 15
            return (
              <path
                key={`e-${String(i)}`}
                d={`M${exitX},${exitY} C${midX},${exitY} ${midX},${enterY} ${enterX},${enterY}`}
                fill="none"
                stroke={dimmed ? "rgba(255,255,255,0.03)" : isHighlighted ? color : "rgba(255,255,255,0.06)"}
                strokeWidth={isHighlighted ? 2.5 : 1.2}
                strokeDasharray={edge.isBranch ? "6,3" : undefined}
                strokeOpacity={dimmed ? 0.3 : isHighlighted ? 0.5 : 0.1}
              />
            )
          })}
        </svg>

        {/* Nodes (z-10) */}
        {strategy.flow.map((step, idx) => {
          const pos = positions[idx]
          if (!pos) return null
          const color = posColor(step.positionId)
          const posInfo = getPositionById(step.positionId)
          const isSelected = selectedStep === idx
          const isHub = step.action.includes("★")
          const dimmed = connectedIds && !connectedIds.has(idx)

          return (
            <div
              key={idx}
              onPointerDown={(e) => onPointerDown(e, idx)}
              onPointerMove={(e) => onPointerMove(e, idx)}
              onPointerUp={(e) => onPointerUp(e, idx)}
              onClick={() => handleNodeClick(idx)}
              onContextMenu={(e) => handleContextMenu(e, idx)}
              style={{
                position: "absolute",
                left: pos.x - NODE_W / 2,
                top: pos.y - NODE_H / 2,
                width: NODE_W,
                zIndex: draggingIdx === idx ? 100 : 10,
                cursor: editMode ? (draggingIdx === idx ? "grabbing" : "grab") : "pointer",
                opacity: dimmed ? 0.12 : 1,
                transition: draggingIdx === idx ? "none" : "opacity 150ms ease",
              }}
            >
              <div
                className="w-full rounded-xl flex flex-col items-center justify-center gap-0.5 px-3 py-2"
                style={{
                  background: `rgba(${hexRgb(color)},${isSelected ? 0.15 : 0.06})`,
                  border: `${isHub ? 2.5 : 1.5}px solid rgba(${hexRgb(color)},${isSelected ? 0.6 : 0.3})`,
                }}
              >
                <div className="flex items-center gap-1.5">
                  {isHub && <span style={{ color, fontSize: 10 }}>★</span>}
                  <span className="text-[11px] font-medium" style={{ color }}>
                    {posInfo?.nameKr || step.positionId}
                  </span>
                  {step.lessonNumber && (
                    <a
                      href={step.videoUrl || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[9px] hover:underline"
                      style={{ color, opacity: 0.6 }}
                    >
                      #{step.lessonNumber}
                    </a>
                  )}
                </div>
                <span className="text-[9px] text-center leading-tight" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {step.action.replace("★ ", "").slice(0, 30)}{step.action.length > 30 ? "…" : ""}
                </span>
              </div>
            </div>
          )
        })}

        {/* Branch condition labels (z-15) */}
        {edges.filter((e) => e.isBranch && e.condition).map((edge, i) => {
          const from = positions[edge.fromIdx]
          const to = positions[edge.toIdx]
          if (!from || !to) return null
          const dimmed = connectedIds && !(connectedIds.has(edge.fromIdx) && connectedIds.has(edge.toIdx))
          const midX = (from.x + NODE_W / 2 + to.x - NODE_W / 2) / 2 + Math.abs(edge.toIdx - edge.fromIdx) * 8
          const midY = (from.y + to.y) / 2

          return (
            <div
              key={`lbl-${String(i)}`}
              onClick={() => onStepClick(edge.toIdx)}
              style={{
                position: "absolute",
                left: midX,
                top: midY - 8,
                zIndex: 15,
                cursor: "pointer",
                opacity: dimmed ? 0.12 : 1,
                transition: "opacity 150ms ease",
              }}
            >
              <span className="text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap" style={{
                color: "rgba(255,255,255,0.4)",
                background: "rgba(10,10,10,0.8)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                {edge.condition}
              </span>
            </div>
          )
        })}
        {/* Context menu: 새 스텝 추가 (편집 모드 우클릭) */}
        {ctxMenu && (
          <ContextAddMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            currentVideoUrl={strategy.flow[ctxMenu.stepIdx]?.videoUrl}
            onSelect={(posId, action) => {
              if (onAddFromNode) {
                onAddFromNode(ctxMenu.stepIdx, { positionId: posId, action })
              }
              setCtxMenu(null)
            }}
            onDelete={() => {
              if (onDeleteStep) onDeleteStep(ctxMenu.stepIdx)
              setCtxMenu(null)
            }}
            onAddVideo={(url) => {
              if (onUpdateStepVideo) onUpdateStepVideo(ctxMenu.stepIdx, url)
              setCtxMenu(null)
            }}
            onClose={() => setCtxMenu(null)}
          />
        )}
      </div>
    </div>
  )
}

// ─── Context Menu: 새 스텝 추가 ──────────────────────────────

function ContextAddMenu({ x, y, onSelect, onDelete, onAddVideo, onClose, currentVideoUrl }: {
  x: number; y: number
  onSelect: (posId: string, action: string) => void
  onDelete: () => void
  onAddVideo: (url: string) => void
  onClose: () => void
  currentVideoUrl?: string
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [showVideoInput, setShowVideoInput] = useState(false)
  const [videoUrl, setVideoUrl] = useState(currentVideoUrl || "")
  const [filterLayer, setFilterLayer] = useState<string | null>(null)
  const [selectedPos, setSelectedPos] = useState<string | null>(null)
  const [action, setAction] = useState("")

  const layers = ["guard", "passing", "control", "submission", "standing", "leglock"]
  const layerLabels: Record<string, string> = {
    standing: "스탠딩", guard: "가드", passing: "패싱", control: "컨트롤", submission: "서브미션", leglock: "레그락",
  }

  const filtered = filterLayer ? POSITIONS.filter((p) => p.layer === filterLayer) : POSITIONS.filter((p) => p.layer !== "submission")

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest("[data-ctx-menu]")) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  return (
    <div
      data-ctx-menu
      style={{
        position: "fixed", left: x, top: y, zIndex: 200,
        minWidth: showPicker ? 280 : 160,
      }}
      className="bg-zinc-900 border border-zinc-700 rounded-lg py-1 text-xs"
    >
      {!showPicker && !showVideoInput ? (
        <>
          <button
            onClick={() => setShowPicker(true)}
            className="w-full text-left px-3 py-2 text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
          >
            <span className="text-zinc-500">+</span>
            새 스텝 추가 (여기서 연결)
          </button>
          <button
            onClick={() => setShowVideoInput(true)}
            className="w-full text-left px-3 py-2 text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
          >
            <span className="text-zinc-500">📺</span>
            {currentVideoUrl ? "유튜브 링크 수정" : "유튜브 링크 추가"}
          </button>
          <button
            onClick={onDelete}
            className="w-full text-left px-3 py-2 text-red-400/70 hover:bg-zinc-800 hover:text-red-400 flex items-center gap-2"
          >
            <span className="text-red-500/50">×</span>
            이 스텝 삭제
          </button>
        </>
      ) : showVideoInput ? (
        <div className="p-2 space-y-2">
          <p className="text-zinc-500 text-[10px] px-1">유튜브 링크:</p>
          <div className="flex gap-1">
            <input
              type="text"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && videoUrl.trim()) { onAddVideo(videoUrl.trim()) } }}
              placeholder="https://youtu.be/..."
              className="flex-1 px-2 py-1 rounded text-[10px] bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-600 focus:outline-none"
              autoFocus
            />
            <button
              onClick={() => { if (videoUrl.trim()) onAddVideo(videoUrl.trim()) }}
              disabled={!videoUrl.trim()}
              className="px-2 py-1 rounded text-[10px] bg-zinc-700 text-white disabled:opacity-30"
            >
              저장
            </button>
          </div>
          {currentVideoUrl && (
            <button
              onClick={() => { onAddVideo(""); }}
              className="text-[10px] text-red-400/60 hover:text-red-400 px-1"
            >
              링크 삭제
            </button>
          )}
        </div>
      ) : (
        <div className="p-2 space-y-2">
          <p className="text-zinc-500 text-[10px] px-1">연결할 포지션 선택:</p>
          <div className="flex gap-1 flex-wrap">
            {layers.map((l) => (
              <button
                key={l}
                onClick={() => setFilterLayer(filterLayer === l ? null : l)}
                className={`px-1.5 py-0.5 rounded text-[10px] ${filterLayer === l ? "text-white bg-zinc-700" : "text-zinc-500"}`}
                style={filterLayer === l ? { color: LAYER_COLORS[l] } : {}}
              >
                {layerLabels[l]}
              </button>
            ))}
          </div>
          <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1">
            {filtered.map((p) => {
              const c = LAYER_COLORS[p.layer] || "#a855f7"
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPos(p.id)}
                  className={`px-1.5 py-0.5 rounded text-[10px] border ${selectedPos === p.id ? "text-white" : "text-zinc-500 border-zinc-800"}`}
                  style={selectedPos === p.id ? { color: c, borderColor: `${c}50`, background: `${c}15` } : {}}
                >
                  {p.nameKr}
                </button>
              )
            })}
          </div>
          {selectedPos && (
            <div className="flex gap-1">
              <input
                type="text"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && action.trim()) { onSelect(selectedPos, action.trim()) } }}
                placeholder="액션 (예: 스윕)"
                className="flex-1 px-2 py-1 rounded text-[10px] bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-600 focus:outline-none"
              />
              <button
                onClick={() => { if (action.trim()) onSelect(selectedPos, action.trim()) }}
                disabled={!action.trim()}
                className="px-2 py-1 rounded text-[10px] bg-zinc-700 text-white disabled:opacity-30"
              >
                추가
              </button>
            </div>
          )}
        </div>
      )}
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
    setSelectedId(imported.id)
    setViewMode("mine")
    setEditMode(true)
    setShowBuilder(true)
  }

  function addStep(step: StrategyStep) {
    if (!selected || selected.type !== "mine") return
    const newIdx = selected.flow.length
    const updated = myStrategies.map((s) => {
      if (s.id !== selected.id) return s
      const flow = [...s.flow]
      // 마지막 노드에 새 스텝으로 branch 자동 연결
      if (flow.length > 0) {
        const lastStep = { ...flow[flow.length - 1] }
        const branches = lastStep.branches ? [...lastStep.branches] : []
        branches.push({ condition: step.action.slice(0, 20), nextStepIndex: newIdx })
        lastStep.branches = branches
        flow[flow.length - 1] = lastStep
      }
      flow.push(step)
      return { ...s, flow, updatedAt: new Date().toISOString().slice(0, 10) }
    })
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
                {editMode && selected.type === "mine" ? (
                  <input
                    type="text"
                    value={selected.name}
                    onChange={(e) => {
                      const updated = myStrategies.map((s) => s.id === selected.id ? { ...s, name: e.target.value } : s)
                      persist(updated)
                    }}
                    className="text-base font-semibold text-white bg-transparent border-b border-zinc-700 focus:border-zinc-500 focus:outline-none pb-0.5"
                    style={{ minWidth: 200 }}
                  />
                ) : (
                  <h2 className="text-base font-semibold text-white">{selected.name}</h2>
                )}
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
              editMode={editMode}
              onAddFromNode={(fromIdx: number, newStep: StrategyStep) => {
                if (!selected || selected.type !== "mine") return
                const newFlowIdx = selected.flow.length
                // 새 스텝 추가 + from 노드에 branch 연결
                const updatedFlow = selected.flow.map((s, i) => {
                  if (i !== fromIdx) return s
                  const branches = s.branches ? [...s.branches] : []
                  branches.push({ condition: newStep.action, nextStepIndex: newFlowIdx })
                  return { ...s, branches }
                })
                updatedFlow.push(newStep)
                const updated = myStrategies.map((s) =>
                  s.id === selected.id ? { ...s, flow: updatedFlow, updatedAt: new Date().toISOString().slice(0, 10) } : s
                )
                persist(updated)
              }}
              onDeleteStep={(idx: number) => {
                if (!selected || selected.type !== "mine") return
                const deletedFlow = selected.flow.filter((_, i) => i !== idx)
                // branches의 nextStepIndex 보정: 삭제된 인덱스 이후는 -1, 삭제된 인덱스를 가리키면 제거
                const fixedFlow = deletedFlow.map((s) => {
                  if (!s.branches) return s
                  const fixed = s.branches
                    .filter((b) => b.nextStepIndex !== idx)
                    .map((b) => ({
                      ...b,
                      nextStepIndex: b.nextStepIndex > idx ? b.nextStepIndex - 1 : b.nextStepIndex,
                    }))
                  return { ...s, branches: fixed.length > 0 ? fixed : undefined }
                })
                const updated = myStrategies.map((s) =>
                  s.id === selected.id ? { ...s, flow: fixedFlow, updatedAt: new Date().toISOString().slice(0, 10) } : s
                )
                persist(updated)
                setSelectedStep(null)
              }}
              onUpdateStepVideo={(idx: number, url: string) => {
                if (!selected || selected.type !== "mine") return
                const updated = myStrategies.map((s) => {
                  if (s.id !== selected.id) return s
                  const flow = s.flow.map((st, i) =>
                    i === idx ? { ...st, videoUrl: url || undefined } : st
                  )
                  return { ...s, flow, updatedAt: new Date().toISOString().slice(0, 10) }
                })
                persist(updated)
              }}
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
