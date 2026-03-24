# Strategy Flow — 드래그 가능한 노드 레이아웃

## 현재 문제
노드가 세로 일자로 나열됨. 가독성 나쁨.
분기가 있는 플로우는 2D 공간에 배치되어야 함.

## 해결: 편집 모드에서 노드 드래그 이동

### 모드 2가지
1. **View 모드** (기본): 노드 클릭 → info 표시. 이동 불가.
2. **Edit 모드** (편집 버튼 토글): 노드 드래그로 자유 이동. "완료" 누르면 위치 저장.

### 드래그 구현 로직 (React)

```typescript
const [dragging, setDragging] = useState<string | null>(null)
const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
const containerRef = useRef<HTMLDivElement>(null)

function onMouseDown(e: React.MouseEvent, stepId: string) {
  if (!editMode) return
  e.preventDefault()
  const step = steps.find(s => s.id === stepId)
  if (!step) return
  const rect = containerRef.current!.getBoundingClientRect()
  setDragging(stepId)
  setDragOffset({ 
    x: e.clientX - rect.left - step.x, 
    y: e.clientY - rect.top - step.y 
  })
}

function onMouseMove(e: React.MouseEvent) {
  if (!dragging) return
  const rect = containerRef.current!.getBoundingClientRect()
  setSteps(prev => prev.map(s => {
    if (s.id !== dragging) return s
    return { 
      ...s, 
      x: Math.max(0, e.clientX - rect.left - dragOffset.x),
      y: Math.max(0, e.clientY - rect.top - dragOffset.y)
    }
  }))
}

function onMouseUp() { setDragging(null) }
```

### 자동 레이아웃 (초기 배치 / x,y 없을 때)

```typescript
function autoLayout(steps: StrategyStep[]): StrategyStep[] {
  // BFS 레벨 할당 → 같은 레벨은 가로 배치
  const incoming = new Set<string>()
  steps.forEach(s => (s.branches || []).forEach(b => incoming.add(b.to)))
  const roots = steps.filter(s => !incoming.has(s.id))
  
  const levels = new Map<string, number>()
  const queue = roots.map(r => ({ id: r.id, level: 0 }))
  while (queue.length) {
    const { id, level } = queue.shift()!
    if (levels.has(id)) continue
    levels.set(id, level)
    const step = steps.find(s => s.id === id)
    step?.branches?.forEach(b => queue.push({ id: b.to, level: level + 1 }))
  }
  
  const groups = new Map<number, string[]>()
  levels.forEach((lv, id) => {
    if (!groups.has(lv)) groups.set(lv, [])
    groups.get(lv)!.push(id)
  })
  
  return steps.map(s => {
    const lv = levels.get(s.id) ?? 0
    const group = groups.get(lv) ?? [s.id]
    const idx = group.indexOf(s.id)
    const totalWidth = group.length * 200
    const startX = Math.max(20, (700 - totalWidth) / 2)
    return { ...s, x: startX + idx * 200, y: lv * 120 + 30 }
  })
}
```

### 컨테이너 구조

```tsx
<div 
  ref={containerRef}
  style={{ position: 'relative', minHeight: 600, overflow: 'auto' }}
  onMouseMove={onMouseMove}
  onMouseUp={onMouseUp}
  onMouseLeave={onMouseUp}
>
  <svg style={{ position: 'absolute', top: 0, left: 0, 
    width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
    {edges.map(e => <line x1={from.x+70} y1={from.y+30} x2={to.x+70} y2={to.y} ... />)}
  </svg>
  
  {steps.map(step => (
    <div
      key={step.id}
      style={{
        position: 'absolute', left: step.x, top: step.y,
        cursor: editMode ? (dragging === step.id ? 'grabbing' : 'grab') : 'pointer',
        minWidth: 140, padding: '8px 12px', borderRadius: 10,
        border: `${step.hub ? 2.5 : 1.5}px solid rgba(color, 0.4)`,
        background: `rgba(color, 0.12)`,
        zIndex: dragging === step.id ? 100 : 2,
      }}
      onMouseDown={e => onMouseDown(e, step.id)}
      onClick={() => !editMode && selectNode(step.id)}
    >
      <div style={{ fontWeight: 500, color }}>{positionName}</div>
      <div style={{ fontSize: 10, opacity: 0.6 }}>{step.act}</div>
      {step.lesson && <div style={{ fontSize: 9, opacity: 0.4 }}>#{step.lesson}</div>}
    </div>
  ))}
  
  {/* 분기 조건 라벨: 엣지 중간점 */}
  {edges.map(e => (
    <div style={{ position: 'absolute', 
      left: (from.x + to.x) / 2 + 70, 
      top: (from.y + to.y) / 2,
      fontSize: 9, padding: '1px 4px', borderRadius: 3
    }}>
      {e.condition}
    </div>
  ))}
</div>
```

### 편집 모드 UI 흐름

```
[편집] 버튼 클릭 → editMode = true
  → 노드에 grab 커서 + 드래그 핸들 아이콘 표시
  → 노드 드래그로 자유 이동 (SVG 라인 실시간 업데이트)
  → 노드 더블클릭 → action 텍스트 인라인 편집
  → [+ 스텝 추가] 버튼 활성화
  → [완료] 버튼 클릭 → 위치 저장 (localStorage) → editMode = false
```

### 엣지 스타일
- 메인 (hub→hub): solid, strokeWidth 2, opacity 0.15
- 분기: strokeDasharray="6,3", strokeWidth 1.2, opacity 0.1
- 선택된 노드 엣지: 노드 색상, strokeWidth 2.5, opacity 0.5
- 나머지: dim (opacity 0.03)

### 색상 (skillConnections 동일)
standing=#71717a, guard=#a855f7, passing=#22c55e,
control=#3b82f6, escape=#f97316, sub=#ef4444, leg=#eab308

### 위치 저장
localStorage key: `sensei-strategy-{strategyId}-positions`
값: { [stepId]: { x, y } }
로드 시: 저장된 위치가 있으면 적용, 없으면 autoLayout()
