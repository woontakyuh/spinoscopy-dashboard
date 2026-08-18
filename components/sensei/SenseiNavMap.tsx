"use client"

import { useState, useMemo, useRef, useCallback, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { useSenseiData } from "@/lib/sensei/useSenseiData"
import { loadMyStrategies } from "@/lib/sensei/strategies"
import type { FinishEvidenceKind, Position, PositionLayer, TransitionType, SenseiEntry, BjjStats, Strategy } from "@/lib/types/sensei"
import {
  buildFocusGraph,
  getTransitionKey,
  type FocusDepth,
  type NavMapPoint,
} from "@/lib/sensei/nav-map-focus"
import {
  buildNavMapLayout,
  GUARD_FAMILY_ORDER,
  GUARD_FAMILY_Y,
  GUARD_HEIGHT,
  GUARD_START_Y,
  LAYER_Y_MAP,
  NAV_MAP_HEIGHT,
  NAV_MAP_WIDTH,
  PASSING_REGION_X,
} from "@/lib/sensei/nav-map-layout"
import {
  buildEvidenceFinishTransitions,
  mergeEvidenceFinishTransitions,
  type ConceptEvidenceNote,
} from "@/lib/sensei/evidenceFinishConnections"

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

const EVIDENCE_KIND_LABELS: Readonly<Record<FinishEvidenceKind, string>> = {
  class: "수업",
  study: "공부",
  sparring: "스파링",
  research: "연구",
  discussion: "논의",
  concept: "개념",
}

// ─── Skill Level ────────────────────────────────────────────
function getSkillLevel(count: number): { level: number; label: string } {
  if (count === 0) return { level: 0, label: "Locked" }
  if (count <= 2) return { level: 1, label: "Lv.1" }
  if (count <= 5) return { level: 2, label: "Lv.2" }
  if (count <= 10) return { level: 3, label: "Lv.3" }
  if (count <= 20) return { level: 4, label: "Lv.4" }
  return { level: 5, label: "Lv.5" }
}

const SKILL_LEVEL_COLORS: Record<number, string> = {
  0: "#3f3f46",  // zinc-700 — very dim
  1: "#a1a1aa",  // zinc-400
  2: "#22c55e",  // green
  3: "#3b82f6",  // blue
  4: "#a855f7",  // purple
  5: "#f59e0b",  // amber/gold
}

const GUARD_FAMILY_LABELS: Record<string, string> = {
  closed: "Closed",
  half: "Half",
  sitting: "Sitting",
  open: "Open",
  butterfly: "Butterfly",
}

const SVG_W = NAV_MAP_WIDTH
const SVG_H = NAV_MAP_HEIGHT
const PIN_STORAGE_KEY = "sensei-navmap-pins-v1"
const FULL_VIEW_BOX = { x: 0, y: 0, w: SVG_W, h: SVG_H }

type NavMapMode = "map" | "focus"

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

// ─── Node abbreviation ─────────────────────────────────────
function abbr(pos: Position): string {
  // Use id for short names (they're already abbrs like "hg", "dlr", "kob")
  if (pos.id.length <= 4) return pos.id.toUpperCase()
  // Otherwise first 3 chars of nameKr
  return (pos.nameKr || pos.name).slice(0, 3)
}

// ─── Tag → Position ID mapping (for skill levels) ──────────
const TAG_TO_POS_ID: Record<string, string> = {
  HG: "hg", DHG: "dhg", DLR: "dlr", RDLR: "rdlr", SLX: "slx", XG: "xg",
  Butterfly: "butterfly", Closed: "closed", Open: "open", Spider: "spider",
  Lasso: "lasso", "Sit-up": "situp", Lapel: "lapel", Worm: "worm",
  RWorm: "rworm", Squid: "squid", Octopus: "octopus", Rubber: "rubber",
  CrabRide: "crabride", Truck: "truck", KShield: "kshield", Waiter: "waiter",
  KGuard: "kguard", HalfButt: "halfbutt", Bolo: "bolo",
  KCP: "kcp", Torreando: "torreando", Stack: "smash", Smash: "smash",
  LegPummel: "legpummel", HalfPass: "halfpass", LongStep: "longstep",
  Bullfight: "bullfight", HQ: "hq",
  Mount: "mount_top", "S-Mount": "mount_top", SideCtrl: "side_top",
  BackTake: "back_top", BackMount: "back_top", KoB: "kob_top",
  NS: "ns_top", Scarf: "scarf", Turtle: "turtle_top", Crucifix: "crucifix",
  RNC: "rnc", Anaconda: "anaconda", Darce: "darce", Guillotine: "guillotine",
  Omo: "omoplata", Triangle: "triangle", ArmB: "armb", Kimura: "kimura",
  Americana: "americana", BowArrow: "bowarrow", CrossChoke: "crosschoke",
  Ezekiel: "ezekiel", Baseball: "baseball", NSChoke: "nschoke",
  ArmTriangle: "armtriangle", Gogoplata: "gogoplata", Wristlock: "wristlock",
  Takedown: "standing", SingleLeg: "standing", DoubleLeg: "standing",
  JudoThrow: "standing", Throw: "standing", GPull: "standing",
  ArmDrag: "armdrag", AnklePick: "standing", WrestleUp: "standing",
  Bodylock: "standing", InsideTrip: "standing",
  IHH: "ihh", OHH: "ohh", Estima: "estima", ToeHold: "toehold",
  KneeBar: "kneebar", SFL: "sfl", "50/50": "5050",
  Ashi: "ashi", SLAshi: "slashi", Saddle: "saddle", OutAshi: "outashi",
}

function buildPositionSkillMap(tagFrequencies: Record<string, number>): Record<string, number> {
  const map: Record<string, number> = {}
  for (const [tag, count] of Object.entries(tagFrequencies)) {
    const posId = TAG_TO_POS_ID[tag] ?? tag.toLowerCase()
    map[posId] = (map[posId] ?? 0) + count
  }
  return map
}

// ─── Game Plans ─────────────────────────────────────────────
const BUILTIN_GAME_PLANS = [
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

type ColorMode = "layer" | "skill"

export function SenseiNavMap() {
  const { positions, transitions: storedTransitions } = useSenseiData()
  const [selectedPlan, setSelectedPlan] = useState("all")
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedTransitionKey, setSelectedTransitionKey] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [hoveredTransitionKey, setHoveredTransitionKey] = useState<string | null>(null)
  const [ruleSetFilter, setRuleSetFilter] = useState<"all" | "gi" | "nogi">("all")
  const [colorMode, setColorMode] = useState<ColorMode>("layer")
  const [viewMode, setViewMode] = useState<NavMapMode>("map")
  const [focusDepth, setFocusDepth] = useState<FocusDepth>(1)
  const [pinnedPositions, setPinnedPositions] = useState<Record<string, NavMapPoint>>({})
  const [isCompact, setIsCompact] = useState(false)

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

  const { data: conceptNotes } = useQuery<ConceptEvidenceNote[]>({
    queryKey: ["sensei-concept-evidence"],
    queryFn: async () => {
      const res = await fetch("/api/notion/concept-notes")
      if (!res.ok) throw new Error("concept evidence fetch failed")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const evidenceFinishTransitions = useMemo(
    () => buildEvidenceFinishTransitions(
      trainingEntries ?? [],
      conceptNotes ?? [],
      positions,
    ),
    [conceptNotes, positions, trainingEntries],
  )
  const transitions = useMemo(
    () => mergeEvidenceFinishTransitions(
      storedTransitions,
      evidenceFinishTransitions,
    ),
    [evidenceFinishTransitions, storedTransitions],
  )

  // Tag frequencies (for skill levels)
  const { data: statsData } = useQuery<{ stats: BjjStats; tagFrequencies: Record<string, number> }>({
    queryKey: ["sensei-stats"],
    queryFn: async () => {
      const res = await fetch("/api/notion/sensei/stats")
      if (!res.ok) throw new Error("스탯 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const positionSkillMap = useMemo(
    () => buildPositionSkillMap(statsData?.tagFrequencies ?? {}),
    [statsData?.tagFrequencies]
  )

  // Custom strategies from localStorage
  const [myStrategies, setMyStrategies] = useState<Strategy[]>([])
  useEffect(() => {
    setMyStrategies(loadMyStrategies())
  }, [])

  // Combined game plans: built-in + custom strategies
  const GAME_PLANS = useMemo(() => {
    const customPlans = myStrategies.map((s) => ({
      id: `strat-${s.id}`,
      label: s.name,
      positionIds: s.flow.map((step) => step.positionId),
      isStrategy: true as const,
    }))
    return [...BUILTIN_GAME_PLANS.map((gp) => ({ ...gp, isStrategy: false as const })), ...customPlans]
  }, [myStrategies])

  const trainingMap = useMemo(
    () => buildPositionTrainingMap(trainingEntries ?? [], positions),
    [trainingEntries, positions]
  )

  // Zoom/pan state
  const svgRef = useRef<SVGSVGElement>(null)
  const [viewBox, setViewBox] = useState(FULL_VIEW_BOX)
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 })
  const pinnedPositionsRef = useRef<Record<string, NavMapPoint>>({})
  const draggedNode = useRef<{
    id: string
    startClientX: number
    startClientY: number
    startPoint: NavMapPoint
    moved: boolean
  } | null>(null)
  const suppressNodeClick = useRef(false)

  useEffect(() => {
    const storage = getBrowserStorage()
    if (!storage) return
    try {
      const stored = storage.getItem(PIN_STORAGE_KEY)
      if (!stored) return
      const parsed = JSON.parse(stored) as Record<string, NavMapPoint>
      pinnedPositionsRef.current = parsed
      setPinnedPositions(parsed)
    } catch {
      storage.removeItem(PIN_STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)")
    const sync = () => setIsCompact(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  // Zoom via explicit controls only (no wheel — page scroll 방해 방지)
  const MIN_ZOOM = 0.5
  const MAX_ZOOM = 3
  const zoomLevel = SVG_W / viewBox.w
  const compactFocus = viewMode === "focus" && isCompact
  const compactMap = viewMode === "map" && isCompact
  const nodeVisualScale = (positionId: string) => {
    if (!compactFocus) return 1
    return positionId === selectedNodeId ? 2.5 : 1.75
  }
  const focusLabelScale = compactFocus ? 1.75 : 1

  const setZoomLevel = useCallback((next: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next))
    const newW = SVG_W / clamped
    const newH = SVG_H / clamped
    setViewBox((v) => ({
      x: v.x + (v.w - newW) / 2,
      y: v.y + (v.h - newH) / 2,
      w: newW,
      h: newH,
    }))
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    setIsPanning(true)
    panStart.current = { x: e.clientX, y: e.clientY, vx: viewBox.x, vy: viewBox.y }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }, [viewBox])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const activeDrag = draggedNode.current
    if (activeDrag) {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const nextPoint = {
        x: activeDrag.startPoint.x + ((e.clientX - activeDrag.startClientX) * viewBox.w / rect.width),
        y: activeDrag.startPoint.y + ((e.clientY - activeDrag.startClientY) * viewBox.h / rect.height),
      }
      activeDrag.moved ||= Math.hypot(
        e.clientX - activeDrag.startClientX,
        e.clientY - activeDrag.startClientY,
      ) > 3
      const next = { ...pinnedPositionsRef.current, [activeDrag.id]: nextPoint }
      pinnedPositionsRef.current = next
      setPinnedPositions(next)
      return
    }
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

  const handlePointerUp = useCallback(() => {
    const activeDrag = draggedNode.current
    if (activeDrag) {
      suppressNodeClick.current = activeDrag.moved
      getBrowserStorage()?.setItem(PIN_STORAGE_KEY, JSON.stringify(pinnedPositionsRef.current))
      draggedNode.current = null
    }
    setIsPanning(false)
  }, [])

  const handleNodePointerDown = useCallback((
    event: React.PointerEvent<SVGGElement>,
    positionId: string,
    point: NavMapPoint,
  ) => {
    if (event.button !== 0) return
    event.stopPropagation()
    if (viewMode !== "map") return
    event.currentTarget.setPointerCapture(event.pointerId)
    draggedNode.current = {
      id: positionId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPoint: point,
      moved: false,
    }
  }, [viewMode])

  const resetZoom = useCallback(() => setViewBox(FULL_VIEW_BOX), [])

  const resetLayout = useCallback(() => {
    pinnedPositionsRef.current = {}
    setPinnedPositions({})
    getBrowserStorage()?.removeItem(PIN_STORAGE_KEY)
    resetZoom()
  }, [resetZoom])

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

  const mapNodePositions = useMemo(
    () => buildNavMapLayout(filteredPositions),
    [filteredPositions],
  )

  const focusGraph = useMemo(
    () => selectedNodeId
      ? buildFocusGraph(
          filteredPositions,
          filteredTransitions,
          selectedNodeId,
          focusDepth,
        )
      : null,
    [filteredPositions, filteredTransitions, focusDepth, selectedNodeId],
  )

  const displayedPositions = useMemo(
    () => viewMode === "focus" && focusGraph
      ? focusGraph.nodes.map((node) => node.position)
      : filteredPositions,
    [filteredPositions, focusGraph, viewMode],
  )
  const displayedLayers = useMemo(
    () => new Set(displayedPositions.map((position) => position.layer)),
    [displayedPositions],
  )

  const nodePositions = useMemo(
    () => ({ ...mapNodePositions, ...pinnedPositions }),
    [mapNodePositions, pinnedPositions],
  )

  // Visible transitions
  const visibleTransitions = useMemo(() => {
    if (viewMode === "focus" && focusGraph) {
      return focusGraph.edges.map((edge) => edge.transition)
    }
    const nodeIds = new Set(Object.keys(nodePositions))
    return filteredTransitions.filter((t) => nodeIds.has(t.from) && nodeIds.has(t.to))
  }, [filteredTransitions, focusGraph, nodePositions, viewMode])

  // Active node = selected or hovered
  const activeNodeId = selectedNodeId ?? hoveredNodeId

  // Selected node details
  const selectedNode = filteredPositions.find((p) => p.id === selectedNodeId)
  const selectedTransition = visibleTransitions.find(
    (transition) => getTransitionKey(transition) === selectedTransitionKey,
  )
  const selectedTransitionFrom = selectedTransition
    ? filteredPositions.find((position) => position.id === selectedTransition.from)
    : null
  const selectedTransitionTo = selectedTransition
    ? filteredPositions.find((position) => position.id === selectedTransition.to)
    : null
  const outgoing = useMemo(
    () => (selectedNodeId ? visibleTransitions.filter((t) => t.from === selectedNodeId) : []),
    [selectedNodeId, visibleTransitions]
  )
  const incoming = useMemo(
    () => (selectedNodeId ? visibleTransitions.filter((t) => t.to === selectedNodeId) : []),
    [selectedNodeId, visibleTransitions]
  )
  const selectedEvidenceCount = useMemo(
    () => Math.max(
      0,
      ...[...outgoing, ...incoming].map(
        (transition) => transition.evidence?.count ?? 0,
      ),
    ),
    [incoming, outgoing],
  )

  const clearSelection = useCallback(() => {
    setSelectedNodeId(null)
    setSelectedTransitionKey(null)
    setViewMode("map")
  }, [])

  const selectNode = useCallback((positionId: string) => {
    if (suppressNodeClick.current) {
      suppressNodeClick.current = false
      return
    }
    if (positionId === selectedNodeId) {
      clearSelection()
      return
    }
    setSelectedNodeId(positionId)
    setSelectedTransitionKey(null)
    setViewMode("focus")
  }, [clearSelection, selectedNodeId])

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="space-y-3 rounded-xl border border-border bg-card/60 p-3">
        <div className="flex items-end justify-between gap-2 border-b border-border pb-3">
          <div className="space-y-1">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              그래프 보기
            </span>
            <div
              className="inline-flex overflow-hidden rounded-lg border border-border"
              role="group"
              aria-label="그래프 보기 모드"
            >
              <button
                type="button"
                aria-label="Map 모드"
                aria-pressed={viewMode === "map"}
                onClick={() => setViewMode("map")}
                className={`min-h-9 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                  viewMode === "map"
                    ? "bg-orange-500/15 text-orange-300"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Map
              </button>
              <button
                type="button"
                aria-label="Focus 모드"
                aria-pressed={viewMode === "focus"}
                disabled={!selectedNodeId}
                onClick={() => setViewMode("focus")}
                className={`min-h-9 border-l border-border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 ${
                  viewMode === "focus"
                    ? "bg-orange-500/15 text-orange-300"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Focus
              </button>
            </div>
          </div>

          {viewMode === "focus" && (
            <div className="space-y-1">
              <span className="block text-[10px] font-medium text-muted-foreground">
                연결 깊이
              </span>
              <div
                className="inline-flex overflow-hidden rounded-lg border border-border"
                role="group"
                aria-label="Focus 연결 깊이"
              >
                {([1, 2] as const).map((depth) => (
                  <button
                    key={depth}
                    type="button"
                    aria-label={`Focus depth ${depth}`}
                    aria-pressed={focusDepth === depth}
                    onClick={() => setFocusDepth(depth)}
                    className={`min-h-8 min-w-10 border-l border-border px-3 text-[11px] first:border-l-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                      focusDepth === depth
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {depth}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            게임 플랜
          </span>
          <div className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-1">
            {GAME_PLANS.map((gp) => (
              <button
                key={gp.id}
                type="button"
                aria-pressed={selectedPlan === gp.id}
                onClick={() => {
                  setSelectedPlan(gp.id)
                  setSelectedNodeId(null)
                  setSelectedTransitionKey(null)
                  setViewMode("map")
                }}
                className={`min-h-9 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-[background-color,color,transform] duration-150 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selectedPlan === gp.id
                    ? gp.isStrategy ? "bg-purple-600 text-white" : "bg-orange-600 text-white"
                    : gp.isStrategy
                      ? "border border-purple-500/20 bg-purple-500/10 text-purple-400/80 hover:text-purple-300"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {gp.isStrategy ? `📋 ${gp.label}` : gp.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
          {/* Color mode toggle */}
          <div className="space-y-1">
            <span className="block text-[10px] font-medium text-muted-foreground">색상 기준</span>
            <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label="노드 색상 기준">
              <button
                type="button"
                aria-pressed={colorMode === "layer"}
                onClick={() => setColorMode("layer")}
                className={`min-h-8 px-3 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                  colorMode === "layer" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                포지션
              </button>
              <button
                type="button"
                aria-pressed={colorMode === "skill"}
                onClick={() => setColorMode("skill")}
                className={`min-h-8 border-l border-border px-3 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                  colorMode === "skill" ? "bg-amber-500/20 text-amber-300" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                숙련도
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <span className="block text-[10px] font-medium text-muted-foreground">룰셋</span>
            <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label="룰셋 필터">
              {(["all", "gi", "nogi"] as const).map((rs) => (
                <button
                  key={rs}
                  type="button"
                  aria-pressed={ruleSetFilter === rs}
                  onClick={() => setRuleSetFilter(rs)}
                  className={`min-h-8 border-l border-border px-3 text-[11px] first:border-l-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                    ruleSetFilter === rs
                      ? "bg-orange-500/15 text-orange-300"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {rs === "all" ? "전체" : rs === "gi" ? "Gi" : "No-Gi"}
                </button>
              ))}
            </div>
          </div>

          {/* Zoom controls — wheel zoom 제거, 명시 버튼·슬라이더로 대체 */}
          <div className="ml-auto space-y-1">
            <span className="block text-[10px] font-medium text-muted-foreground">지도 크기</span>
            <div className="flex min-h-8 items-center gap-1 rounded-lg border border-border px-1.5">
              <button
                type="button"
                onClick={() => setZoomLevel(zoomLevel / 1.2)}
                className="min-h-7 min-w-7 rounded text-foreground/80 hover:bg-muted hover:text-foreground disabled:opacity-40"
                disabled={zoomLevel <= MIN_ZOOM + 0.01}
                aria-label="Zoom out"
              >−</button>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.1}
                value={zoomLevel}
                onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                className="w-20 accent-orange-500"
                aria-label="Zoom level"
              />
              <button
                type="button"
                onClick={() => setZoomLevel(zoomLevel * 1.2)}
                className="min-h-7 min-w-7 rounded text-foreground/80 hover:bg-muted hover:text-foreground disabled:opacity-40"
                disabled={zoomLevel >= MAX_ZOOM - 0.01}
                aria-label="Zoom in"
              >+</button>
              <span className="num w-9 text-right text-[10px] text-muted-foreground">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={resetZoom}
                className="min-h-7 rounded px-1.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Reset zoom"
              >맞춤</button>
              {viewMode === "map" && (
                <button
                  type="button"
                  onClick={resetLayout}
                  className="min-h-7 rounded border-l border-border px-2 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Reset node layout"
                >
                  배치 초기화
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Skill Level Legend (when skill color mode active) */}
      {colorMode === "skill" && (
        <div className="flex items-center gap-3 px-1">
          <span className="text-[10px] text-muted-foreground">Skill:</span>
          {[0, 1, 2, 3, 4, 5].map((lv) => (
            <div key={lv} className="flex items-center gap-1">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: SKILL_LEVEL_COLORS[lv], opacity: lv === 0 ? 0.3 : 1 }}
              />
              <span className="text-[9px] text-muted-foreground">
                {lv === 0 ? "Locked" : `Lv.${lv}`}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex w-full flex-col items-stretch gap-4 lg:flex-row lg:items-start">
        {/* SVG Map — 고정 너비 기반, 마우스 휠 줌 제거 (페이지 스크롤 방해 방지) */}
        <div className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden rounded-xl border border-border bg-card/60 p-1.5">
          <span className="pointer-events-none sticky left-2 top-2 z-10 ml-2 inline-block rounded-md border border-border bg-card/90 px-2 py-1 text-[10px] text-muted-foreground sm:hidden">
            좌우로 밀어 전체 지도 보기
          </span>
          <svg
            ref={svgRef}
            data-testid="sensei-navmap-canvas"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            className="min-h-[420px] w-full min-w-[820px] touch-none sm:min-h-[520px] sm:min-w-0"
            style={{ cursor: isPanning ? "grabbing" : "grab" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <defs>
              {Object.entries(EDGE_COLORS).map(([type, color]) => {
                const markerScale = 1 / zoomLevel
                return (
                <marker
                  key={type}
                  id={`arrowhead-${type}`}
                  markerWidth={9 * markerScale}
                  markerHeight={7 * markerScale}
                  refX={8 * markerScale}
                  refY={3.5 * markerScale}
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <polygon
                    points={`0 0, ${9 * markerScale} ${3.5 * markerScale}, 0 ${7 * markerScale}`}
                    fill={color}
                  />
                </marker>
                )
              })}
            </defs>

            <g opacity={viewMode === "focus" ? 0.35 : 1}>
                {/* Layer labels */}
                {(["standing", "submission", "control", "leglock"] as PositionLayer[])
                  .filter((layer) => viewMode === "map" || displayedLayers.has(layer))
                  .map((layer) => (
                    <text key={layer} x={15} y={LAYER_Y_MAP[layer] + 4} fill={LAYER_COLORS[layer]} fontSize={10} fontWeight={600} opacity={0.4}>
                      {layer.toUpperCase()}
                    </text>
                  ))}
                {(viewMode === "map" || displayedLayers.has("guard")) && (
                  <text x={15} y={GUARD_START_Y - 24} fill={LAYER_COLORS.guard} fontSize={10} fontWeight={600} opacity={0.4}>
                    GUARD
                  </text>
                )}
                {(viewMode === "map" || displayedLayers.has("passing")) && (
                  <text x={PASSING_REGION_X + 8} y={GUARD_START_Y - 24} fill={LAYER_COLORS.passing} fontSize={10} fontWeight={600} opacity={0.4}>
                    PASSING
                  </text>
                )}

                {/* Guard family labels */}
                {(viewMode === "map" || displayedLayers.has("guard")) && GUARD_FAMILY_ORDER.map((fam) => (
                    <text key={fam} x={15} y={GUARD_START_Y + GUARD_FAMILY_Y[fam] + 4} fill={LAYER_COLORS.guard} fontSize={9} fontWeight={500} opacity={0.35}>
                      {GUARD_FAMILY_LABELS[fam]}
                    </text>
                  ))}

                {viewMode === "map" && (
                  <rect x={5} y={GUARD_START_Y - 15} width={SVG_W - 10} height={GUARD_HEIGHT + 20} rx={8} fill="none" stroke="var(--border)" strokeOpacity={0.25} />
                )}
                {(viewMode === "map" || displayedLayers.has("guard")) && (
                  <rect x={5} y={GUARD_START_Y - 15} width={PASSING_REGION_X - 15} height={GUARD_HEIGHT + 20} rx={8} fill={LAYER_COLORS.guard} fillOpacity={0.03} stroke={LAYER_COLORS.guard} strokeOpacity={viewMode === "focus" ? 0.08 : 0} />
                )}
                {(viewMode === "map" || displayedLayers.has("passing")) && (
                  <rect x={PASSING_REGION_X} y={GUARD_START_Y - 15} width={SVG_W - PASSING_REGION_X - 5} height={GUARD_HEIGHT + 20} rx={8} fill={LAYER_COLORS.passing} fillOpacity={0.03} stroke={LAYER_COLORS.passing} strokeOpacity={viewMode === "focus" ? 0.08 : 0} />
                )}
                {viewMode === "map" && (
                  <line x1={PASSING_REGION_X} y1={GUARD_START_Y - 15} x2={PASSING_REGION_X} y2={GUARD_START_Y + GUARD_HEIGHT + 5} stroke="var(--border)" strokeOpacity={0.25} />
                )}
                {viewMode === "focus" && (
                  <text x={SVG_W - 18} y={SVG_H - 18} textAnchor="end" fill="var(--muted-foreground)" fontSize={9} opacity={0.32}>
                    원래 지도 좌표 유지
                  </text>
                )}
            </g>

            {/* Map에서는 문맥 엣지만, Focus에서는 로컬 전이를 모두 표시 */}
            {visibleTransitions.map((t) => {
              const from = nodePositions[t.from]
              const to = nodePositions[t.to]
              if (!from || !to) return null

              const transitionKey = getTransitionKey(t)
              const isHighlightedPlan = !highlightIds || (highlightIds.has(t.from) && highlightIds.has(t.to))
              const isConnected = activeNodeId && (t.from === activeNodeId || t.to === activeNodeId)
              const isSelectedEdge = transitionKey === selectedTransitionKey
              const isHoveredEdge = transitionKey === hoveredTransitionKey

              if (viewMode === "map") {
                if (!isConnected && highlightIds === null) return null
                if (!isHighlightedPlan && !isConnected) return null
              }

              const color = EDGE_COLORS[t.type] || EDGE_COLORS.transition
              const dx = to.x - from.x
              const dy = to.y - from.y
              const distance = Math.max(Math.hypot(dx, dy), 1)
              const unitX = dx / distance
              const unitY = dy / distance
              const fromScale = nodeVisualScale(t.from)
              const toScale = nodeVisualScale(t.to)
              const start = {
                x: from.x + unitX * 22 * fromScale,
                y: from.y + unitY * 22 * fromScale,
              }
              const end = {
                x: to.x - unitX * 24 * toScale,
                y: to.y - unitY * 24 * toScale,
              }
              const reverseExists = visibleTransitions.some(
                (candidate) => candidate.from === t.to && candidate.to === t.from,
              )
              const curveDirection = t.from.localeCompare(t.to) <= 0 ? 1 : -1
              const curvature = reverseExists ? 42 * curveDirection : 18
              const normalX = -unitY
              const normalY = unitX
              const cx = ((start.x + end.x) / 2) + normalX * curvature
              const cy = ((start.y + end.y) / 2) + normalY * curvature
              const labelProgress = t.from === selectedNodeId
                ? 0.66
                : t.to === selectedNodeId
                  ? 0.34
                  : 0.5
              const inverseLabelProgress = 1 - labelProgress
              const labelX = (inverseLabelProgress ** 2 * start.x)
                + (2 * inverseLabelProgress * labelProgress * cx)
                + (labelProgress ** 2 * end.x)
              const labelY = (inverseLabelProgress ** 2 * start.y)
                + (2 * inverseLabelProgress * labelProgress * cy)
                + (labelProgress ** 2 * end.y)
              const labelWidth = Math.max(54, Array.from(t.action).length * 9 + 18)
              const opacity = isSelectedEdge || isHoveredEdge
                ? 1
                : selectedTransitionKey
                  ? 0.12
                  : isConnected
                    ? 0.9
                    : viewMode === "focus"
                      ? 0.34
                      : 0.25
              const markerType = t.type in EDGE_COLORS ? t.type : "transition"

              return (
                <g
                  key={transitionKey}
                  role="button"
                  tabIndex={0}
                  aria-label={`${t.action} 전이 보기`}
                  aria-pressed={isSelectedEdge}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    setSelectedTransitionKey(transitionKey)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    setSelectedTransitionKey(transitionKey)
                  }}
                  onPointerEnter={() => setHoveredTransitionKey(transitionKey)}
                  onPointerLeave={() => setHoveredTransitionKey(null)}
                  className="cursor-pointer outline-none focus-visible:[filter:drop-shadow(0_0_5px_var(--ring))]"
                  opacity={opacity}
                >
                  <title>{t.condition ? `${t.action} · ${t.condition}` : t.action}</title>
                  <path
                    d={`M${start.x},${start.y} Q${cx},${cy} ${end.x},${end.y}`}
                    stroke="transparent"
                    strokeWidth={16}
                    fill="none"
                  />
                  <path
                    d={`M${start.x},${start.y} Q${cx},${cy} ${end.x},${end.y}`}
                    stroke={color}
                    strokeWidth={isSelectedEdge ? 3.5 : isConnected ? 2.5 : 1.5}
                    fill="none"
                    markerEnd={`url(#arrowhead-${markerType})`}
                    className="transition-[stroke-width,opacity] duration-150"
                  />
                  {viewMode === "focus" && (isSelectedEdge || isHoveredEdge) && (
                    <g
                      transform={`translate(${labelX}, ${labelY}) scale(${focusLabelScale})`}
                      style={{ pointerEvents: "none" }}
                    >
                      <rect
                        x={-labelWidth / 2}
                        y={-10}
                        width={labelWidth}
                        height={20}
                        rx={7}
                        fill="var(--card)"
                        stroke={color}
                        strokeOpacity={isSelectedEdge || isHoveredEdge ? 0.8 : 0.35}
                      />
                      <text
                        textAnchor="middle"
                        dy={3}
                        fill="var(--foreground)"
                        fontSize={9}
                        fontWeight={600}
                      >
                        {t.action}
                      </text>
                    </g>
                  )}
                  {isHoveredEdge && t.condition && (
                    <foreignObject
                      x={Math.max(8, Math.min(SVG_W - 248, labelX - 120))}
                      y={labelY + 14}
                      width={240}
                      height={58}
                      style={{ pointerEvents: "none" }}
                    >
                      <div className="rounded-lg border border-border bg-popover px-2.5 py-2 text-[11px] leading-4 text-popover-foreground shadow-xl">
                        <span className="font-semibold text-foreground">상황</span>
                        <span className="ml-1.5">{t.condition}</span>
                      </div>
                    </foreignObject>
                  )}
                </g>
              )
            })}

            {/* Nodes */}
            {displayedPositions.map((pos) => {
              const xy = nodePositions[pos.id]
              if (!xy) return null

              const focusNode = focusGraph?.nodes.find((node) => node.position.id === pos.id)
              const isTransitionEndpoint = !selectedTransition
                || selectedTransition.from === pos.id
                || selectedTransition.to === pos.id
              const isHighlighted = viewMode === "focus"
                ? isTransitionEndpoint
                : !highlightIds || highlightIds.has(pos.id)
              const isSelected = pos.id === selectedNodeId
              const isHovered = pos.id === hoveredNodeId
              const isActive = isSelected || isHovered

              // Skill level for this position
              const skillCount = positionSkillMap[pos.id] ?? 0
              const { level: skillLevel } = getSkillLevel(skillCount)

              // Color based on mode
              const layerColor = LAYER_COLORS[pos.layer]
              const color = colorMode === "skill" ? SKILL_LEVEL_COLORS[skillLevel] : layerColor

              // In skill mode, scale opacity/size by skill level
              const skillOpacityScale = colorMode === "skill"
                ? skillLevel === 0 ? 0.15 : 0.3 + skillLevel * 0.14
                : 1
              const focusDepthOpacity = focusNode?.depth === 2 ? 0.62 : 1
              const nodeOpacity = isHighlighted
                ? skillOpacityScale * focusDepthOpacity
                : 0.1
              const baseR = colorMode === "skill" ? 12 + skillLevel * 1.6 : 16
              const r = isActive ? baseR + 4 : baseR
              const hasSkillGlow = colorMode === "skill" && skillLevel >= 4
              const isPinned = viewMode === "map" && Boolean(pinnedPositions[pos.id])
              const visualScale = nodeVisualScale(pos.id)

              return (
                <g
                  key={pos.id}
                  transform={`translate(${xy.x}, ${xy.y}) scale(${visualScale})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${pos.nameKr || pos.name} 스킬 보기`}
                  aria-pressed={isSelected}
                  data-pinned={isPinned ? "true" : undefined}
                  onPointerDown={(event) => handleNodePointerDown(event, pos.id, xy)}
                  onClick={(event) => {
                    event.stopPropagation()
                    selectNode(pos.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return
                    e.preventDefault()
                    selectNode(pos.id)
                  }}
                  onPointerEnter={() => setHoveredNodeId(pos.id)}
                  onPointerLeave={() => setHoveredNodeId(null)}
                  onFocus={() => setHoveredNodeId(pos.id)}
                  onBlur={() => setHoveredNodeId(null)}
                  className={`${viewMode === "map" ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} outline-none focus-visible:[filter:drop-shadow(0_0_6px_var(--ring))]`}
                  opacity={nodeOpacity}
                >
                  {/* Skill glow for Lv4+ */}
                  {hasSkillGlow && (
                    <circle r={r + 10} fill={color} fillOpacity={skillLevel === 5 ? 0.15 : 0.08} />
                  )}
                  {/* Glow for active */}
                  {isActive && <circle r={r + 6} fill={color} fillOpacity={0.12} />}
                  <circle
                    r={r}
                    fill={color}
                    fillOpacity={isActive ? 0.25 : (colorMode === "skill" && skillLevel === 0 ? 0.05 : 0.12)}
                    stroke={color}
                    strokeWidth={isActive ? 2.5 : (hasSkillGlow ? 2 : 1.5)}
                  />
                  {isPinned && (
                    <circle
                      cx={r * 0.72}
                      cy={-r * 0.72}
                      r={4}
                      fill="var(--foreground)"
                      stroke="var(--card)"
                      strokeWidth={2}
                    />
                  )}
                  {/* Abbreviation inside node */}
                  <text
                    textAnchor="middle"
                    dy={4}
                    fill={color}
                    fontSize={compactFocus ? 12 : compactMap ? 10 : 8}
                    fontWeight={700}
                    style={{ pointerEvents: "none" }}
                  >
                    {abbr(pos)}
                  </text>
                  {/* Full name below */}
                  {!compactFocus && (
                    <text
                      textAnchor="middle"
                      dy={r + 12}
                      fill="var(--foreground)"
                      fontSize={compactMap ? 9 : 8}
                      opacity={isActive ? 0.9 : (colorMode === "skill" && skillLevel === 0 ? 0.2 : 0.5)}
                      fontWeight={isActive ? 600 : 400}
                      style={{ pointerEvents: "none" }}
                    >
                      {pos.nameKr || pos.name}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>

          {selectedTransition && (
            <aside
              data-testid="navmap-transition-detail"
              className="absolute inset-x-3 bottom-3 z-20 space-y-3 rounded-xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-sm sm:left-auto sm:w-80"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Transition
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-foreground">
                    {selectedTransition.action}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedTransitionFrom?.nameKr ?? selectedTransition.from}
                    <span className="mx-1.5 text-orange-400">→</span>
                    {selectedTransitionTo?.nameKr ?? selectedTransition.to}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="전이 상세 닫기"
                  onClick={() => setSelectedTransitionKey(null)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  ×
                </button>
              </div>

              {selectedTransition.condition && (
                <div className="rounded-lg border border-orange-500/20 bg-orange-500/10 px-3 py-2">
                  <p className="text-[10px] font-semibold text-orange-300">상황</p>
                  <p className="mt-1 text-xs leading-5 text-foreground/85">
                    {selectedTransition.condition}
                  </p>
                </div>
              )}

              {selectedTransition.evidence && (
                <div className="space-y-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold text-cyan-300">
                      내 기록 근거
                    </p>
                    <span className="text-[10px] text-cyan-200/80">
                      {selectedTransition.evidence.count}회
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedTransition.evidence.kinds.map((kind) => (
                      <span
                        key={kind}
                        className="rounded-full border border-cyan-400/20 px-1.5 py-0.5 text-[9px] text-cyan-100/80"
                      >
                        {EVIDENCE_KIND_LABELS[kind]}
                      </span>
                    ))}
                  </div>
                  {selectedTransition.evidence.snippets.slice(0, 2).map((snippet) => (
                    <p
                      key={snippet}
                      className="text-[10px] leading-4 text-foreground/70"
                    >
                      {snippet}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className="rounded-full border border-border bg-muted px-2 py-1 text-muted-foreground">
                  {selectedTransition.type}
                </span>
                <span className="rounded-full border border-border bg-muted px-2 py-1 text-muted-foreground">
                  {selectedTransition.ruleSet === "common" ? "Gi · No-Gi" : selectedTransition.ruleSet}
                </span>
                {selectedTransition.lessonNumber && (
                  <span className="rounded-full border border-border bg-muted px-2 py-1 text-muted-foreground">
                    Lesson {selectedTransition.lessonNumber}
                  </span>
                )}
              </div>

              {selectedTransition.videoUrl && (
                <a
                  href={selectedTransition.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  관련 영상 보기 ↗
                </a>
              )}
            </aside>
          )}
        </div>

        {!selectedNode && (
          <div
            aria-hidden="true"
            className="hidden w-72 shrink-0 lg:block"
          />
        )}

        {/* Detail Panel */}
        {selectedNode && (
          <aside
            data-testid="navmap-detail"
            data-selected-node={selectedNode.id}
            className="w-full shrink-0 space-y-3 rounded-xl border border-border bg-card p-4 lg:sticky lg:top-20 lg:w-72"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{selectedNode.nameKr}</h3>
                <p className="text-xs text-muted-foreground">{selectedNode.name}</p>
              </div>
              <button
                type="button"
                aria-label="선택 해제"
                onClick={clearSelection}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                ×
              </button>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
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
                {/* Skill Level Badge */}
                {(() => {
                  const sc = positionSkillMap[selectedNode.id] ?? 0
                  const displayCount = Math.max(sc, selectedEvidenceCount)
                  const { level, label } = getSkillLevel(displayCount)
                  const skillColor = SKILL_LEVEL_COLORS[level]
                  return (
                    <span
                      className="inline-block px-2 py-0.5 rounded text-[10px] font-bold"
                      style={{ backgroundColor: skillColor + "25", color: skillColor, border: `1px solid ${skillColor}40` }}
                    >
                      {label} ({displayCount}회)
                    </span>
                  )
                })()}
              </div>
            </div>

            {/* Training Log Info */}
            {(() => {
              const info = trainingMap[selectedNode.id]
              if (!info) return (
                <p className="text-muted-foreground/60 text-[11px]">
                  {selectedEvidenceCount > 0
                    ? `연결 근거 ${selectedEvidenceCount}회 · 노트/논의 기반`
                    : "수업 기록 없음"}
                </p>
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
                        onClick={() => selectNode(t.to)}
                        className="w-full text-left flex items-center gap-1.5 px-2 py-1 rounded text-[11px] hover:bg-muted transition-colors"
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: EDGE_COLORS[t.type] }} />
                        <span className="text-foreground/90 truncate">{t.action}</span>
                        {t.evidence && (
                          <span className="shrink-0 rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-[9px] text-cyan-300">
                            기록 {t.evidence.count}
                          </span>
                        )}
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
                        onClick={() => selectNode(t.from)}
                        className="w-full text-left flex items-center gap-1.5 px-2 py-1 rounded text-[11px] hover:bg-muted transition-colors"
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: EDGE_COLORS[t.type] }} />
                        <span className="text-muted-foreground shrink-0 text-[10px]">{fromPos?.nameKr || t.from} →</span>
                        {t.evidence && (
                          <span className="shrink-0 rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-[9px] text-cyan-300">
                            기록 {t.evidence.count}
                          </span>
                        )}
                        <span className="text-foreground/90 truncate ml-auto">{t.action}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
