import type { Position, Transition } from "@/lib/types/sensei"
import { getNavMapLayer } from "@/lib/sensei/nav-map-layout"
import { getTransitionCategory } from "@/lib/sensei/nav-map-scoring"
import { EDGE_COLORS, getSkillLevel, LAYER_COLORS, SKILL_LEVEL_COLORS } from "@/components/sensei/nav-map/nav-map-theme"
import type { PositionTrainingInfo } from "@/components/sensei/nav-map/nav-map-training"

export interface NavMapNodeInspectorProps {
  readonly node: Position
  readonly positionSkillMap: Readonly<Record<string, number>>
  readonly trainingMap: Readonly<Record<string, PositionTrainingInfo>>
  readonly outgoing: readonly Transition[]
  readonly incoming: readonly Transition[]
  readonly positions: readonly Position[]
  readonly positionsById: ReadonlyMap<string, Position>
  readonly onClear: () => void
  readonly onSelectNode: (positionId: string) => void
}

export function NavMapNodeInspector({
  node,
  positionSkillMap,
  trainingMap,
  outgoing,
  incoming,
  positions,
  positionsById,
  onClear,
  onSelectNode,
}: NavMapNodeInspectorProps) {
  const evidenceCount = Math.max(
    0,
    ...[...outgoing, ...incoming].map((transition) => transition.evidence?.count ?? 0),
  )
  const nodeLayer = getNavMapLayer(node)
  const skillCount = positionSkillMap[node.id] ?? 0
  const displayCount = Math.max(skillCount, evidenceCount)
  const { level, label } = getSkillLevel(displayCount)
  const skillColor = SKILL_LEVEL_COLORS[level]
  const trainingInfo = trainingMap[node.id]

  return (
    <aside
      data-testid="navmap-detail"
      data-selected-node={node.id}
      className="w-full shrink-0 space-y-3 rounded-xl border border-border bg-card p-4 lg:sticky lg:top-20 lg:w-72"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{node.nameKr}</h3>
          <p className="text-xs text-muted-foreground">{node.name}</p>
        </div>
        <button
          type="button"
          aria-label="선택 해제"
          onClick={onClear}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ×
        </button>
      </div>
      <div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span
            className="inline-block px-2 py-0.5 rounded text-[10px] font-medium"
            style={{
              backgroundColor: `${LAYER_COLORS[nodeLayer]}30`,
              color: LAYER_COLORS[nodeLayer],
            }}
          >
            {nodeLayer}
          </span>
          {node.family && (
            <span className="text-[10px] text-muted-foreground">· {node.family}</span>
          )}
          {node.perspective && (
            <span className="text-[10px] text-muted-foreground">· {node.perspective}</span>
          )}
          <span
            className="inline-block px-2 py-0.5 rounded text-[10px] font-bold"
            style={{ backgroundColor: skillColor + "25", color: skillColor, border: `1px solid ${skillColor}40` }}
          >
            {label} ({displayCount}회)
          </span>
        </div>
      </div>

      {trainingInfo ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-xs">
            <div>
              <span className="text-foreground font-semibold">{trainingInfo.count}</span>
              <span className="text-muted-foreground ml-1">세션</span>
            </div>
            {trainingInfo.lastDate && (
              <div className="text-muted-foreground">
                최근 <span className="text-foreground/80">{trainingInfo.lastDate.slice(5)}</span>
              </div>
            )}
          </div>
          {trainingInfo.videos.length > 0 && (
            <div>
              <h4 className="text-[10px] text-muted-foreground mb-0.5">영상</h4>
              {trainingInfo.videos.map((video, videoIndex) => (
                <a
                  key={videoIndex}
                  href={video.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-[11px] text-blue-400 hover:text-blue-300 truncate"
                >
                  🎬 {video.title || video.url.slice(0, 40)}
                </a>
              ))}
            </div>
          )}
          {trainingInfo.recentNotes.length > 0 && (
            <div>
              <h4 className="text-[10px] text-muted-foreground mb-0.5">최근 노트</h4>
              {trainingInfo.recentNotes.map((note, noteIndex) => (
                <div key={noteIndex} className="text-[10px] text-foreground/70 leading-tight mb-1">
                  <span className="text-muted-foreground">{note.date.slice(5)}</span>{" "}
                  {note.note}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground/60 text-[11px]">
          {evidenceCount > 0
            ? `연결 근거 ${evidenceCount}회 · 노트/논의 기반`
            : "수업 기록 없음"}
        </p>
      )}

      <div className="border-t border-border pt-2" />

      {outgoing.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-foreground/80 mb-1">→ 전환 ({outgoing.length})</h4>
          <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
            {outgoing.map((transition, index) => {
              const toPosition = positions.find((position) => position.id === transition.to)
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => onSelectNode(transition.to)}
                  className="w-full text-left flex items-center gap-1.5 px-2 py-1 rounded text-[11px] hover:bg-muted transition-colors"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: EDGE_COLORS[getTransitionCategory(transition, positionsById)] }}
                  />
                  <span className="text-foreground/90 truncate">{transition.action}</span>
                  {transition.evidence && (
                    <span className="shrink-0 rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-[9px] text-cyan-300">
                      기록 {transition.evidence.count}
                    </span>
                  )}
                  <span className="text-muted-foreground ml-auto shrink-0 text-[10px]">→ {toPosition?.nameKr || transition.to}</span>
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
            {incoming.map((transition, index) => {
              const fromPosition = positions.find((position) => position.id === transition.from)
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => onSelectNode(transition.from)}
                  className="w-full text-left flex items-center gap-1.5 px-2 py-1 rounded text-[11px] hover:bg-muted transition-colors"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: EDGE_COLORS[getTransitionCategory(transition, positionsById)] }}
                  />
                  <span className="text-muted-foreground shrink-0 text-[10px]">{fromPosition?.nameKr || transition.from} →</span>
                  {transition.evidence && (
                    <span className="shrink-0 rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-[9px] text-cyan-300">
                      기록 {transition.evidence.count}
                    </span>
                  )}
                  <span className="text-foreground/90 truncate ml-auto">{transition.action}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </aside>
  )
}
