# Strategy 탭 — 게임플랜 관리

## 컨셉
경기(롤링)를 풀어가는 흐름을 시각적으로 저장/관리하는 탭.
스킬트리의 포지션/전환 데이터와 연동.

## 데이터 구조

```typescript
interface Strategy {
  id: string
  name: string                // "내 기본 Gi 게임플랜"
  description?: string        // "하프가드 기반 코요테 시스템"
  ruleSet: "gi" | "nogi"
  type: "mine" | "pro"        // 내 전략 vs 선수 전략
  proName?: string            // type=pro일 때 선수 이름
  
  // 플로우: 순서가 있는 포지션 체인
  flow: StrategyStep[]
  
  // 메타
  createdAt: string
  updatedAt: string
  tags?: string[]             // 자유 태그
  notes?: string              // 메모
}

interface StrategyStep {
  positionId: string          // skillConnections의 position ID (hg, situp, side_top 등)
  action: string              // "언더훅 잡고 코요테 스윕"
  condition?: string          // "상대가 눌러올 때" (분기 조건)
  branches?: StrategyBranch[] // 상대 반응에 따른 분기
  lessonNumber?: number       // 교본 연결
  videoUrl?: string           // 유튜브 링크
  notes?: string              // 개인 메모/디테일
}

interface StrategyBranch {
  condition: string           // "상대가 서면", "상대가 막으면"
  nextStepIndex: number       // flow 배열의 인덱스 (분기점)
  // 또는 별도 flow
  alternateFlow?: StrategyStep[]
}
```

## 예시 데이터

### 내 기본 Gi 게임플랜
```typescript
{
  id: "my-gi-main",
  name: "코요테 하프가드 시스템",
  description: "하프가드 기반. 스승(조준용) 스타일.",
  ruleSet: "gi",
  type: "mine",
  flow: [
    {
      positionId: "standing",
      action: "가드풀 → 클로즈 or 버터플라이",
      branches: [
        { condition: "테이크다운 당하면", nextStepIndex: 3 },  // → 하프가드
      ]
    },
    {
      positionId: "closed",
      action: "클로즈 가드에서 그립 잡고 공격 위협",
      branches: [
        { condition: "상대가 포스처업", nextStepIndex: 2 },  // → 오픈가드
        { condition: "상대가 한 다리 넘기면", nextStepIndex: 3 }, // → 하프가드
      ]
    },
    {
      positionId: "open",
      action: "오픈가드 → 거리 관리",
      branches: [
        { condition: "발 걸 수 있으면", nextStepIndex: 4 },   // → DLR
        { condition: "상대가 다가오면", nextStepIndex: 3 },    // → 하프가드 허용
      ]
    },
    {
      positionId: "hg",  // ★ 메인 포지션
      action: "하프가드 — 언더훅 확보가 최우선",
      lessonNumber: 47,
      notes: "니쉴드로 거리 만들고 → 언더훅 → 싯업",
      branches: [
        { condition: "언더훅 잡으면", nextStepIndex: 4 },     // → 싯업
        { condition: "상대가 눌러오면", nextStepIndex: 5 },   // → 딥하프
        { condition: "상대가 서면", nextStepIndex: 6 },       // → DLR
      ]
    },
    {
      positionId: "situp",  // ★ 공격 발사대
      action: "싯업 가드 → 코요테 스윕 or 암드래그",
      lessonNumber: 35,
      notes: "싱글레그 그립 → 스윕 → 탑",
      branches: [
        { condition: "스윕 성공", nextStepIndex: 7 },         // → 사이드(탑)
        { condition: "상대가 막으면", nextStepIndex: 8 },     // → 백테이크
        { condition: "다시 눕혀지면", nextStepIndex: 3 },     // → 하프가드 리셋
      ]
    },
    {
      positionId: "dhg",
      action: "딥하프 → 호머 스윕",
      notes: "밑으로 파고들어서 스윕",
      branches: [
        { condition: "스윕 성공", nextStepIndex: 7 },         // → 사이드(탑)
        { condition: "실패", nextStepIndex: 3 },              // → 하프가드 리셋
      ]
    },
    {
      positionId: "dlr",
      action: "DLR → SLX or 싯업으로 전환",
      branches: [
        { condition: "훅 잡으면", nextStepIndex: 4 },         // → 싯업으로 전환
        { condition: "상대 무너지면", nextStepIndex: 3 },     // → 하프가드
      ]
    },
    {
      positionId: "side_top",  // ★ 탑 도착
      action: "사이드 컨트롤 → 마운트 or 백",
      lessonNumber: 2,
      branches: [
        { condition: "마운트 전환", nextStepIndex: 9 },
        { condition: "백테이크 기회", nextStepIndex: 8 },
      ]
    },
    {
      positionId: "back_top",  // ★ 최종 목표
      action: "백 컨트롤 → RNC 피니쉬",
      lessonNumber: 51,
    },
    {
      positionId: "mount_top",
      action: "마운트 → 초크 or 암바",
      lessonNumber: 38,
    },
  ]
}
```

### 이스케이프 게임플랜 (불리한 상황)
```typescript
{
  id: "my-escape-plan",
  name: "이스케이프 플랜",
  description: "불리한 포지션에서 탈출 우선순위",
  ruleSet: "gi",
  type: "mine",
  flow: [
    {
      positionId: "side_bottom",
      action: "사이드 당함 → 새우빼기 → 하프가드 만들기",
      lessonNumber: 1,
      branches: [
        { condition: "하프가드 만들면", nextStepIndex: 3 },  // → 하프가드(메인게임)
        { condition: "못 빠지면", nextStepIndex: 1 },       // → 계속 프레임
      ]
    },
    {
      positionId: "mount_bottom",
      action: "마운트 당함 → 엘보우-니 탈출 → 하프가드",
      lessonNumber: 42,
      branches: [
        { condition: "하프가드 만들면", nextStepIndex: 3 },
      ]
    },
    {
      positionId: "back_bottom",
      action: "백 당함 → 벽 만들고 → 하프가드로 전환",
      lessonNumber: 52,
    },
    {
      positionId: "hg",
      action: "★ 하프가드 도착 → 메인 게임 시작",
      notes: "여기서부터 코요테 시스템 가동",
    },
  ]
}
```

