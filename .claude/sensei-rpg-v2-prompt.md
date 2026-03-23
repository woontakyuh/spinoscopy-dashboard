# Sensei RPG v2 — 전체 업그레이드 프롬프트

현재 Sensei RPG 시스템 전체를 읽고 파악한 뒤, 아래 7가지를 병렬로 진행해줘. subagent 써도 됨. feat/sensei-rpg-v2 브랜치에서 작업. 각 작업 완료 시 커밋. dev 서버 띄워서 확인. 에러나면 스스로 고쳐.

---

## 프로젝트 비전

**Sensei = 주짓수 수련의 모든 것을 통합하는 중심 플랫폼**

현재 Phase 1: 개인 수련 대시보드
- 내 수련 기록, 능력치, 대회 전적, 목표를 한 곳에서 관리
- AI 코칭으로 개인화된 피드백

미래 Phase 2: 체육관 멀티유저 플랫폼
- 관장님이 수업 내용 올리면 자동으로 회원들 태그에 반영
- 각 회원별 캐릭터 시트 + 능력치 자동 추적
- 출석 체크 연동 → 자동 업데이트
- 스파링 기록은 각자가 올림
- 코치 탭에서 관장님께 질문 → 수업/게시판에서 답변

미래 Phase 3: SaaS 런칭
- 전체 주짓수 체육관 관리 솔루션
- 회원관리, 출석, 수업, 대회, 코칭을 하나의 플랫폼에서

**Phase 1에 집중하되, Phase 2 확장을 염두에 둔 데이터 구조를 설계할 것.**
예: UserProfile에 gymId, role(student/instructor/admin) 필드를 미리 포함. Notion DB 구조도 멀티유저 확장 가능하게.

---

## 0. 페이지 구조 — 허브 & 스포크 아키텍처 (★ 핵심 변경)

### 메인 대시보드 (허브)
Sensei 에이전트의 첫 화면 = 메인 대시보드.
대시보드에 모든 핵심 정보를 위젯/카드 형태로 요약 표시.
각 위젯을 클릭하면 해당 상세 탭(스포크)으로 이동.

### 대시보드 레이아웃 (★ 디자인 목업을 정확히 따를 것)

```
┌─────────────────────────────────────────────────────────┐
│ 좌: [캐릭터 아바타]        중: 이름 Lv.14 Guard Player   우: 최근 수련 기록    │
│     도복+벨트 일러스트        현재: 블루벨트 3그랄           수련 기간: 6년 3개월 │
│                              Lv.14  ████████ 10/12 XP      기록된 수련: 20     │
│                              Lv.2 → Lv.3                   연속:3주 최장:3주    │
│                                                             Gi비율: 80%         │
├─────────────────────────────────────────────────────────┤
│ ═══화이트═══╋╋╋╋═══블루═══╋╋╋●═══════퍼플═══════브라운═══════블랙═══            │
│   화이트      블루      퍼플      브라운      블랙                              │
│                  호버 → "승급: 2024년 4월 20일 / 그랄: 2024년 4월 20일"         │
├────────────────────────┬────────────────────────────────┤
│ 좌: 6축 레이더 차트     │ 우: 6축 바 차트                 │
│     Guard 축 위에 40    │     Guard  ████████████ 32     │
│     동심원: 10,20,30,40 │     Passing ██████ 14          │
│     (클릭→Stats탭)     │     Control █ 0                 │
│                        │     Finishing ████ 10            │
│                        │     Takedowns ███ 8              │
│                        │     Leg Locks  0                 │
│                        │                                  │
│                        │ 가장 유사한 아키타입:             │
│                        │ 🇧🇷 Lucas Leite — Coyote HG     │
├────────────────────────┴────────────────────────────────┤
│ 좌: 최근 포커스                  우: 여름 목표              │
│     [HG] [Lasso] [Spider]           3/3 그랄 ████████    │
│     [Open] [HQ]                     현재: 블루벨트,       │
│                                     그랄 승급 시 텍스트    │
├─────────────────────────────────────────────────────────┤
│ Coach 한 줄 추천 + 자연어 질문 입력                         │
└─────────────────────────────────────────────────────────┘
```

