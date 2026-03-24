"use client"

import { useState, useEffect, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { loadMyStrategies, getAllProStrategies } from "@/lib/sensei/strategies"
import { getPositionById } from "@/lib/sensei/skillConnections"
import type { Strategy } from "@/lib/types/sensei"

type ViewMode = "mine" | "pro"

const LAYER_COLORS: Record<string, string> = {
  standing: "#06b6d4",
  guard: "#a855f7",
  passing: "#22c55e",
  control: "#f97316",
  submission: "#ef4444",
  leglock: "#eab308",
}

function getPositionColor(posId: string): string {
  const pos = getPositionById(posId)
  return pos ? (LAYER_COLORS[pos.layer] || "#a855f7") : "#71717a"
}

export function SenseiStrategy() {
  const [viewMode, setViewMode] = useState<ViewMode>("mine")
  const [mounted, setMounted] = useState(false)
  const [myStrategies, setMyStrategies] = useState<Strategy[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedStep, setSelectedStep] = useState<number | null>(null)

  const proStrategies = useMemo(() => getAllProStrategies(), [])

  useEffect(() => {
    setMyStrategies(loadMyStrategies())
    setMounted(true)
  }, [])

  const strategies = viewMode === "mine" ? myStrategies : proStrategies
  const selected = strategies.find((s) => s.id === selectedId) ?? strategies[0] ?? null

  useEffect(() => {
    if (strategies.length > 0 && !strategies.find((s) => s.id === selectedId)) {
      setSelectedId(strategies[0].id)
      setSelectedStep(null)
    }
  }, [viewMode, strategies, selectedId])

  if (!mounted) {
    return <div className="text-sm text-zinc-500 p-8 text-center">로딩 중...</div>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* View Toggle + Strategy Selector */}
      <div className="bg-[#121212] border border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1">
            <button
              onClick={() => { setViewMode("mine"); setSelectedStep(null) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === "mine" ? "bg-orange-500/15 text-orange-400 border border-orange-500/30" : "text-zinc-500 border border-zinc-800"
              }`}
            >
              내 전략
            </button>
            <button
              onClick={() => { setViewMode("pro"); setSelectedStep(null) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === "pro" ? "bg-blue-500/15 text-blue-400 border border-blue-500/30" : "text-zinc-500 border border-zinc-800"
              }`}
            >
              선수 전략
            </button>
          </div>

          <div className="h-4 w-px bg-zinc-800" />

          <div className="flex gap-1.5 flex-wrap">
            {strategies.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSelectedId(s.id); setSelectedStep(null) }}
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                  selected?.id === s.id
                    ? "bg-zinc-800 text-white border border-zinc-700"
                    : "text-zinc-500 border border-zinc-800/50 hover:text-zinc-300"
                }`}
              >
                {s.proName || s.name}
                {s.ruleSet === "gi" && <span className="ml-1 text-blue-400/60">Gi</span>}
                {s.ruleSet === "nogi" && <span className="ml-1 text-red-400/60">NoGi</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Selected Strategy Flow */}
      {selected && (
        <div className="bg-[#121212] border border-zinc-800 rounded-2xl p-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-base font-semibold text-white">{selected.name}</h2>
              <Badge className="text-[10px] border-zinc-700 bg-zinc-800 text-zinc-400">{selected.ruleSet.toUpperCase()}</Badge>
              {selected.proName && (
                <Badge className="text-[10px] border-blue-500/30 bg-blue-500/10 text-blue-400">{selected.proName}</Badge>
              )}
            </div>
            {selected.description && (
              <p className="text-xs text-zinc-500">{selected.description}</p>
            )}
          </div>

          {/* SVG Flowchart */}
          <div className="relative">
            {selected.flow.map((step, idx) => {
              const color = getPositionColor(step.positionId)
              const pos = getPositionById(step.positionId)
              const isSelected = selectedStep === idx
              const isCore = step.action.includes("★")

              return (
                <div key={String(idx)} className="relative">
                  {/* Connector line */}
                  {idx > 0 && (
                    <div className="absolute left-[19px] -top-1 w-px h-3 bg-zinc-800" />
                  )}

                  {/* Node */}
                  <button
                    type="button"
                    onClick={() => setSelectedStep(isSelected ? null : idx)}
                    className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-all ${
                      isSelected
                        ? "border-zinc-600 bg-zinc-800/50"
                        : "border-transparent hover:bg-zinc-900/50"
                    }`}
                  >
                    {/* Dot */}
                    <div className="shrink-0 mt-1">
                      <div
                        className="w-[10px] h-[10px] rounded-full border-2"
                        style={{
                          borderColor: color,
                          background: isCore ? color : "transparent",
                        }}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-xs font-medium px-1.5 py-0.5 rounded"
                          style={{ color, background: `${color}15`, border: `1px solid ${color}25` }}
                        >
                          {pos?.nameKr || step.positionId}
                        </span>
                        {step.lessonNumber && (
                          <span className="text-[10px] text-zinc-600">#{step.lessonNumber}</span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-300 mt-1">{step.action}</p>

                      {/* Branches */}
                      {step.branches && step.branches.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {step.branches.map((b, bi) => {
                            const targetStep = b.nextStepIndex >= 0 && b.nextStepIndex < selected.flow.length
                              ? selected.flow[b.nextStepIndex]
                              : null
                            const targetPos = targetStep ? getPositionById(targetStep.positionId) : null
                            const targetColor = targetStep ? getPositionColor(targetStep.positionId) : "#71717a"

                            return (
                              <div key={String(bi)} className="flex items-center gap-1.5 text-[11px]">
                                <span className="text-zinc-600">↳</span>
                                <span className="text-zinc-500 italic">{b.condition}</span>
                                <span className="text-zinc-700">→</span>
                                {targetPos ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setSelectedStep(b.nextStepIndex) }}
                                    className="font-medium hover:underline"
                                    style={{ color: targetColor }}
                                  >
                                    {targetPos.nameKr}
                                  </button>
                                ) : (
                                  <span className="text-zinc-600">{b.condition}</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Expanded Detail */}
                  {isSelected && (step.notes || step.videoUrl || step.lessonNumber) && (
                    <div className="ml-[31px] mb-2 p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 space-y-2">
                      {step.notes && (
                        <p className="text-xs text-zinc-400">{step.notes}</p>
                      )}
                      {step.videoUrl && (
                        <a
                          href={step.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-colors"
                        >
                          <span>📺</span>
                          <span>교본 영상 보기 #{step.lessonNumber}</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Tags */}
          {selected.tags && selected.tags.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-wrap gap-1.5">
              {selected.tags.map((tag) => (
                <span key={tag} className="text-[10px] text-zinc-500 px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
