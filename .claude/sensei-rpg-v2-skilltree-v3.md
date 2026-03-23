# Skill Tree v3 — 김관장 교본 기반 재설계

## 참고: 김관장 박사범 "주짓수 교본 60강" 기술 체계도

교본 번호 #1~#60을 우리 태그 시스템과 매핑하고,
교본의 포지션 전이 흐름을 스킬트리 연결 구조로 사용.

---

## 1. 전체 구조 — 교본 기반 3계층

```
┌─ Layer 0: 스탠딩 ──────────────────────────────┐
│  셀프가드(#60), 테이크다운, 가드풀              │
│  앵클픽(#57), 카라드래그(#58), 콤비네이션(#59)  │
└──────────┬──────────────────────────────────────┘
           ↓ 가드풀 / 테이크다운
┌─ Layer 1: 가드 포지션 (바텀) ──────────────────────────────────┐
│                                                                 │
│  ┌ 클로즈 가드 ┐  ┌ 하프 가드 ┐  ┌ 오픈 가드 ┐  ┌ 시팅 가드 ┐ │
│  │ #5 초크      │  │ #47 스윕   │  │ #22 리커버리│  │ #35 시팅1 │ │
│  │ #32 시저스   │  │ #48 리커버리│  │ #27-31     │  │ #35 시팅2 │ │
│  │ #33 플라워   │  │            │  │ 패스리커버리│  │ #36 연결  │ │
│  │ #24 삼각     │  │            │  │            │  │           │ │
│  │ #49 암드래그 │  │            │  │            │  │           │ │
│  └──────────────┘  └────────────┘  └────────────┘  └───────────┘ │
│                                                                   │
│  ┌ 싱글렉X가드 ┐  ┌ 더블훅 가드 ┐                                │
│  │ #24 스윕     │  │ #20 더블앵클 │                                │
│  │ #25 패스     │  │ #20 트라이팟 │                                │
│  │ #26 리커버리 │  │ #21 연결     │                                │
│  └──────────────┘  │ #22 SLX세팅  │                                │
│                    └──────────────┘                                │
└─────────────┬──────────────────────────────────────────────────────┘
              ↓ 스윕 (가드→탑)
              ↑ 패스 (탑→가드 통과) / 이스케이프 (탈출→가드 리커버리)
┌─ Layer 2: 탑 (가드패스) & 컨트롤 포지션 ──────────────────────────┐
│                                                                    │
│  ┌ 가드패스 ──────────────────────────┐                            │
│  │ #9 가드패스 개념                    │                            │
│  │ #10 가드패스                        │                            │
│  │ #7 니슬라이드 패스                  │                            │
│  │ #6 클로즈가드 탈출                  │                            │
│  │ #11 레그드래그                      │                            │
│  │ #12 토레안도                        │                            │
│  │ #13 오버언더                        │                            │
│  │ #14 패스 연결                       │                            │
│  │ #15 상체 그립싸움                   │                            │
│  │ #16 시팅가드 패스                   │                            │
│  │ #44 하프가드 패스1 (컨트롤)         │                            │
│  │ #45 하프가드 패스2 (크로스페이스)   │                            │
│  │ #46 하프가드 패스3 (기본스)         │                            │
│  └────────────────────────────────────┘                            │
│                                                                    │
│  ┌ 사이드 ──┐  ┌ 니온벨리 ┐  ┌ 마운트 ──┐  ┌ 터틀 ──┐  ┌ 백 ──┐  │
│  │유리:      │  │유리:      │  │유리:      │  │유리:    │  │유리:  │  │
│  │ #2 컨트롤 │  │ #17 컨트롤│  │ #38 초크  │  │ #54 백  │  │ #53  │  │
│  │ #4 서브   │  │ #18 서브  │  │ #39 암바  │  │  테이크 │  │ #55  │  │
│  │ #37 마운트│  │           │  │           │  │         │  │ #51  │  │
│  │ #50 백    │  │           │  │           │  │         │  │      │  │
│  │불리:      │  │불리:      │  │불리:      │  │불리:    │  │불리: │  │
│  │ #1 탈출1  │  │ #19 탈출  │  │ #40 보조지│  │ #56 빠른│  │ #57  │  │
│  │ #3 탈출2  │  │           │  │ #41 SLX   │  │ #56 높은│  │ 탈출 │  │
│  │           │  │           │  │ #42 하프   │  │         │  │      │  │
│  └───────────┘  └──────────┘  └───────────┘  └────────┘  └──────┘  │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. 교본 기술 번호 → 태그 매핑

### 필수 드릴 (독립)
| # | 교본명 | 우리 태그 | 비고 |
|---|--------|-----------|------|
| 1 | 새우드릴 | Drill:Shrimp | 기초 |
| 2 | 브릿지 | Drill:Bridge | 기초 |
| 3 | 시저스 | Drill:Scissors | 기초 |
| 4 | 억드릴 | Drill:Upa | 기초 |
| 5 | 팬돌럼 | Drill:Pendulum | 기초 |
| 6 | 힙업드릴 | Drill:HipUp | 기초 |
| 7 | 콩벌레 드릴 | Drill:Granby | 기초 |

### 스탠딩
| # | 교본명 | 우리 태그 | Layer |
|---|--------|-----------|-------|
| 57 | 앵클픽 | AnklePick | Standing |
| 58 | 카라 드래그 | ArmDrag | Standing |
| 59 | 콤비네이션 | Takedown | Standing |
| 60 | 셀프 가드 | GPull | Standing |

### 가드패스 (탑에서 가드 통과)
| # | 교본명 | 우리 태그 | 전환 |
|---|--------|-----------|------|
| 9 | 가드패스 개념 | HQ | 기본 자세 |
| 10 | 가드패스 | Passing | 종합 |
| 6 | 클로즈가드 탈출 | ClosedGuardPass | Closed→HQ |
| 7 | 니슬라이드 패스 | KCP | HQ→Side |
| 11 | 레그드래그 | LegDrag | Open→Side |
| 12 | 토레안도 | Torreando | Open→Side |
| 13 | 오버언더 | OverUnder | HG→Side |
| 14 | 패스 연결 | PassChain | 패스 체이닝 |
| 15 | 상체 그립싸움 | GripFight | 스탠딩 그립 |
| 16 | 시팅가드 패스 | SitGuardPass | Sit→Side |
| 44 | 하프가드 패스1 | HalfPass | HG→Side (컨트롤) |
| 45 | 하프가드 패스2 | HalfPass:CrossFace | HG→Side (크페) |
| 46 | 하프가드 패스3 | HalfPass:KneeCut | HG→Side (기본스) |

### 클로즈 가드 (바텀)
| # | 교본명 | 우리 태그 | 전환 |
|---|--------|-----------|------|
| 5 | 클로즈가드 초크 | Closed→CrossChoke | 서브미션 |
| 32 | 시저스 스윕 | Closed→Scissor→Mount(top) | 스윕 |
| 33 | 플라워 스윕 | Closed→FlowerSweep→Mount(top) | 스윕 |
| 24 | 삼각 | Closed→Triangle | 서브미션 |
| 49 | 암드래그 백테이크 | Closed→ArmDrag→BackTake | 전환 |

### 하프 가드 (바텀)
| # | 교본명 | 우리 태그 | 전환 |
|---|--------|-----------|------|
| 47 | 하프가드 스윕 | HG→Sweep→Side(top) | 스윕 |
| 48 | 하프가드 리커버리(가드) | HG→Closed or Open | 가드 리커버리 |

### 오픈 가드 (바텀) — 패스 리커버리 시스템
| # | 교본명 | 우리 태그 | 전환 |
|---|--------|-----------|------|
| 22 | 가드 리커버리 | OpenGuardRecovery | 탑→가드 복귀 |
| 27 | 니슬라이드 패스 리커버리 | KCP→Recovery→Open | 패스 방어 |
| 28 | 레그드래그 패스 리커버리 | LegDrag→Recovery→Open | 패스 방어 |
| 29 | 토레안도 패스 리커버리 | Torreando→Recovery→Open | 패스 방어 |
| 30 | 오버언더 패스 리커버리 | OverUnder→Recovery→Open | 패스 방어 |
| 31 | 리커버리 연결 | RecoveryChain | 연결 동작 |

### 시팅 가드 (바텀)
| # | 교본명 | 우리 태그 | 전환 |
|---|--------|-----------|------|
| 35 | 시팅 가드1 | Situp | 기본 |
| 35 | 시팅 가드2 | Situp:var2 | 변형 |
| 36 | 챕터1-3 연결동작 | Situp→Chain | 연결 |

### 싱글렉 X가드 (바텀)
| # | 교본명 | 우리 태그 | 전환 |
|---|--------|-----------|------|
| 23 | 싱글렉 X-가드 세팅 | SLX:Setup | 오픈→SLX |
| 24 | 싱글렉 X-가드 스윕 | SLX→Sweep→Top | 스윕 |
| 25 | 싱글렉 X-가드 패스 | SLX:Pass (탑) | 탑에서 SLX 패스 |
| 26 | 싱글렉 X-가드 리커버리 | SLX→Recovery | 리커버리 |

### 더블훅 가드 (바텀) = Butterfly
| # | 교본명 | 우리 태그 | 전환 |
|---|--------|-----------|------|
| 20 | 더블앵클 스윕 | Butterfly→DoubleAnkleSweep→Top | 스윕 |
| 20 | 트라이팟 스윕 | Butterfly→TripodSweep→Top | 스윕 |
| 21 | 챕터1-2 연결동작 | Butterfly→Chain | 연결 |
| 22 | 싱글렉 X-가드 세팅 | Butterfly→SLX | 전환 |

### 사이드 컨트롤
| # | 교본명 | 우리 태그 | 관점 |
|---|--------|-----------|------|
| 2 | 사이드 컨트롤 | SideCtrl:Top | 유리(탑) |
| 4 | 사이드 서브미션 | SideCtrl→Sub | 유리(탑) |
| 37 | 사이드→마운트 전환 | SideCtrl→Mount | 유리(탑) |
| 50 | 사이드→백테이크 | SideCtrl→BackTake | 유리(탑) |
| 18 | 사이드 기무라/팔바 | SideCtrl→Kimura/ArmB | 유리(탑) |
| 1 | 사이드 탈출1 | SideCtrl:Escape1 | 불리(바텀) |
| 3 | 사이드 탈출2 | SideCtrl:Escape2 | 불리(바텀) |

### 니온벨리
| # | 교본명 | 우리 태그 | 관점 |
|---|--------|-----------|------|
| 17 | 니온벨리 컨트롤 | KoB:Top | 유리 |
| 18 | 니온벨리 서브미션 | KoB→Sub | 유리 |
| 19 | 니온벨리 탈출 | KoB:Escape | 불리 |

### 마운트
| # | 교본명 | 우리 태그 | 관점 |
|---|--------|-----------|------|
| 38 | 마운트 초크&기착 | Mount→CrossChoke/Ezekiel | 유리 |
| 39 | 마운트 암바 | Mount→ArmB | 유리 |
| 40 | 보조지 탈출 | Mount:BridgeEscape | 불리 |
| 41 | 싱글렉X가드 전환 탈출 | Mount:Escape→SLX | 불리 |
| 42 | 하프가드 전환 탈출 | Mount:Escape→HG | 불리 |

### 터틀
| # | 교본명 | 우리 태그 | 관점 |
|---|--------|-----------|------|
| 54 | 터틀 백테이크 | Turtle→BackTake | 유리(탑) |
| 56 | 터틀 빠른탈출 | Turtle:QuickEscape | 불리(바텀) |
| 56 | 터틀 높은탈출 | Turtle:StandEscape | 불리(바텀) |

### 백 컨트롤
| # | 교본명 | 우리 태그 | 관점 |
|---|--------|-----------|------|
| 53 | 백 컨트롤 | BackMount:Control | 유리 |
| 55 | 서브미션1 | BackMount→RNC | 유리 |
| 55 | 서브미션2 | BackMount→BowArrow | 유리 |
| 51 | 백 서브미션 | BackMount→Sub | 유리 |
| 57 | 백 탈출 | BackMount:Escape | 불리 |

### 연결 동작 (챕터)
| # | 교본명 | 의미 |
|---|--------|------|
| 8 | 챕터1 연결동작 | 가드패스→사이드 진입 연결 |
| 21 | 챕터1-2 연결동작 | 더블훅→SLX 연결 |
| 36 | 챕터1-3 연결동작 | 시팅가드 연결 체인 |

---

## 3. 포지션 전이 맵 (교본 화살표 기반)

교본 체계도의 화살표를 정확히 추적:

### 가드 → 가드 전환
```
클로즈 가드 ←→ 오픈 가드 (다리 풀면 오픈, 잡으면 클로즈)
클로즈 가드 → 하프 가드 (한쪽 다리 넘어가면)
오픈 가드 ←→ 시팅 가드 (일어나면 시팅, 눕혀지면 오픈)
오픈 가드 → 싱글렉 X가드 (SLX 세팅)
오픈 가드 → 더블훅 가드 (훅 세팅)
더블훅 가드 ←→ 싱글렉 X가드 (훅 추가/제거)
하프 가드 → 클로즈 가드 (리커버리)
하프 가드 → 오픈 가드 (리커버리)
```

### 가드 → 탑 (스윕)
```
클로즈 가드 → 시저스 스윕 → 마운트(탑)
클로즈 가드 → 플라워 스윕 → 마운트(탑)
클로즈 가드 → 암드래그 → 백(탑)
하프 가드 → 스윕 → 사이드(탑)
더블훅 가드 → 더블앵클/트라이팟 → 탑
싱글렉X가드 → 스윕 → 탑
시팅 가드 → 스윕 → 탑
```

### 탑 → 가드 통과 (패스)
```
HQ(본부) → 니슬라이드(#7) → 사이드(탑)
HQ → 레그드래그(#11) → 사이드(탑)
HQ → 토레안도(#12) → 사이드(탑)
HQ → 오버언더(#13) → 사이드(탑)
HQ → 시팅가드패스(#16) → 사이드(탑)
HQ → 하프가드패스(#44,45,46) → 사이드(탑)
HQ → 클로즈가드탈출(#6) → HQ
```

### 탑 컨트롤 → 탑 컨트롤 전환
```
사이드(탑) → 마운트(탑) (#37)
사이드(탑) → 니온벨리(탑)
사이드(탑) → 백테이크 (#50)
사이드(탑) → 터틀(상대) → 백테이크
마운트(탑) → 백테이크 (상대가 뒤집으려 하면)
니온벨리(탑) → 마운트(탑)
니온벨리(탑) → 사이드(탑)
터틀(탑) → 백테이크 (#54)
```

### 불리한 포지션 → 이스케이프 → 가드 리커버리
```
사이드(바텀) → 탈출 → 하프 가드 (#1)
사이드(바텀) → 탈출 → 클로즈/오픈 가드 (#3)
마운트(바텀) → 보조지 탈출 → 가드 (#40)
마운트(바텀) → SLX 전환 탈출 → 싱글렉X가드 (#41)
마운트(바텀) → 하프가드 전환 탈출 → 하프 가드 (#42)
니온벨리(바텀) → 탈출 → 가드 (#19)
터틀(바텀) → 빠른탈출 → 가드 (#56)
터틀(바텀) → 높은탈출 → 스탠딩 (#56)
백(바텀) → 탈출 → 가드 (#57)
```

### 서브미션 (각 포지션에서 마무리)
```
클로즈 가드 → 삼각(#24), 초크(#5)
사이드(탑) → 기무라, 암바, 아메리카나
니온벨리(탑) → 서브미션(#18)
마운트(탑) → 초크(#38), 암바(#39)
백(탑) → RNC(#55), BowArrow(#55), 서브미션(#51)
```

---

## 4. 기존 태그 시스템과의 병합

### 교본에 있고 우리에게 없는 것 (추가 필요)
- **패스 리커버리 시스템** (#22, 27-31): 각 패스별 방어/리커버리
- **연결 동작 (챕터)**: 기술 간 체이닝 개념
- **이스케이프**: 각 컨트롤 포지션에서의 탈출
- **양면성**: 같은 포지션의 탑/바텀 구분

### 우리에게 있고 교본에 없는 것 (교본은 기초 60강이므로)
- **레그락 엔탱글먼트**: Ashi, Saddle, 50/50 등 (교본은 초급 과정이라 미포함)
- **모던 가드**: K Guard, Berimbolo, Rubber Guard
- **라펠 가드 시스템**: Worm, Squid, CrabRide (Gi 전용)
- **DLR/RDLR 심화**: 교본에서는 오픈가드로 통합
- **디테일한 하프가드 파생**: DHG, KShield, Sit-up 구분 (교본은 하프가드로 통합)

### 병합 전략
교본의 기본 뼈대(4대가드 + 탑컨트롤 + 양면성 + 전이 화살표)를 유지하면서,
우리의 세분화된 태그(DLR, KShield, Ashi 등)를 하위 노드로 추가.

```
교본 뼈대:       오픈 가드
우리 세분화:     ├─ DLR
                 │   ├─ RDLR
                 │   ├─ Berimbolo
                 │   └─ K Guard
                 ├─ Spider (Gi)
                 │   └─ Lasso (Gi)
                 ├─ Lapel (Gi)
                 │   ├─ Worm
                 │   └─ Squid
                 └─ Rubber (No-Gi)
```

---

## 5. 스킬트리 UI 구조 (최종)

### 뷰 1: Position Map (교본 스타일 전체 맵)
교본의 체계도처럼 전체 주짓수 흐름을 한눈에.
- 좌: 스탠딩 → 가드 (세로)
- 중: 가드 4종 + 파생 (가로 배열)
- 우: 컨트롤 포지션 (세로, 유리/불리 양면)
- 화살표: 전이 방향

### 뷰 2: Guard Detail (가드 상세 — 지금 내가 만든 인터랙티브 맵)
4대 가드 패밀리 중심으로 파생 가드 간 전환.
클릭하면 "왜 이 전환이 일어나는지" + "거기서 뭘 할 수 있는지" 표시.

### 뷰 3: My Journey (내 경로)
실제 수련 데이터 기반으로 내가 자주 가는 경로만 하이라이트.
"나는 HG → Sit-up → Sweep → Side(top) 루트를 가장 많이 탐."

### 뷰 4: Lesson Map (교본 연결)
교본 #1~#60 번호가 각 노드에 표시.
클릭하면 해당 유튜브 강의로 이동.
"이 기술 아직 안 배웠네?" → 다음 수련 추천.

---

## 6. skillConnections.ts 재설계

기존 `skillConnections.ts`를 아래 구조로 전면 교체:

```typescript
interface Position {
  id: string
  name: string
  nameKr: string
  layer: "standing" | "guard" | "passing" | "control" | "submission" | "leglock"
  family?: string              // "closed" | "half" | "open" | "sitting" | "butterfly" | "slx" | "leglock"
  perspective?: "top" | "bottom" | "neutral"
  lessonNumbers?: number[]     // 교본 번호
  ruleSet: "common" | "gi" | "nogi"
  children?: string[]          // 하위 세분화 노드 (DLR under Open 등)
  parent?: string              // 상위 노드
}

interface Transition {
  from: string
  to: string
  action: string              // 기술 이름 (한글)
  actionEn: string            // 영어
  condition?: string          // "상대가 서면", "언더훅 잡으면"
  type: "sweep" | "pass" | "transition" | "submission" | "escape" | "takedown" | "guard_pull" | "recovery"
  lessonNumber?: number       // 교본 번호
  videoUrl?: string           // 유튜브 링크 (김관장 등)
  ruleSet: "common" | "gi" | "nogi"
}

// 전체 포지션 목록
const POSITIONS: Position[] = [
  // Standing
  { id: "standing", name: "Standing", nameKr: "스탠딩", layer: "standing", perspective: "neutral", lessonNumbers: [57,58,59,60], ruleSet: "common" },
  
  // Guard - Closed Family
  { id: "closed", name: "Closed Guard", nameKr: "클로즈 가드", layer: "guard", family: "closed", perspective: "bottom", lessonNumbers: [5,24,32,33,49], ruleSet: "common" },
  
  // Guard - Half Family
  { id: "hg", name: "Half Guard", nameKr: "하프 가드", layer: "guard", family: "half", perspective: "bottom", lessonNumbers: [47,48], ruleSet: "common" },
  { id: "dhg", name: "Deep Half", nameKr: "딥 하프", layer: "guard", family: "half", perspective: "bottom", parent: "hg", ruleSet: "common" },
  { id: "kshield", name: "Knee Shield", nameKr: "니쉴드", layer: "guard", family: "half", perspective: "bottom", parent: "hg", ruleSet: "common" },
  { id: "situp", name: "Sit-up Guard", nameKr: "싯업 가드", layer: "guard", family: "sitting", perspective: "bottom", lessonNumbers: [35,36], ruleSet: "common" },
  { id: "halfbutt", name: "Half Butterfly", nameKr: "하프 버터플라이", layer: "guard", family: "half", perspective: "bottom", parent: "hg", ruleSet: "common" },
  { id: "waiter", name: "Waiter Guard", nameKr: "웨이터 가드", layer: "guard", family: "half", perspective: "bottom", parent: "hg", ruleSet: "common" },
  
  // Guard - Open Family
  { id: "open", name: "Open Guard", nameKr: "오픈 가드", layer: "guard", family: "open", perspective: "bottom", lessonNumbers: [22,27,28,29,30,31], ruleSet: "common" },
  { id: "dlr", name: "De La Riva", nameKr: "DLR", layer: "guard", family: "open", perspective: "bottom", parent: "open", ruleSet: "common" },
  { id: "rdlr", name: "Reverse DLR", nameKr: "리버스 DLR", layer: "guard", family: "open", perspective: "bottom", parent: "open", ruleSet: "common" },
  { id: "spider", name: "Spider Guard", nameKr: "스파이더", layer: "guard", family: "open", perspective: "bottom", parent: "open", ruleSet: "gi" },
  { id: "lasso", name: "Lasso Guard", nameKr: "라쏘", layer: "guard", family: "open", perspective: "bottom", parent: "open", ruleSet: "gi" },
  { id: "kguard", name: "K Guard", nameKr: "K가드", layer: "guard", family: "open", perspective: "bottom", parent: "open", ruleSet: "nogi" },
  { id: "lapel", name: "Lapel Guard", nameKr: "라펠 가드", layer: "guard", family: "open", perspective: "bottom", parent: "open", ruleSet: "gi" },
  { id: "worm", name: "Worm Guard", nameKr: "웜 가드", layer: "guard", family: "open", perspective: "bottom", parent: "lapel", ruleSet: "gi" },
  { id: "squid", name: "Squid Guard", nameKr: "스퀴드", layer: "guard", family: "open", perspective: "bottom", parent: "lapel", ruleSet: "gi" },
  { id: "rubber", name: "Rubber Guard", nameKr: "러버 가드", layer: "guard", family: "open", perspective: "bottom", parent: "open", ruleSet: "nogi" },
  { id: "bolo", name: "Berimbolo", nameKr: "베림볼로", layer: "guard", family: "open", perspective: "bottom", parent: "dlr", ruleSet: "common" },
  
  // Guard - Butterfly/SLX Family
  { id: "butterfly", name: "Butterfly Guard", nameKr: "더블훅 가드", layer: "guard", family: "butterfly", perspective: "bottom", lessonNumbers: [20,21], ruleSet: "common" },
  { id: "slx", name: "Single Leg X", nameKr: "싱글렉 X", layer: "guard", family: "butterfly", perspective: "bottom", lessonNumbers: [23,24,25,26], ruleSet: "common" },
  { id: "xg", name: "X Guard", nameKr: "X가드", layer: "guard", family: "butterfly", perspective: "bottom", parent: "slx", ruleSet: "common" },
  
  // Passing (탑에서 가드 통과)
  { id: "hq", name: "Headquarters", nameKr: "본부 자세", layer: "passing", perspective: "top", lessonNumbers: [9,10], ruleSet: "common" },
  { id: "kcp", name: "Knee Cut Pass", nameKr: "니슬라이드", layer: "passing", perspective: "top", lessonNumbers: [7], ruleSet: "common" },
  { id: "torreando", name: "Torreando", nameKr: "토레안도", layer: "passing", perspective: "top", lessonNumbers: [12], ruleSet: "common" },
  { id: "overunder", name: "Over-Under", nameKr: "오버언더", layer: "passing", perspective: "top", lessonNumbers: [13], ruleSet: "common" },
  { id: "legdrag", name: "Leg Drag", nameKr: "레그드래그", layer: "passing", perspective: "top", lessonNumbers: [11], ruleSet: "common" },
  { id: "halfpass", name: "Half Guard Pass", nameKr: "하프가드 패스", layer: "passing", perspective: "top", lessonNumbers: [44,45,46], ruleSet: "common" },
  { id: "smash", name: "Smash Pass", nameKr: "스매시", layer: "passing", perspective: "top", ruleSet: "common" },
  { id: "longstep", name: "Long Step", nameKr: "롱스텝", layer: "passing", perspective: "top", ruleSet: "common" },
  
  // Control (탑 - 유리)
  { id: "side_top", name: "Side Control", nameKr: "사이드 컨트롤", layer: "control", perspective: "top", lessonNumbers: [2,4,37,50], ruleSet: "common" },
  { id: "kob_top", name: "Knee on Belly", nameKr: "니온벨리", layer: "control", perspective: "top", lessonNumbers: [17,18], ruleSet: "common" },
  { id: "mount_top", name: "Mount", nameKr: "마운트", layer: "control", perspective: "top", lessonNumbers: [38,39], ruleSet: "common" },
  { id: "back_top", name: "Back Control", nameKr: "백 컨트롤", layer: "control", perspective: "top", lessonNumbers: [51,53,55], ruleSet: "common" },
  { id: "ns_top", name: "North-South", nameKr: "노스사우스", layer: "control", perspective: "top", ruleSet: "common" },
  { id: "turtle_top", name: "Turtle (attacking)", nameKr: "터틀 공격", layer: "control", perspective: "top", lessonNumbers: [54], ruleSet: "common" },
  
  // Control (바텀 - 불리)
  { id: "side_bottom", name: "Side (bottom)", nameKr: "사이드 당함", layer: "control", perspective: "bottom", lessonNumbers: [1,3], ruleSet: "common" },
  { id: "kob_bottom", name: "KoB (bottom)", nameKr: "니온벨리 당함", layer: "control", perspective: "bottom", lessonNumbers: [19], ruleSet: "common" },
  { id: "mount_bottom", name: "Mount (bottom)", nameKr: "마운트 당함", layer: "control", perspective: "bottom", lessonNumbers: [40,41,42], ruleSet: "common" },
  { id: "back_bottom", name: "Back (defending)", nameKr: "백 당함", layer: "control", perspective: "bottom", lessonNumbers: [57], ruleSet: "common" },
  { id: "turtle_bottom", name: "Turtle (defending)", nameKr: "터틀 방어", layer: "control", perspective: "bottom", lessonNumbers: [56], ruleSet: "common" },
  
  // Leg Lock Entanglements
  { id: "ashi", name: "Ashi Garami", nameKr: "아시가라미", layer: "leglock", perspective: "neutral", ruleSet: "nogi" },
  { id: "slashi", name: "Single Leg Ashi", nameKr: "싱글렉 아시", layer: "leglock", perspective: "neutral", ruleSet: "nogi" },
  { id: "saddle", name: "Saddle/411", nameKr: "새들", layer: "leglock", perspective: "neutral", ruleSet: "nogi" },
  { id: "outashi", name: "Outside Ashi", nameKr: "아웃사이드 아시", layer: "leglock", perspective: "neutral", ruleSet: "nogi" },
  { id: "5050", name: "50/50", nameKr: "피프티피프티", layer: "leglock", perspective: "neutral", ruleSet: "nogi" },
  
  // Submissions (마무리)
  { id: "rnc", name: "RNC", nameKr: "RNC", layer: "submission", ruleSet: "common" },
  { id: "triangle", name: "Triangle", nameKr: "삼각", layer: "submission", ruleSet: "common" },
  { id: "armb", name: "Armbar", nameKr: "암바", layer: "submission", ruleSet: "common" },
  { id: "kimura", name: "Kimura", nameKr: "키무라", layer: "submission", ruleSet: "common" },
  { id: "guillotine", name: "Guillotine", nameKr: "기요틴", layer: "submission", ruleSet: "common" },
  { id: "darce", name: "D'arce", nameKr: "다스", layer: "submission", ruleSet: "common" },
  { id: "crosschoke", name: "Cross Choke", nameKr: "크로스초크", layer: "submission", ruleSet: "gi" },
  { id: "bowarrow", name: "Bow & Arrow", nameKr: "보우앤아로우", layer: "submission", ruleSet: "gi" },
  { id: "ezekiel", name: "Ezekiel", nameKr: "이지키엘", layer: "submission", ruleSet: "gi" },
  { id: "americana", name: "Americana", nameKr: "아메리카나", layer: "submission", ruleSet: "common" },
  { id: "ihh", name: "Inside Heel Hook", nameKr: "인사이드 힐훅", layer: "submission", ruleSet: "nogi" },
  { id: "ohh", name: "Outside Heel Hook", nameKr: "아웃사이드 힐훅", layer: "submission", ruleSet: "nogi" },
  { id: "sfl", name: "Straight Foot Lock", nameKr: "스트레이트 풋락", layer: "submission", ruleSet: "common" },
  { id: "kneebar", name: "Knee Bar", nameKr: "니바", layer: "submission", ruleSet: "nogi" },
  { id: "toehold", name: "Toe Hold", nameKr: "토홀드", layer: "submission", ruleSet: "nogi" },
  // ... 나머지 서브미션
]

// 전체 전환 목록 (교본 화살표 + 우리 추가)
const TRANSITIONS: Transition[] = [
  // Standing → Guard
  { from: "standing", to: "closed", action: "풀가드", actionEn: "Guard Pull", type: "guard_pull", lessonNumber: 60, ruleSet: "common" },
  { from: "standing", to: "butterfly", action: "시팅 가드풀", actionEn: "Sitting Guard Pull", type: "guard_pull", ruleSet: "common" },
  { from: "standing", to: "dlr", action: "DLR 가드풀", actionEn: "DLR Guard Pull", type: "guard_pull", ruleSet: "common" },
  
  // Standing → Top (takedowns)
  { from: "standing", to: "side_top", action: "테이크다운", actionEn: "Takedown", type: "takedown", lessonNumber: 59, ruleSet: "common" },
  
  // Guard ↔ Guard transitions (Half Guard family)
  { from: "hg", to: "dhg", action: "밑으로 파고들기", actionEn: "Underhook deep", condition: "상대 무게 실리면", type: "transition", ruleSet: "common" },
  { from: "hg", to: "kshield", action: "무릎 세우기", actionEn: "Frame with knee", condition: "거리 필요할 때", type: "transition", ruleSet: "common" },
  { from: "hg", to: "situp", action: "언더훅 잡고 일어나기", actionEn: "Underhook sit-up", condition: "언더훅 확보 시", type: "transition", ruleSet: "common" },
  { from: "hg", to: "halfbutt", action: "버터플라이 훅", actionEn: "Butterfly hook", condition: "한쪽 훅 걸면", type: "transition", ruleSet: "common" },
  { from: "hg", to: "dlr", action: "발 걸기", actionEn: "DLR hook", condition: "상대가 서면", type: "transition", ruleSet: "common" },
  { from: "hg", to: "rdlr", action: "리버스 훅", actionEn: "RDLR hook", condition: "상대가 서면", type: "transition", ruleSet: "common" },
  { from: "hg", to: "closed", action: "풀가드 리커버리", actionEn: "Full guard recovery", condition: "다리 넣기 성공", type: "recovery", lessonNumber: 48, ruleSet: "common" },
  { from: "hg", to: "open", action: "오픈가드 리커버리", actionEn: "Open guard recovery", condition: "프레임 + 힙이스케이프", type: "recovery", lessonNumber: 48, ruleSet: "common" },
  
  // ... (나머지 수백 개의 transition은 동일한 패턴)
  
  // Sweeps (Guard → Top)
  { from: "closed", to: "mount_top", action: "시저스 스윕", actionEn: "Scissor Sweep", type: "sweep", lessonNumber: 32, ruleSet: "common" },
  { from: "closed", to: "mount_top", action: "플라워 스윕", actionEn: "Flower Sweep", type: "sweep", lessonNumber: 33, ruleSet: "common" },
  { from: "hg", to: "side_top", action: "하프가드 스윕", actionEn: "Half Guard Sweep", type: "sweep", lessonNumber: 47, ruleSet: "common" },
  { from: "situp", to: "side_top", action: "코요테 스윕", actionEn: "Coyote Sweep", type: "sweep", ruleSet: "common" },
  { from: "butterfly", to: "side_top", action: "더블앵클 스윕", actionEn: "Double Ankle Sweep", type: "sweep", lessonNumber: 20, ruleSet: "common" },
  { from: "slx", to: "side_top", action: "SLX 스윕", actionEn: "SLX Sweep", type: "sweep", lessonNumber: 24, ruleSet: "common" },
  
  // Passes (Top → through guard → Control)
  { from: "hq", to: "side_top", action: "니슬라이드", actionEn: "Knee Cut Pass", type: "pass", lessonNumber: 7, ruleSet: "common" },
  { from: "hq", to: "side_top", action: "토레안도", actionEn: "Torreando", type: "pass", lessonNumber: 12, ruleSet: "common" },
  { from: "hq", to: "side_top", action: "레그드래그", actionEn: "Leg Drag", type: "pass", lessonNumber: 11, ruleSet: "common" },
  { from: "hq", to: "side_top", action: "오버언더", actionEn: "Over-Under", type: "pass", lessonNumber: 13, ruleSet: "common" },
  
  // Control → Control (Top transitions)
  { from: "side_top", to: "mount_top", action: "마운트 전환", actionEn: "Mount transition", type: "transition", lessonNumber: 37, ruleSet: "common" },
  { from: "side_top", to: "kob_top", action: "니온벨리", actionEn: "Knee on Belly", type: "transition", ruleSet: "common" },
  { from: "side_top", to: "back_top", action: "백테이크", actionEn: "Back Take", type: "transition", lessonNumber: 50, ruleSet: "common" },
  { from: "mount_top", to: "back_top", action: "백테이크", actionEn: "Back Take", condition: "상대가 뒤집으려 하면", type: "transition", ruleSet: "common" },
  { from: "turtle_top", to: "back_top", action: "터틀 백테이크", actionEn: "Turtle Back Take", type: "transition", lessonNumber: 54, ruleSet: "common" },
  
  // Escapes (Bottom → Guard recovery)
  { from: "side_bottom", to: "hg", action: "사이드 탈출 → 하프", actionEn: "Side Escape to HG", type: "escape", lessonNumber: 1, ruleSet: "common" },
  { from: "side_bottom", to: "closed", action: "사이드 탈출 → 풀가드", actionEn: "Side Escape to Closed", type: "escape", lessonNumber: 3, ruleSet: "common" },
  { from: "mount_bottom", to: "hg", action: "하프가드 전환 탈출", actionEn: "Mount Escape to HG", type: "escape", lessonNumber: 42, ruleSet: "common" },
  { from: "mount_bottom", to: "slx", action: "SLX 전환 탈출", actionEn: "Mount Escape to SLX", type: "escape", lessonNumber: 41, ruleSet: "common" },
  { from: "back_bottom", to: "hg", action: "백 탈출", actionEn: "Back Escape", type: "escape", lessonNumber: 57, ruleSet: "common" },
  
  // Submissions
  { from: "closed", to: "triangle", action: "삼각", actionEn: "Triangle", type: "submission", lessonNumber: 24, ruleSet: "common" },
  { from: "closed", to: "crosschoke", action: "크로스 초크", actionEn: "Cross Choke", type: "submission", lessonNumber: 5, ruleSet: "gi" },
  { from: "mount_top", to: "crosschoke", action: "마운트 초크", actionEn: "Mount Cross Choke", type: "submission", lessonNumber: 38, ruleSet: "gi" },
  { from: "mount_top", to: "armb", action: "마운트 암바", actionEn: "Mount Armbar", type: "submission", lessonNumber: 39, ruleSet: "common" },
  { from: "back_top", to: "rnc", action: "RNC", actionEn: "Rear Naked Choke", type: "submission", lessonNumber: 55, ruleSet: "common" },
  { from: "back_top", to: "bowarrow", action: "보우앤아로우", actionEn: "Bow and Arrow", type: "submission", lessonNumber: 55, ruleSet: "gi" },
]
```

---

## 7. Claude Code 구현 지시

기존 `lib/sensei/skillConnections.ts`를 위 구조로 완전 교체.
스킬트리 UI도 교본 스타일의 Position Map으로 변경.

핵심:
1. **양면성** — 같은 포지션이라도 top/bottom 분리
2. **transition에 이유(condition)** — "상대가 서면", "언더훅 잡으면" 등
3. **교본 번호(lessonNumber)** — 각 기술에 교본 번호 연결
4. **Gi/No-Gi 분리(ruleSet)** — 각 포지션과 전환에 룰셋 명시
5. **3계층 흐름** — Standing → Guard → Control → Submission
