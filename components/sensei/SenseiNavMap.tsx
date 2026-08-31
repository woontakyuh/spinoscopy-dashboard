"use client"

import { NavMapCanvas } from "@/components/sensei/nav-map/NavMapCanvas"
import { NavMapLegend } from "@/components/sensei/nav-map/NavMapLegend"
import { NavMapToolbar } from "@/components/sensei/nav-map/NavMapToolbar"
import { useNavMapController } from "@/components/sensei/nav-map/useNavMapController"
import { useNavMapData } from "@/components/sensei/nav-map/useNavMapData"
import { useNavMapLayoutInteractions } from "@/components/sensei/nav-map/useNavMapLayoutInteractions"

export function SenseiNavMap() {
  const data = useNavMapData()
  const layout = useNavMapLayoutInteractions()
  const map = useNavMapController({ data, layout })

  return (
    <div
      data-testid="sensei-navmap"
      data-layout-preset={layout.activeLayoutName}
      data-layout-dirty={layout.isLayoutDirty ? "true" : "false"}
      data-athlete={map.selectedAthlete?.name}
      data-compare={map.isComparing ? "split" : "off"}
      className="space-y-4"
    >
      <NavMapToolbar
        view={{
          mode: map.viewMode,
          selectedNodeId: map.selectedNodeId,
          focusDepth: map.focusDepth,
          onModeChange: map.setViewMode,
          onFocusDepthChange: map.setFocusDepth,
        }}
        gamePlan={{
          plans: data.gamePlans,
          selectedPlan: map.selectedPlan,
          onPlanChange: map.selectGamePlan,
        }}
        athlete={{
          archetypes: data.archetypes,
          selectedAthleteName: map.selectedAthleteName,
          isComparing: map.isComparing,
          hasSelectedAthlete: Boolean(map.selectedAthlete),
          onAthleteChange: map.selectAthlete,
          onComparingChange: map.toggleComparing,
        }}
        layout={{
          presets: layout.layoutPresets,
          activeName: layout.activeLayoutName,
          name: layout.layoutName,
          isDirty: layout.isLayoutDirty,
          onPresetChange: layout.applyLayoutPreset,
          onNameChange: layout.setLayoutName,
          onSave: layout.saveCurrentLayout,
        }}
        map={{
          colorMode: map.colorMode,
          ruleSetFilter: map.ruleSetFilter,
          zoomLevel: layout.zoomLevel,
          minZoom: layout.minZoom,
          maxZoom: layout.maxZoom,
          onColorModeChange: map.setColorMode,
          onRuleSetFilterChange: map.setRuleSetFilter,
          onZoomChange: layout.setZoomLevel,
          onResetZoom: layout.resetZoom,
          onResetLayout: layout.resetLayout,
        }}
      />

      <NavMapLegend colorMode={map.colorMode} />

      <NavMapCanvas
        comparison={{
          isComparing: map.isComparing,
          graph: map.comparisonGraph,
          selfAttributes: data.selfAttributes,
          selectedAthlete: map.selectedAthlete,
          athleteTacticalMap: map.athleteTacticalMap,
        }}
        viewport={{
          svgRef: layout.svgRef,
          viewBox: layout.viewBox,
          zoomLevel: layout.zoomLevel,
          isPanning: layout.isPanning,
          viewMode: map.viewMode,
          onPointerDown: layout.handlePointerDown,
          onPointerMove: layout.handlePointerMove,
          onPointerUp: layout.handlePointerUp,
        }}
        edges={{
          transitions: map.visibleTransitions,
          nodePositions: map.nodePositions,
          positionsById: map.positionsById,
          activeAttributes: map.activeAttributes,
          viewMode: map.viewMode,
          selectedNodeId: map.selectedNodeId,
          selectedTransitionKey: map.selectedTransitionKey,
          hoveredTransitionKey: map.hoveredTransitionKey,
          activeNodeId: map.activeNodeId,
          highlightIds: map.highlightIds,
          focusLabelScale: map.focusLabelScale,
          nodeVisualScale: map.nodeVisualScale,
          onSelectTransition: map.setSelectedTransitionKey,
          onHoverTransition: map.setHoveredTransitionKey,
        }}
        nodes={{
          positions: map.displayedPositions,
          nodePositions: map.nodePositions,
          focusGraph: map.focusGraph,
          selectedTransition: map.selectedTransition,
          viewMode: map.viewMode,
          selectedNodeId: map.selectedNodeId,
          hoveredNodeId: map.hoveredNodeId,
          highlightIds: map.highlightIds,
          positionSkillMap: data.positionSkillMap,
          activeAttributes: map.activeAttributes,
          pinnedPositions: layout.pinnedPositions,
          colorMode: map.colorMode,
          compactFocus: map.compactFocus,
          compactMap: map.compactMap,
          nodeVisualScale: map.nodeVisualScale,
          onNodePointerDown: layout.handleNodePointerDown,
          onSelectNode: map.selectNode,
          onHoverNode: map.setHoveredNodeId,
        }}
        transitionOverlay={{
          transition: map.selectedTransition,
          fromPosition: map.selectedTransitionFrom,
          toPosition: map.selectedTransitionTo,
          onClose: () => map.setSelectedTransitionKey(null),
        }}
        nodeInspector={map.selectedNode ? {
          node: map.selectedNode,
          positionSkillMap: data.positionSkillMap,
          trainingMap: data.trainingMap,
          outgoing: map.outgoing,
          incoming: map.incoming,
          positions: map.filteredPositions,
          positionsById: map.positionsById,
          onClear: map.clearSelection,
          onSelectNode: map.selectNode,
        } : null}
      />
    </div>
  )
}
