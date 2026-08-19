import { useCallback, useEffect, useRef, useState } from "react"
import type { PointerEvent, RefObject } from "react"
import type { NavMapPoint } from "@/lib/sensei/nav-map-focus"
import {
  createLayoutPreset,
  DEFAULT_LAYOUT_NAME,
  loadLayoutPresets,
  saveLayoutPresets,
  upsertLayoutPreset,
  type NavMapLayoutPreset,
  type NavMapViewBox,
} from "@/lib/sensei/nav-map-presets"
import { FULL_VIEW_BOX, SVG_H, SVG_W } from "@/components/sensei/nav-map/nav-map-theme"

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3

interface DraggedNode {
  readonly id: string
  readonly startClientX: number
  readonly startClientY: number
  readonly startPoint: NavMapPoint
  moved: boolean
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export interface NavMapLayoutInteractions {
  readonly svgRef: RefObject<SVGSVGElement | null>
  readonly viewBox: NavMapViewBox
  readonly zoomLevel: number
  readonly isPanning: boolean
  readonly isCompact: boolean
  readonly pinnedPositions: Readonly<Record<string, NavMapPoint>>
  readonly layoutPresets: readonly NavMapLayoutPreset[]
  readonly activeLayoutName: string
  readonly layoutName: string
  readonly isLayoutDirty: boolean
  readonly minZoom: number
  readonly maxZoom: number
  readonly setLayoutName: (name: string) => void
  readonly setZoomLevel: (zoom: number) => void
  readonly resetZoom: () => void
  readonly resetLayout: () => void
  readonly saveCurrentLayout: () => void
  readonly applyLayoutPreset: (name: string) => void
  readonly handlePointerDown: (event: PointerEvent<SVGSVGElement>) => void
  readonly handlePointerMove: (event: PointerEvent<SVGSVGElement>) => void
  readonly handlePointerUp: () => void
  readonly handleNodePointerDown: (
    event: PointerEvent<SVGGElement>,
    positionId: string,
    point: NavMapPoint,
  ) => void
  readonly consumeSuppressedNodeClick: () => boolean
}

export function useNavMapLayoutInteractions(): NavMapLayoutInteractions {
  const svgRef = useRef<SVGSVGElement>(null)
  const [viewBox, setViewBox] = useState<NavMapViewBox>(FULL_VIEW_BOX)
  const [isPanning, setIsPanning] = useState(false)
  const [isCompact, setIsCompact] = useState(false)
  const [pinnedPositions, setPinnedPositions] = useState<Record<string, NavMapPoint>>({})
  const [layoutPresets, setLayoutPresets] = useState<readonly NavMapLayoutPreset[]>([])
  const [activeLayoutName, setActiveLayoutName] = useState(DEFAULT_LAYOUT_NAME)
  const [layoutName, setLayoutName] = useState("")
  const [isLayoutDirty, setIsLayoutDirty] = useState(false)
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 })
  const pinnedPositionsRef = useRef<Record<string, NavMapPoint>>({})
  const draggedNode = useRef<DraggedNode | null>(null)
  const suppressNodeClick = useRef(false)

  useEffect(() => {
    const storage = getBrowserStorage()
    if (!storage) return
    setLayoutPresets(loadLayoutPresets(storage))
  }, [])

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)")
    const sync = () => setIsCompact(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  const resetZoom = useCallback(() => setViewBox(FULL_VIEW_BOX), [])
  const resetLayout = useCallback(() => {
    pinnedPositionsRef.current = {}
    setPinnedPositions({})
    setActiveLayoutName(DEFAULT_LAYOUT_NAME)
    setIsLayoutDirty(false)
    resetZoom()
  }, [resetZoom])
  const setZoomLevel = useCallback((next: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next))
    const width = SVG_W / clamped
    const height = SVG_H / clamped
    setViewBox((current) => ({
      x: current.x + (current.w - width) / 2,
      y: current.y + (current.h - height) / 2,
      w: width,
      h: height,
    }))
    setIsLayoutDirty(true)
  }, [])
  const handlePointerDown = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    setIsPanning(true)
    panStart.current = {
      x: event.clientX,
      y: event.clientY,
      vx: viewBox.x,
      vy: viewBox.y,
    }
    if (event.target instanceof Element) event.target.setPointerCapture(event.pointerId)
  }, [viewBox])
  const handlePointerMove = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const activeDrag = draggedNode.current
    if (activeDrag) {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const point = {
        x: activeDrag.startPoint.x + ((event.clientX - activeDrag.startClientX) * viewBox.w / rect.width),
        y: activeDrag.startPoint.y + ((event.clientY - activeDrag.startClientY) * viewBox.h / rect.height),
      }
      activeDrag.moved ||= Math.hypot(
        event.clientX - activeDrag.startClientX,
        event.clientY - activeDrag.startClientY,
      ) > 3
      const next = { ...pinnedPositionsRef.current, [activeDrag.id]: point }
      pinnedPositionsRef.current = next
      setPinnedPositions(next)
      if (activeDrag.moved) setIsLayoutDirty(true)
      return
    }
    if (!isPanning) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const scaleX = viewBox.w / rect.width
    const scaleY = viewBox.h / rect.height
    const dx = (event.clientX - panStart.current.x) * scaleX
    const dy = (event.clientY - panStart.current.y) * scaleY
    setViewBox((current) => ({
      ...current,
      x: panStart.current.vx - dx,
      y: panStart.current.vy - dy,
    }))
  }, [isPanning, viewBox.h, viewBox.w])
  const handlePointerUp = useCallback(() => {
    const activeDrag = draggedNode.current
    if (activeDrag) {
      suppressNodeClick.current = activeDrag.moved
      draggedNode.current = null
    }
    setIsPanning(false)
  }, [])
  const handleNodePointerDown = useCallback((
    event: PointerEvent<SVGGElement>,
    positionId: string,
    point: NavMapPoint,
  ) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    draggedNode.current = {
      id: positionId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPoint: point,
      moved: false,
    }
  }, [])
  const consumeSuppressedNodeClick = useCallback(() => {
    if (!suppressNodeClick.current) return false
    suppressNodeClick.current = false
    return true
  }, [])
  const saveCurrentLayout = useCallback(() => {
    const storage = getBrowserStorage()
    if (!storage) return
    const result = createLayoutPreset(layoutName, pinnedPositionsRef.current, viewBox)
    if (result.kind === "invalid-name") return

    const next = upsertLayoutPreset(layoutPresets, result.preset)
    setLayoutPresets(next)
    saveLayoutPresets(storage, next)
    setActiveLayoutName(result.preset.name)
    setLayoutName("")
    setIsLayoutDirty(false)
  }, [layoutName, layoutPresets, viewBox])
  const applyLayoutPreset = useCallback((name: string) => {
    if (name === DEFAULT_LAYOUT_NAME) {
      resetLayout()
      return
    }

    const preset = layoutPresets.find((candidate) => candidate.name === name)
    if (!preset) return
    const nextPositions = { ...preset.positions }
    pinnedPositionsRef.current = nextPositions
    setPinnedPositions(nextPositions)
    setViewBox(preset.viewBox)
    setActiveLayoutName(preset.name)
    setIsLayoutDirty(false)
  }, [layoutPresets, resetLayout])

  return {
    svgRef,
    viewBox,
    zoomLevel: SVG_W / viewBox.w,
    isPanning,
    isCompact,
    pinnedPositions,
    layoutPresets,
    activeLayoutName,
    layoutName,
    isLayoutDirty,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    setLayoutName,
    setZoomLevel,
    resetZoom,
    resetLayout,
    saveCurrentLayout,
    applyLayoutPreset,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleNodePointerDown,
    consumeSuppressedNodeClick,
  }
}
