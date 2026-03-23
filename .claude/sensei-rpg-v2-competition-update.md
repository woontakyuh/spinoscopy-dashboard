# Competition 섹션 업데이트 (sensei-rpg-v2-prompt.md의 섹션 5 대체)

기존 "## 5. Competition 탭 — 생활체육 대회 참가 관리" 섹션을 아래로 교체할 것.

---

## 5. Competition 탭 — 대회 참가 관리 + 국제 대회 팔로우

두 가지 기능을 하나의 탭에서:
1. **내 대회**: 직접 참가하는 생활체육/아마추어 대회 관리
2. **Following**: 주요 국제 대회 일정 팔로우 + 관장님/체육관 선수 출전 트래킹

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
  type: "major"
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

### 5-3. Notion DB
- "BJJ My Competitions" DB: 내 대회
- "BJJ Events Calendar" DB: 팔로우 대회 (seed: IBJJF Worlds, ADCC, Pans, Europeans, Grand Slams 등)

### 5-4. UI
**내 대회 섹션 (상단):**
- 날짜순 카드, 등록마감 D-day
- 상태 뱃지 (미정/참가예정/등록완료/완료)
- 완료 대회: 전적 + 경기별 상세
- 통계: 총 참가, 전적, 메달

**Following 섹션 (하단):**
- 올해 주요 국제 대회 캘린더
- 관장님/체육관 선수 출전 시 강조 표시
  - 예: "Coach 조준용: IBJJF Worlds Adult Black Feather -70kg" 강조
- 대회 결과도 업데이트 가능 (관장님 성적 기록)

### 5-5. 대시보드 위젯
상단: 다음 내 대회 1개 + D-day + 참가 상태
하단: Following 주요 대회 2-3개 + 관장님 출전 정보
예:
```
┌ IBJJF Korea Open        Registered ┐
│ May 17 / Seoul / Gi                 │
├─────────────────────────────────────┤
│ Following                           │
│ IBJJF Worlds  Jun 4-8              │
│ ADCC          Sep 13-14            │
│ Coach 조준용: IBJJF Worlds -70kg   │
└─────────────────────────────────────┘
```

### 5-6. 초기 Seed 데이터

**내 대회 (한국 생활체육):**
- IBJJF Korea International Open (연 1-2회)
- AJP Tour Seoul Grand Slam (연 1회)
- SJJIF Korea Open
- 그래플러스네스트 오픈

**Following (국제 메이저):**
- IBJJF World Championship (6월, Las Vegas)
- ADCC World Championship (격년, 9월)
- IBJJF Pan Championship (3월, Irvine)
- IBJJF European Championship (1월, Europe)
- AJP Abu Dhabi World Pro (4월, Abu Dhabi)
- CJI (비정기)

**Coach 출전 트래킹:**
- 조준용: IBJJF Worlds 2026, IBJJF Europeans 2026 (3위)
