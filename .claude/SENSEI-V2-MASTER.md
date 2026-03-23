# Sensei RPG v2 — Master Prompt (통합본)

이 파일 하나만 읽으면 됨. 관련 파일:
- .claude/design-reference/DESIGN-SYSTEM.md → CSS 디자인 토큰
- .claude/design-reference/bjjdashboard.png → 대시보드 디자인 레퍼런스
- .claude/design-reference/교본_링크매핑.md → 김관장 교본 72개 유튜브 링크 (정확한 매핑)
- .claude/sensei-rpg-v2-skilltree-v3.md → 스킬트리 상세 설계 (교본 기반)

feat/sensei-rpg-v2 브랜치에서 작업. 각 작업 완료 시 커밋. subagent 병렬 OK.

---

## 프로젝트 비전

Sensei = 주짓수 수련의 모든 것을 통합하는 중심 플랫폼.
Phase 1 (현재): 개인 수련 대시보드.
Phase 2 (미래): 체육관 멀티유저. Phase 3: SaaS.
Phase 2 확장을 염두에 둔 데이터 구조 설계 (gymId, role, userId 필드 미리 포함).

---

## 페이지 구조 — 허브 & 스포크

### 탭 구조
🏠 Dashboard (메인 허브, 첫 화면)
📝 Journal (수련 일지) — 기존 SenseiCalendar + SenseiCapture 그대로
📊 Stats (능력치 + 스킬트리) — 6축 상세 + 스킬트리 통합
🏆 BJJ Heroes (선수 비교) — 아키타입 비교
📅 Competition (대회) — 생활체육 대회 참가 관리 + 국제 대회 팔로우
🤖 Coach (AI 코칭) — 한줄 추천 + 자연어 채팅

대시보드 위젯 클릭 → React state activeTab 변경으로 탭 전환.

### 대시보드 레이아웃 (★ .claude/design-reference/bjjdashboard.png 참고)

```
┌─────────────────────────────────────────────────────────┐
│ 좌: [캐릭터 아바타]        중: 이름 Lv.14 Guard Player   우: 최근 수련 기록    │
│     도복+벨트 일러스트        현재: 블루벨트 3그랄           수련 기간: 6년 3개월 │
│                              Lv.14  ████████ 10/12 XP      기록된 수련: 20     │
│                              Lv.2 → Lv.3                   연속:3주 최장:3주    │
│                                                             Gi비율: 80%         │
├─────────────────────────────────────────────────────────┤
│ ═══화이트═══╋╋╋╋═══블루═══╋╋╋●═══════퍼플═══════브라운═══════블랙═══            │
├────────────────────────┬────────────────────────────────┤
│ 좌: 6축 레이더 차트     │ 우: 6축 세로 바 차트            │
│     동심원 10/20/30/40  │     각 카테고리 색상 + 숫자     │
│                        │     아키타입: Lucas Leite        │
├────────────────────────┴────────────────────────────────┤
│ 좌: 최근 포커스 태그 + 가장 많이 기록된 태그              │
│ 우: 목표 프로그레스 + 총수련/연속주/OVR                    │
├─────────────────────────────────────────────────────────┤
│ AI Coach 한 줄 추천 + 자연어 질문 입력                     │
├─────────────────────────────────────────────────────────┤
│ 하단 네비: 수련 기록 | 상세 스탯 | BJJ Heroes | 대회      │
└─────────────────────────────────────────────────────────┘
```

---

## 1. OVR 점수 밸런스

### 피크 스탯 보너스
90+ → +3, 95+ → +5, 98+ → +7. 최종 OVR = 가중평균 + 피크보너스 (cap 99)

### 역할 추가
- Half Guard Specialist: guard .35, passing .15, control .15, finishing .15, takedowns .10, legLocks .10
- Spider Guard Specialist: guard .35, finishing .25, control .10, passing .10, takedowns .10, legLocks .10
- Back Taker: control .30, guard .20, finishing .25, passing .10, takedowns .10, legLocks .05
- Submission Hunter: finishing .35, guard .20, control .15, passing .10, takedowns .10, legLocks .10

