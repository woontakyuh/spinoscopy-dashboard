# Scholar Agent Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scholar 에이전트를 spine surgeon 관점의 연구 대시보드로 재설계 — 인터랙티브 시각화 대시보드 + Notion DB 스타일 논문 탐색

**Architecture:** 2탭 구조. Tab 1(Dashboard)은 전체 논문 메타데이터를 클라이언트에서 크로스필터링하는 인터랙티브 차트. Tab 2(Articles)는 서버사이드 페이지네이션 + 다중 필터 조합의 테이블형 리스트. 기존 API(`/api/notion/journal`)에 `action=dashboard` 추가 완료.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, React Query, Notion API, Groq (번역/요약)

---

## File Structure

### 새로 생성
| File | 역할 |
|------|------|
| `components/scholar/DashboardCharts.tsx` | 크로스필터 대시보드 — 인터랙티브 바 차트 4개 (주제/국가/유형/저널) + 요약 카드 |
| `components/scholar/ArticleTable.tsx` | Notion DB 스타일 테이블 리스트 — 날짜 내림차순, 인라인 필터, DOI 링크 |
| `components/scholar/ArticleSheet.tsx` | 논문 상세 사이드 패널 — abstract, 한글번역, 요약, 메타데이터 |

### 수정
| File | 변경 내용 |
|------|----------|
| `app/agents/scholar/page.tsx` | 탭 구조 재연결 (DashboardCharts + ArticleTable) |
| `components/scholar/ScholarDashboard.tsx` | **삭제** → DashboardCharts로 대체 |
| `components/scholar/ArticleList.tsx` | **삭제** → ArticleTable로 대체 |
| `components/scholar/ArticleDetail.tsx` | **삭제** → ArticleSheet로 대체 |
| `components/scholar/ArticleFilter.tsx` | **삭제** → ArticleTable 내장 필터로 통합 |
| `components/scholar/ArticleSummaryBar.tsx` | **삭제** → DashboardCharts가 역할 흡수 |
| `components/scholar/StatsOverview.tsx` | **삭제** → DashboardCharts가 역할 흡수 |
| `components/scholar/JournalTrend.tsx` | **삭제** → DashboardCharts가 역할 흡수 |

### 유지
| File | 비고 |
|------|------|
| `lib/scholar/country.ts` | 국가 추출, 주제 분류, 논문 유형 정규화 (완료) |
| `lib/notion/journal.ts` | `getDashboardData()` 추가 완료, 기존 함수 유지 |
| `lib/types/journal.ts` | `ArticleMeta`, `DashboardData` 타입 추가 완료 |
| `app/api/notion/journal/route.ts` | `action=dashboard` 추가 완료 |

---

## Task 1: DashboardCharts — 인터랙티브 크로스필터 대시보드

**Files:**
- Create: `components/scholar/DashboardCharts.tsx`
- Modify: `app/agents/scholar/page.tsx`

### 디자인 컨셉
- **상단**: 4개 stat 카드 (전체/안읽음/이번주/필독미읽음)
- **중단**: 4개 바 차트 (주제 트렌드, 국가 분포, 논문 유형, 저널별) — 2x2 그리드
  - 각 바 클릭 → 해당 값으로 필터 적용 → 나머지 3개 차트 실시간 재집계
  - 활성 필터는 상단에 태그로 표시, X로 해제
  - 바는 max 기준 상대 비율, 호버 시 하이라이트
- **하단**: 필독 미읽음 리스트 (최대 5개) — 클릭 시 Articles 탭으로 이동
- **컬러**: 주제=indigo, 국가=emerald, 유형=amber, 저널=cyan
- **애니메이션**: 바 width transition, 카드 fade-in-up

- [ ] **Step 1: DashboardCharts 컴포넌트 작성**

핵심 구조:
```
<DashboardCharts>
  ├─ ActiveFilterBar (활성 필터 태그 + 전체해제 + 매칭 수)
  ├─ StatCards (4개, 필터 적용된 집계)
  ├─ ChartGrid (2x2)
  │   ├─ BarChart "주제 트렌드" (TOPIC_GROUPS 기반)
  │   ├─ BarChart "국가 분포" (국기 이모지 포함)
  │   ├─ BarChart "논문 유형" (Original/Review/Meta/Case/RCT/Video/Other)
  │   └─ BarChart "저널별" (6개 저널)
  └─ MustReadList (필독 미읽음 5개)
```

- `useMemo`로 각 차트 데이터 재계산 (필터 변경 시)
- 바 차트는 재사용 가능한 `<InteractiveBar>` 내부 컴포넌트
- 바 클릭 → `toggleFilter(dimension, value)` → state 변경 → 모든 차트 재계산

- [ ] **Step 2: page.tsx 연결**

기존 ScholarDashboard import를 DashboardCharts로 교체.

- [ ] **Step 3: 기존 파일 삭제**

ScholarDashboard.tsx, StatsOverview.tsx, JournalTrend.tsx, ArticleSummaryBar.tsx 삭제.

- [ ] **Step 4: 빌드 확인 및 커밋**

```bash
npm run build
git add -A && git commit -m "feat(scholar): interactive cross-filter dashboard"
```

---

## Task 2: ArticleTable — Notion DB 스타일 논문 리스트

**Files:**
- Create: `components/scholar/ArticleTable.tsx`
- Modify: `app/agents/scholar/page.tsx`