### 탭 구조 (스포크)
🏠 Dashboard (메인 허브, 첫 화면)
📝 Journal (수련 일지) — 기존 SenseiCalendar + SenseiCapture 그대로
📊 Stats (능력치 + 스킬트리) — 6축 상세 + 디아블로식 스킬트리 통합
🏆 BJJ Heroes (선수 비교) — 아키타입 비교
📅 Competition (대회 참가 관리) — 생활체육 대회 참가 관리
🤖 Coach (AI 코칭) — 한줄 추천 + 자연어 채팅

대시보드 위젯 클릭 → React state activeTab 변경으로 탭 전환.

## 1. OVR 점수 밸런스 수정

### 1-1. 피크 스탯 보너스
90+ → +3, 95+ → +5, 98+ → +7. 최종 OVR = 가중평균 + 피크보너스 (cap 99)

### 1-2. 세분화된 역할 추가
- Half Guard Specialist: guard .35, passing .15, control .15, finishing .15, takedowns .10, legLocks .10
- Spider Guard Specialist: guard .35, finishing .25, control .10, passing .10, takedowns .10, legLocks .10
- Back Taker: control .30, guard .20, finishing .25, passing .10, takedowns .10, legLocks .05
- Submission Hunter: finishing .35, guard .20, control .15, passing .10, takedowns .10, legLocks .10

### 1-3. 업적 기반 하한선 (OVR Floor)
최종 OVR = max(계산 OVR + 피크보너스, ovrFloor), cap 99
Roger Gracie 85, Leandro Lo 85, Marcelo Garcia 85, Rafa Mendes 83, Lucas Leite 80, Lucas Lepri 85, Bernardo Faria 85, Romulo Barral 85, Mica Galvao 88, Tainan Dalpra 80, Diego Pato 83, Mayssa Bastos 85, Adam Wardzinski 80, Gordon Ryan 88, Kade Ruotolo 80, Mikey Musumeci 85, Cole Abate 80, Kaynan Duarte 85, Diogo Reis 80, Craig Jones 75, 조준용 70

## 2. Gi / No-Gi 분리 시스템

### 2-1. 태그 분류
공통: Guard(HG,DHG,Closed,Butterfly,KShield,Sit-up,Waiter,HalfButt,Open,XG,SLX,DLR,RDLR,Bolo,SingleSweep,HipSweep,Scissor), Passing(전부), Control(전부), Finishing(RNC,Darce,Guillotine,ArmB,Kimura,Americana,Triangle,Omo,Wristlock,BicepSlicer,Gogoplata,ArmTriangle,Anaconda), Takedowns(전부), LegLocks(SFL만)
Gi전용: Guard(Spider,Lasso,Lapel,Worm,RWorm,Squid,Octopus,CrabRide,Truck), Finishing(BowArrow,CrossChoke,Ezekiel,Baseball)
NoGi전용: Guard(Rubber,KGuard), Finishing(NSChoke), LegLocks(IHH,OHH,Estima,ToeHold,KneeBar,50/50,Ashi,SLAshi,Saddle,OutAshi)

### 2-2. 스탯 이중 계산
```typescript
interface BjjStats { gi: BjjStatsSet; nogi: BjjStatsSet; combined: BjjStatsSet }
```

### 2-3. Gi/No-Gi 토글
Dashboard + Stats에서 전환. Gi=#3b82f6, No-Gi=#ef4444

## 3. 메인 대시보드 구현 (★ 가장 중요)

### 3-1. 캐릭터 프로필 섹션 (상단 3컬럼)

좌: 캐릭터 아바타 (도복+벨트, avatarUrl 필드 준비)
중: 이름+Lv.14+"Guard Player"+"현재: 블루벨트 3그랄"+XP바
우: 수련 기록 요약 카드 (수련기간, 기록횟수, 연속스트릭, 최장스트릭, Gi비율)

### 3-2. 벨트 프로그레션 바 (연속 벨트, 끊김 금지)
가로 바, White→Black 연속. 스트라이프=세로막대. 현재위치=●+glow. 과거=100%불투명, 미래=30%. 호버→승급날짜 툴팁.