### 업적 OVR Floor
Roger Gracie 85, Leandro Lo 85, Marcelo Garcia 85, Rafa Mendes 83, Lucas Leite 80, Lucas Lepri 85, Bernardo Faria 85, Romulo Barral 85, Mica Galvao 88, Tainan Dalpra 80, Diego Pato 83, Mayssa Bastos 85, Adam Wardzinski 80, Gordon Ryan 88, Kade Ruotolo 80, Mikey Musumeci 85, Cole Abate 80, Kaynan Duarte 85, Diogo Reis 80, Craig Jones 75, 조준용 70

---

## 2. Gi / No-Gi 분리

### 태그 분류
공통: Guard(HG,DHG,Closed,Butterfly,KShield,Sit-up,Waiter,HalfButt,Open,XG,SLX,DLR,RDLR,Bolo,SingleSweep,HipSweep,Scissor), Passing(전부), Control(전부), Finishing(RNC,Darce,Guillotine,ArmB,Kimura,Americana,Triangle,Omo,Wristlock,BicepSlicer,Gogoplata,ArmTriangle,Anaconda), Takedowns(전부), LegLocks(SFL만)
Gi전용: Guard(Spider,Lasso,Lapel,Worm,RWorm,Squid,Octopus,CrabRide,Truck), Finishing(BowArrow,CrossChoke,Ezekiel,Baseball)
NoGi전용: Guard(Rubber,KGuard), Finishing(NSChoke), LegLocks(IHH,OHH,Estima,ToeHold,KneeBar,50/50,Ashi,SLAshi,Saddle,OutAshi)

### 이중 계산
```typescript
interface BjjStats { gi: BjjStatsSet; nogi: BjjStatsSet; combined: BjjStatsSet }
```

Gi=#3b82f6, No-Gi=#ef4444. 토글 스위치로 전환.

---

## 3. 메인 대시보드 (★ 가장 중요)

### 디자인 철학
**"AI가 만든 것 같은" 느낌을 피할 것.**
- glow, neon, 그라디언트 효과 ❌
- 정보 밀도 없이 빈 공간만 큰 레이아웃 ❌
- 정보 밀도 높고 한눈에 파악되는 대시보드 ✅
- .claude/design-reference/DESIGN-SYSTEM.md 의 CSS 토큰을 정확히 따를 것 ✅

### 3-1. 캐릭터 프로필 (상단 3컬럼)
좌: 아바타 (avatarUrl 필드, 기본 SVG 실루엣)
중: 이름+Lv+Guard Player+블루벨트3그랄+XP바+Gi/NoGi 토글
우: 수련 기록 요약 (기간, 횟수, 연속, 최장, Gi비율)

### 3-2. 벨트 프로그레션 (연속 벨트)
하나의 연속된 띠. White→Blue→Purple→Brown→Black. 스트라이프=세로막대. 현재위치=●. 미래=30%불투명. 호버→승급날짜.

### 3-3. 레이더 + 바 차트 (2컬럼)
좌: 6축 레이더(동심원 10,20,30,40). 우: 세로바(카테고리색상, 숫자 위에 표시) + 아키타입.

### 3-4. 포커스 + 목표 + Coach
최근 포커스 태그 / 목표 프로그레스 / Coach 한줄 추천 + 질문 입력

### 3-5. Promotions API
```typescript
interface PromotionEvent { date: string; belt: string; stripe?: number; note?: string }
```

---

## 4. Stats 탭 (능력치 + 스킬트리 통합)

### 상단: 6축 상세
큰 레이더 + 스탯 바 + 약점/강점/제안 + Gi/No-Gi 토글

### 하단: 스킬트리 — 김관장 교본 기반 상태 전이 그래프 (★ 핵심)

**반드시 .claude/sensei-rpg-v2-skilltree-v3.md 를 읽고 따를 것.**

핵심 구조:
1. 3계층: Standing → Guard → Control → Submission
2. 가드는 4대 패밀리 (Closed/Half/Open/Sitting) + 파생 (DLR,RDLR,Spider,Lasso,Butterfly,SLX,XG 등)
3. 컨트롤은 탑(공격)과 바텀(탈출)이 별개 노드 (Side Control ≠ Side Escape)
4. 전환에 이유(condition) 포함: "상대가 서면"→DLR, "언더훅 잡으면"→Sit-up
5. 교본 기술은 solid 테두리 + #번호, 심화는 dashed + "advanced" 표시
6. 교본 번호 클릭 → 김관장 유튜브 강의 링크 (.claude/design-reference/교본_링크매핑.md 참조)

