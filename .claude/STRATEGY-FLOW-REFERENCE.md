# Strategy Flow — 렌더링 로직 레퍼런스

## Claude Code에 줄 지시
아래 HTML/JS 렌더링 로직을 React 컴포넌트로 옮겨라.
디자인과 인터랙션을 **그대로** 유지할 것.

## 핵심 렌더링 로직

### 1. 플로우차트 = SVG 라인 + absolute positioned 노드
```
- 컨테이너: position: relative, overflow-x: auto
- SVG: position: absolute, top:0, left:0 (라인 전용)
- 노드: position: absolute, left/top으로 배치 (div)
- 분기 조건 라벨: position: absolute, 라인 중간점에 배치
```

### 2. 노드 렌더링
```tsx
// 각 step의 positionId로 POS 맵에서 색상/이름 조회
// hub 노드는 border-width: 2.5px (일반은 1.5px)
// 색상 체계: skillConnections의 layer 색상과 동일
//   standing=#71717a, guard=#a855f7, passing=#22c55e
//   control=#3b82f6, escape=#f97316, sub=#ef4444
// 다크모드: bg rgba(color, 0.12), border rgba(color, 0.4)
```

### 3. 라인 렌더링 (SVG)
```tsx
// branches 배열 순회 → from/to 좌표로 line 생성
// 기본: stroke rgba(255,255,255,0.08), width 1.2
// 선택 시: stroke = 노드 색상, width 2.5
// 분기 조건 텍스트: 라인 중간점에 absolute div로 표시
```

### 4. 노드 클릭 인터랙션
```
1. 선택된 노드 + 연결된 노드만 보임, 나머지 dim (opacity 0.12)
2. SVG 라인도 연결된 것만 하이라이트
3. info 패널에: 포지션명 + 액션 + 교본 링크 + 분기 + 출발점
4. 분기 태그 클릭 → 해당 노드 select
5. edit/delete 링크 (내 전략만)
```

### 5. Pro 전략 Import
```
1. 선수 전략 deep copy
2. id에 'my-' prefix + timestamp
3. name에 '(imported)' 추가
4. myStrats 배열에 push
5. mine 탭으로 전환
```

### 6. 스텝 추가 (빌더)
```
1. 포지션 select + 자연어 action input
2. 마지막 스텝에 자동으로 branch 연결
3. y좌표 = steps.length * 100 + 30 (자동 배치)
4. 렌더 갱신
```

### 7. 데이터 구조
```typescript
interface Strategy {
  id: string
  name: string
  desc: string
  rule: 'gi' | 'nogi'
  steps: StrategyStep[]
}

interface StrategyStep {
  id: string
  pos: string          // positionId from skillConnections
  act: string          // action description
  x: number            // SVG x coordinate
  y: number            // SVG y coordinate
  hub: 0 | 1           // 1 = key position (thicker border)
  branches?: Branch[]
  lesson?: number       // 교본 번호
}

interface Branch {
  cond: string          // "상대가 서면", "스윕 성공" 등
  to: string            // target step id
}
```

## React 변환 시 주의사항
1. steps의 x,y 좌표는 state로 관리 (나중에 드래그 이동 가능하도록)
2. localStorage로 persist (lib/sensei/userStrategies.ts)
3. Pro 전략은 archetypes.ts의 gameplan에서 변환
4. 교본 번호 → lessonVideos.ts에서 URL 조회
5. positionId → skillConnections.ts의 POSITIONS에서 조회