### 3-3. 6축 레이더 + 바 차트 (나란히 2컬럼)
좌: 레이더(동심원 10,20,30,40). 우: 세로바(카테고리색상, 숫자 위에 표시) + 아키타입.

### 3-4. 최근 포커스 + 목표 (하단 2컬럼)
좌: 포커스 태그. 우: 커스텀 목표 + 프로그레스.

### 3-5. Coach 한 줄 (대시보드 하단)
유저 스탯 기반으로 가장 필요한 한 줄 추천만 표시.
예: "이번 주는 Control 포지션 연습에 집중하세요 — SideCtrl→Mount 전환 드릴 추천"
그 아래에 자연어 질문 입력 필드 → Coach 탭으로 이동 + 질문 전송.

### 3-6. Promotions API
```typescript
interface PromotionEvent { date: string; belt: string; stripe?: number; note?: string }
```

## 4. Stats 탭 (능력치 + 스킬트리 통합)

### 4-1. 상단: 6축 상세
큰 레이더 + 스탯 바 + 약점/강점/제안 + Gi/No-Gi 토글

### 4-2. 하단: 디아블로식 스킬트리
lib/sensei/skillConnections.ts — 기술 간 연결 맵:

Guard: Closed→[HG,Open,Spider,Lasso], HG→[DHG,KShield,Sit-up], DHG→[SingleSweep,Butterfly], KShield→[HG,Sit-up,HalfButt], Sit-up→[SingleSweep,BackTake,ArmDrag], DLR→[RDLR,Bolo,SLX,KGuard], RDLR→[DLR,Bolo,KGuard], SLX→[XG,Ashi,Saddle], XG→[SLX,HipSweep,Butterfly], Butterfly→[XG,HipSweep,ArmDrag,HalfButt], Spider→[Lasso,Triangle,Scissor], Lasso→[Spider,Bolo,Triangle], Lapel→[Worm,RWorm,Squid], Worm→[RWorm,Squid,CrabRide], Octopus→[CrabRide,BackTake], Rubber→[Truck], Waiter→[HG,Sit-up], KGuard→[SLX,Ashi,Saddle], Bolo→[BackTake,DLR]

Passing: HQ→[KCP,Torreando,Bullfight,LongStep], KCP→[Smash,HalfPass,Mount,SideCtrl], Torreando→[LongStep,SideCtrl,KoB], Stack→[Smash,Mount], Smash→[SideCtrl,Mount,KoB], LongStep→[SideCtrl,BackTake], Bullfight→[Torreando,KCP], HalfPass→[KCP,Mount], LegPummel→[HQ,KCP]

Control: SideCtrl→[Mount,KoB,NS,BackTake,Scarf], Mount→[S-Mount,BackTake,Crucifix], S-Mount→[ArmB,Triangle], KoB→[Mount,SideCtrl,BackTake], BackTake→[BackMount], BackMount→[RNC,BowArrow], NS→[NSChoke,Kimura,SideCtrl], Turtle→[BackTake,Crucifix], Crucifix→[Kimura,RNC]

Finishing: BackMount→[RNC,BowArrow], Mount→[CrossChoke,ArmB,Ezekiel,ArmTriangle], S-Mount→[ArmB,Triangle], SideCtrl→[Kimura,Americana,ArmTriangle,Baseball], Closed→[Guillotine,Triangle,ArmB,Omo,CrossChoke], Spider→[Triangle,Omo], NS→[NSChoke,Kimura], Turtle→[Darce,Anaconda], HG→[Darce,Kimura], KoB→[Baseball,ArmB]

Takedowns: Stand→[SingleLeg,DoubleLeg,Bodylock,JudoThrow,InsideTrip,GPull,ArmDrag,AnklePick], ArmDrag→[BackTake,SingleLeg], WrestleUp→[SingleLeg,DoubleLeg], GPull→[Closed,DLR,Butterfly]

LegLocks: SLX→[Ashi,Saddle], Ashi→[SLAshi,IHH,SFL], SLAshi→[Ashi,KneeBar], Saddle→[IHH,OHH], OutAshi→[OHH,KneeBar], 50/50→[IHH,OHH,ToeHold,SFL], SFL(독립), Estima←SFL

UI: SVG 노드-엣지 그래프. 기존 SkillTree.tsx 완전 교체.