## 선수 전략 (아키타입에서 자동 생성)

기존 archetypes.ts의 gameplan 필드를 Strategy 형식으로 변환:

```typescript
// archetypes.ts의 gameplan → Strategy 변환
function archetypeToStrategy(arch: Archetype): Strategy {
  return {
    id: `pro-${arch.name.toLowerCase().replace(/\s/g, '-')}`,
    name: `${arch.name}의 게임플랜`,
    description: arch.playstyle,
    ruleSet: arch.ruleSet as "gi" | "nogi",
    type: "pro",
    proName: arch.name,
    flow: arch.gameplan.map(gp => ({
      positionId: tagToPositionId(gp.position),  // 태그 → position ID 변환
      action: gp.action,
      branches: gp.next.map(n => ({
        condition: n,
        nextStepIndex: -1,  // 자동 연결
      })),
    })),
    createdAt: "",
    updatedAt: "",
  }
}
```

## UI 구조

### Strategy 탭 레이아웃

```
┌────────────────────────────────────────────────────┐
│ [내 전략]  [선수 전략]  [+ 새 전략]                  │
├────────────────────────────────────────────────────┤
│                                                    │
│  ┌─ 코요테 하프가드 시스템 (Gi) ────────────────┐  │
│  │                                               │  │
│  │  Standing                                     │  │
│  │     ↓ 가드풀                                  │  │
│  │  Closed Guard                                 │  │
│  │     ↓ 상대가 한 다리 넘기면                   │  │
│  │  ★ Half Guard  ←──── (이스케이프 도착점)      │  │
│  │     ├→ 언더훅 잡으면 → Sit-up Guard           │  │
│  │     ├→ 상대가 눌러오면 → Deep Half            │  │
│  │     └→ 상대가 서면 → DLR                      │  │
│  │                                               │  │
│  │  Sit-up Guard (코요테)                        │  │
│  │     ├→ 스윕 성공 → Side Control (탑) ★       │  │
│  │     └→ 암드래그 → Back Control ★              │  │
│  │                                               │  │
│  │  Side Control (탑)                            │  │
│  │     ├→ Mount → 초크/암바                      │  │
│  │     └→ Back → RNC                             │  │
│  │                                               │  │
│  └───────────────────────────────────────────────┘  │
│                                                    │
│  각 노드 클릭 → 교본 영상 링크 + 개인 메모          │
│  노드는 스킬트리의 position 데이터와 동일           │
│                                                    │
└────────────────────────────────────────────────────┘
```

### 플로우 시각화
- SVG 기반 플로우차트 (세로 흐름)
- 각 노드 = skillConnections의 position (같은 색상 체계)
- 분기점에서 가지가 갈라짐 (상대 반응별)
- ★ 표시 = 핵심 포지션 (내가 가장 자신있는 곳)
- 노드 클릭 → 교본 영상 + 메모 + 스킬트리 해당 포지션으로 이동 가능

### 선수 전략 비교
- 내 전략과 선수 전략을 나란히 놓고 비교
- "Lucas Leite처럼 되려면 내 전략에서 뭘 바꿔야 하지?" 분석
- Coach 탭과 연동: "내 전략 분석해줘" → AI가 약점/개선점 제시

## 저장
- localStorage (Phase 1)
- Notion DB (Phase 2 — 체육관 멀티유저 시 공유)

## 기존 데이터 연동

1. **스킬트리 연동**: Strategy의 positionId = skillConnections.ts의 position.id
   → 스킬트리에서 "이 포지션이 내 전략에서 몇 번 등장하는지" 표시 가능
   → 전략에 사용된 포지션을 스킬트리에서 하이라이트

2. **아키타입 연동**: 선수 전략 = archetypes.ts의 gameplan 변환
   → BJJ Heroes 탭에서 선수 게임플랜 클릭 → Strategy 탭으로 이동

3. **수련 기록 연동**: 태그 빈도로 "내가 전략대로 수련하고 있는지" 분석
   → "코요테 시스템인데 HG, Situp 태그가 전체의 60% → 전략 일치도 높음"
   → "DLR 태그가 1% → 전략에 DLR 분기가 있는데 연습 부족"

4. **Coach 연동**: AI가 전략을 읽고 코칭
   → "당신의 코요테 시스템에서 딥하프 분기가 약합니다. DHG 스윕을 연습하세요."

5. **대회 연동**: 대회 전 "이 대회에서 쓸 전략" 지정
   → 대회 결과와 전략 비교 분석

## 탭 순서
🏠 Dashboard / ⚔️ Character / 📝 Journal / 📊 Stats / 🎯 Strategy / 🏆 BJJ Heroes / 📅 Competition / 🤖 Coach

## Claude Code 지시

1. lib/sensei/strategies.ts 생성 — Strategy, StrategyStep, StrategyBranch 타입 + 기본 데이터
2. lib/sensei/userStrategies.ts — localStorage CRUD
3. components/sensei/SenseiStrategy.tsx — Strategy 탭 UI
4. 아키타입 gameplan → Strategy 자동 변환 함수
5. 탭에 Strategy 추가