### 디자인 컨셉
- **상단 필터 바**: 가로 1줄에 모든 필터 — 저널 버튼 그룹 + 관심도 + 읽음 상태 + 검색
  - 저널 필터: 6개 버튼 (ESJ, GSJ, JNS, Neurospine, Spine, TSJ) — 토글식 다중 선택
  - 관심도: 🔴🟡⚪ 아이콘 버튼
  - 읽음: 전체/안읽음/읽음 세그먼트
  - 검색: 제목 텍스트 검색 (debounce)
- **테이블 헤더**: 날짜 | 관심 | 제목 | 저널 | 국가 | 유형 | DOI
- **테이블 행**:
  - 날짜: `YYYY-MM-DD` compact
  - 관심도: 컬러 dot (🔴🟡⚪)
  - 제목: 클릭 → ArticleSheet 열림, 미읽음이면 볼드
  - 저널: 약칭 뱃지
  - 국가: 국기 이모지
  - 유형: 약칭 뱃지
  - DOI: 외부 링크 아이콘 (클릭 → 새 탭)
- **정렬**: 기본 날짜 내림차순, 헤더 클릭으로 정렬 변경
- **페이지네이션**: 하단 "더보기" 버튼 (100개씩)
- **row 호버**: 배경 하이라이트 + card-hover 효과

- [ ] **Step 1: ArticleTable 컴포넌트 작성**

인라인 필터 바 + 테이블 헤더 + 행 렌더링 + 페이지네이션.
필터 상태는 컴포넌트 내부에서 관리, API 호출은 React Query.

- [ ] **Step 2: page.tsx에서 기존 browse 탭 교체**

ArticleList, ArticleFilter, ArticleSummaryBar import 제거.
ArticleTable로 교체. selectedArticle 상태는 유지 (ArticleSheet 연동용).

- [ ] **Step 3: 기존 파일 삭제**

ArticleList.tsx, ArticleFilter.tsx 삭제.

- [ ] **Step 4: 빌드 확인 및 커밋**

```bash
npm run build
git add -A && git commit -m "feat(scholar): notion-style article table with inline filters"
```

---

## Task 3: ArticleSheet — 논문 상세 사이드 패널

**Files:**
- Create: `components/scholar/ArticleSheet.tsx`
- Modify: `app/agents/scholar/page.tsx`

### 디자인 컨셉
- 테이블에서 논문 제목 클릭 → 우측에서 슬라이드인 (또는 인라인 확장)
- **상단**: 제목 (큰 텍스트) + DOI 외부링크 버튼
- **메타 행**: 저널 | 날짜 | 국가 | 유형 | Vol/Issue
- **저자**: 펼치기/접기
- **Abstract**: 영문 원문 (기본 표시)
- **한글 번역**: 버튼 클릭 → Groq API → 결과 표시 (접기/펼치기)
- **한줄 요약**: 버튼 클릭 → Groq API → 결과 표시
- **관심도/읽음**: 토글 버튼
- **Keywords/Categories**: 뱃지
- **Notion 링크**: 하단

- [ ] **Step 1: ArticleSheet 컴포넌트 작성**

기존 ArticleDetail.tsx의 로직(번역, 관심도 변경, 읽음 토글) 재활용하되 레이아웃 재설계.
`Dialog` 또는 오버레이 패널 형태.

- [ ] **Step 2: page.tsx 연결**

ArticleTable에서 `onSelect` → ArticleSheet 열림.
ArticleDetail.tsx import 제거.

- [ ] **Step 3: 기존 파일 삭제**

ArticleDetail.tsx, ArticleSummaryBar.tsx 삭제.

- [ ] **Step 4: 빌드 확인 및 커밋**

```bash
npm run build
git add -A && git commit -m "feat(scholar): article detail sheet with translation"
```

---

## Task 4: 이메일 알람 점검/수리

**Files:**
- Check: `lib/journal-alert/pipeline.ts`
- Check: `lib/journal-alert/config.ts`
- Check: `app/api/notion/journal/alert/run/route.ts`
- Check: Vercel cron 설정 (`vercel.json`)

- [ ] **Step 1: 알람 파이프라인 로컬 테스트**

`/api/notion/journal/alert/run?days=7` 을 직접 호출하여:
- PubMed 검색이 동작하는지
- 새 논문이 감지되는지
- Notion 삽입이 되는지
- 이메일 발송이 되는지

- [ ] **Step 2: 문제 원인 파악 및 수정**

가능한 원인들:
- Vercel Cron 비활성화 또는 미설정
- SMTP 인증 만료
- PubMed API rate limit
- dedup 로직이 모든 논문을 "기존"으로 판단

- [ ] **Step 3: 수리 후 테스트 및 커밋**

```bash
npm run build
git add -A && git commit -m "fix(scholar): repair journal alert pipeline"
```

---

## Task 5: 통합 테스트 및 배포

- [ ] **Step 1: 전체 빌드 확인**
- [ ] **Step 2: 로컬에서 Dashboard 탭 확인** — 크로스필터 동작
- [ ] **Step 3: 로컬에서 Articles 탭 확인** — 필터 + 상세
- [ ] **Step 4: 커밋 및 푸시**

```bash
git push origin main
```

---

## 실행 순서

```
Task 1 (DashboardCharts) → Task 2 (ArticleTable) → Task 3 (ArticleSheet)
→ Task 4 (이메일 수리) → Task 5 (통합 배포)
```

Task 1-3은 순차적 (각 태스크가 이전 결과에 의존).
Task 4는 독립적 (병렬 가능하나 같은 코드베이스이므로 순차 권장).