## 5. Competition 탭 — 대회 참가 관리 + 국제 대회 팔로우

두 가지 기능을 하나의 탭에서:
1. **내 대회**: 직접 참가하는 생활체육/아마추어 대회 관리
2. **Following**: 주요 국제 대회 일정 팔로우 + 관장님 출전 트래킹

### 5-1. 내 대회 데이터
```typescript
interface MyCompetition {
  id: string
  name: string              // "제7회 IBJJF Korea International Open"
  date: string
  registrationDeadline?: string
  location: string
  ruleSet: "gi" | "nogi" | "both"
  organization: string
  division?: string
  status: "참가예정" | "등록완료" | "미정" | "불참" | "완료"
  weightClass?: string
  result?: string
  matchResults?: MatchResult[]
  fee?: number
  notes?: string
  url?: string
}

interface MatchResult {
  round: string; opponent?: string; result: "승"|"패"|"무"
  method?: string; points?: string; duration?: string
}
```

### 5-2. 국제 대회 팔로우 데이터
```typescript
interface FollowedEvent {
  id: string
  name: string              // "IBJJF World Championship"
  date: string
  location: string          // "Las Vegas, USA"
  organization: string
  ruleSet: "gi" | "nogi" | "both"
  type: "major"             // IBJJF Worlds, ADCC, Pans, Europeans, Grand Slams 등
  coachEntries?: CoachEntry[]  // 관장님/체육관 선수 출전 정보
  notes?: string
  url?: string
}

interface CoachEntry {
  name: string              // "조준용"
  division: string          // "Adult Black Feather"
  result?: string           // "3rd place"
}
```

### 5-3. UI
**내 대회 섹션 (상단):**
- 날짜순 카드 리스트, 등록마감 D-day
- 상태 뱃지 (미정/참가예정/등록완료/완료)
- 완료 대회: 전적 + 경기별 상세
- 통계: 총 참가, 전적, 메달

**Following 섹션 (하단):**
- 올해 주요 국제 대회 캘린더
- 관장님/체육관 선수 출전 시 하이라이트 표시
- 예: "Coach 조준용: IBJJF Worlds -70kg" 강조
- IBJJF Worlds, ADCC, Pans, Europeans, Grand Slams 등

### 5-4. 대시보드 위젯
상단: 다음 내 대회 1개 + D-day + 참가 상태
하단: Following 주요 대회 2-3개 + 관장님 출전 정보

## 6. BJJ Heroes + 게임플랜 + Base Stats

### 6-1. 히어로별 게임플랜
각 선수 시그니처 공격 루트. 플로우차트 시각화. videoUrl 준비.

### 6-2. Base Stats
```typescript
interface UserProfile {
  name: string; belt: string; stripes: number
  trainingStartDate: string; gym: string; instructor: string
  avatarUrl?: string
  baseStats: { gi: BjjAttributes; nogi: BjjAttributes }
  nextGoalTitle?: string
  nextGoalText?: string
  // Phase 2 확장용
  gymId?: string
  role?: "student" | "instructor" | "admin"
  userId?: string
}
```
6축 슬라이더 (0~40). 최종 스탯 = max(baseStats, 태그계산값). localStorage.

## 7. Coach (AI 코칭) — 한줄 추천 + 자연어 채팅

### 7-1. 대시보드 Coach 위젯 (한 줄)
유저의 현재 스탯, 최근 수련 패턴, 약점을 분석해서 **가장 필요한 한 줄 추천**만 표시.
예시:
- "Guard는 탄탄합니다. 이번 주는 Control(SideCtrl→Mount 전환)에 집중해보세요."
- "최근 HG, Lasso 위주 수련 — Passing 쪽 밸런스가 필요합니다."
- "대회 2주 전: 자신있는 HG→Sit-up→Sweep 루트를 반복 연습하세요."

이 한 줄은 API 호출 1회로 생성 (짧은 max_tokens). 대시보드 로딩 시 또는 새 세션 기록 시 갱신.

### 7-2. Coach 탭 = 자연어 채팅 인터페이스
버튼 나열이 아니라, 단순한 채팅 UI:
- 상단: 현재 스탯 요약 카드 (접기 가능, 기본 접힌 상태)
- 중앙: 채팅 히스토리
- 하단: 텍스트 입력 + 전송