기존 SkillTree.tsx 완전 교체. lib/sensei/skillConnections.ts 전면 재설계.

---

## 5. Competition 탭 — 대회 참가 관리 + 국제 대회 팔로우

### 내 대회 (생활체육)
```typescript
interface MyCompetition {
  id: string; name: string; date: string; registrationDeadline?: string
  location: string; ruleSet: "gi"|"nogi"|"both"; organization: string
  division?: string; status: "참가예정"|"등록완료"|"미정"|"불참"|"완료"
  weightClass?: string; result?: string; matchResults?: MatchResult[]
  fee?: number; notes?: string; url?: string
}
interface MatchResult {
  round: string; opponent?: string; result: "승"|"패"|"무"
  method?: string; points?: string; duration?: string
}
```

### Following (국제 대회)
```typescript
interface FollowedEvent {
  id: string; name: string; date: string; location: string
  organization: string; ruleSet: "gi"|"nogi"|"both"; type: "major"
  coachEntries?: { name: string; division: string; result?: string }[]
  url?: string
}
```

### UI
상단: 내 대회 카드 + 상태 뱃지 + 전적/메달 통계
하단: Following 국제 대회 + 관장님 출전 강조

### 대시보드 위젯
내 다음 대회 + D-day / Following 주요 대회 + 관장님 출전

---

## 6. BJJ Heroes + 게임플랜 + Base Stats

### 게임플랜
각 선수 시그니처 공격 루트. 플로우차트 시각화. videoUrl 준비.

### Base Stats
```typescript
interface UserProfile {
  name: string; belt: string; stripes: number
  trainingStartDate: string; gym: string; instructor: string
  avatarUrl?: string
  baseStats: { gi: BjjAttributes; nogi: BjjAttributes }
  nextGoalTitle?: string; nextGoalText?: string
  gymId?: string; role?: "student"|"instructor"|"admin"; userId?: string
}
```
6축 슬라이더 (0~40). 최종 스탯 = max(baseStats, 태그계산값). localStorage.

---

## 7. Coach — 한줄 추천 + 자연어 채팅

### 대시보드 위젯
스탯 기반 한 줄 추천. API 1회 호출 (짧은 max_tokens). 새 세션 기록 시 갱신.
아래에 텍스트 입력 → Coach 탭으로 이동 + 질문 전송.

### Coach 탭
채팅 UI. 상단 스탯 요약 (접기, 기본 접힌 상태). 중앙 채팅. 하단 입력.

### 시스템 프롬프트
```
너는 BJJ 코치 AI. 유저: {belt} {stripes}그랄, {trainingPeriod} 수련
Gi/No-Gi 스탯, OVR, 아키타입, 포커스, 스승(조준용, 코요테하프, Leite 계보), 수련패턴(주5일 Gi4 NoGi1).
대회 전적: {competitionRecord}
코칭 원칙: 구체적 답변, 스승 스타일 존중, 약점→강점 방향, 한글+영어병기.
```

agentId:"sensei-coach". /api/ai/sensei-coach/route.ts 또는 기존 /api/ai/chat 분기.

---

## 디자인 가이드

### 색상
Dark only bg-zinc-950. 모바일 우선. shadcn + Tailwind v4.
벨트: white=#e4e4e7, blue=#3b82f6, purple=#a855f7, brown=#92400e, black=#18181b
카테고리: Guard=#a855f7, Passing=#22c55e, Control=#f97316, Finishing=#ef4444, Takedowns=#06b6d4, LegLocks=#eab308
Gi=#3b82f6, No-Gi=#ef4444

### CSS 토큰
.claude/design-reference/DESIGN-SYSTEM.md 를 반드시 읽고 따를 것.

---

## 수정 금지
SenseiCapture.tsx, SenseiCalendar.tsx, lib/notion/client.ts, components/ui/, components/layout/