유저가 자연어로 아무 질문이나 하면 대답:
- "이번 주 뭘 연습하면 좋을까?"
- "하프가드에서 패스 당할 때 어떻게 해?"
- "Lucas Leite처럼 되려면 뭘 해야 해?"
- "다음 대회 준비 어떻게 할까?"
- "노기에서 레그락 어떻게 시작해?"

### 7-3. 시스템 프롬프트
```
너는 BJJ 코치 AI야. 유저의 수련 데이터를 기반으로 개인화된 코칭을 제공해.

유저 프로필:
- 벨트: {belt} {stripes}그랄 / 수련: {trainingPeriod}
- Gi: Guard {gi.guard}, Passing {gi.passing}, Control {gi.control}, Finishing {gi.finishing}, Takedowns {gi.takedowns}, LegLocks {gi.legLocks} / OVR {gi.ovr} ({gi.ovrRole})
- No-Gi: 동일 형식 / OVR {nogi.ovr} ({nogi.ovrRole})
- Gi 아키타입: {gi.closestArchetype} / No-Gi: {nogi.closestArchetype}
- 최근 포커스: {recentFocus}
- 스승: 조준용 (코요테 하프가드, Lucas Leite 계보)
- 수련 패턴: 주 5일 (Gi 4일, No-Gi 1일)
- 대회 전적: {competitionRecord}

코칭 원칙:
1. 구체적으로 답해. "가드를 연습하세요" 대신 "하프가드에서 니쉴드 리텐션 → 싯업 → 싱글레그 체인을 연습하세요"
2. 유저의 스승(조준용) 스타일을 존중. 코요테 하프가드 계보를 이해하고 관련 기술을 우선 추천
3. 약점을 지적하되 강점을 살리는 방향으로
4. 대회 준비 질문에는 현실적인 게임플랜 제시
5. 한글로 답변. 주짓수 용어는 영어 원문 병기.
```

### 7-4. API 라우트
/api/ai/chat에서 agentId:"sensei-coach"로 분기.
또는 /api/ai/sensei-coach/route.ts 새로 생성.
시스템 프롬프트에 실시간 스탯 데이터 주입.

## 디자인 가이드

### ★ 디자인 철학
**"AI가 만든 것 같은" 느낌을 피할 것.**
- 둥근 모서리에 그라디언트 배경의 뻔한 카드 나열 ❌
- 의미없는 glow, neon 효과 ❌
- 정보 밀도 없이 빈 공간만 큰 레이아웃 ❌

대신:
- 정보 밀도가 높고 한눈에 파악되는 대시보드 ✅
- 목업처럼 캐릭터+레이더+바차트가 유기적으로 배치 ✅
- 실제 앱/게임 UI에서 볼 수 있는 자연스러운 레이아웃 ✅
- 컬러는 의미 있는 곳에만 (카테고리 색상, 벨트 색상) ✅

### 레이아웃 참조
첨부된 디자인 목업을 반드시 참고. 핵심:
- 캐릭터 일러스트가 좌측에 크게 (도복+현재 벨트색)
- 우측 상단에 수련 기록 요약 카드 (테이블 형태, 깔끔)
- 레이더 차트와 바 차트가 나란히 (2컬럼)
- 바 차트는 세로 막대, 위에 숫자 직접 표시
- 최근 포커스 태그 + 목표 프로그레스가 하단
- 벨트는 하나의 연속된 띠, 화살표 형태로 흐르는 느낌

### 색상
Dark only bg-zinc-950, 모바일 우선, shadcn OK, Tailwind v4
벨트: white=#e4e4e7, blue=#3b82f6, purple=#a855f7, brown=#92400e, black=#18181b
카테고리: Guard=#a855f7, Passing=#22c55e, Control=#f97316, Finishing=#ef4444, Takedowns=#06b6d4, LegLocks=#eab308
Gi=#3b82f6, No-Gi=#ef4444

## 수정 금지
SenseiCapture.tsx, SenseiCalendar.tsx, lib/notion/client.ts, components/ui/, components/layout/
