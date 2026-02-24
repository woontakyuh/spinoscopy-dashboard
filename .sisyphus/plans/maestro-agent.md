# Maestro Agent — 학회/컨퍼런스 발표 매니저

## TL;DR

> **Quick Summary**: Notion Schedule DB에서 발표 예정 학회만 필터링해 보여주는 전용 에이전트. D-day 카운트다운과 준비상태 관리가 핵심.
> 
> **Deliverables**:
> - `lib/notion/maestro.ts` — Notion 쿼리 함수 (발표 필터링)
> - `lib/types/maestro.ts` — TypeScript 타입 정의
> - `app/api/maestro/presentations/route.ts` — API 엔드포인트
> - `components/maestro/` — UI 컴포넌트 (발표 리스트 + D-day)
> - `app/agents/maestro/page.tsx` — 에이전트 페이지
> - vitest 셋업 + 기본 테스트
> - AgentGrid + Sidebar 활성화
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (DB 검증) → Task 3 (Notion 쿼리) → Task 6 (API) → Task 8 (UI) → Task 10 (통합)

---

## Context

### Original Request
"마에스트로 에이전트도 만들어보자" — 기존 AgentGrid에 placeholder로 있던 🎓 Maestro를 실제 구현. 학회/컨퍼런스 발표 매니저 역할.

### Interview Summary
**Key Discussions**:
- 마에스트로는 오케스트레이터가 아닌 **학회 발표 전용 매니저**: 발표 일정, 준비 상태, D-day 관리
- 데이터 소스: 기존 `NOTION_SCHEDULE_DB_ID` 재사용 (별도 DB 불필요)
- 필터 기준: `참석` select 속성에서 "발표예정" 또는 "준비완료"인 것만 조회
- 메인 뷰: 예정 발표 리스트 + D-day 카운트다운
- 테스트: vitest로 기본 테스트 추가

**Research Findings**:
- Schedule DB 스키마: Name, Date, Place, 분류, 학회명, 발표 주제, 준비 상태, 참석, Link, 초록 제출 기한
- `참석` select 값: 발표예정, 준비완료, 참석만, 불참
- 기존 에이전트 패턴: "use client" + TopBar + components/ + lib/notion/ + app/api/
- Notion 쿼리 패턴: notionRequest → filter → map → React Query
- 기존 `schedule.ts`의 `toScheduleItem()`은 6개 필드만 매핑 — Maestro는 11개 필요하므로 별도 모듈

### Metis Review
**Identified Gaps** (addressed):
- 🔴 `참석` 필드가 코드베이스에서 한 번도 쿼리된 적 없음 → Task 1에서 DB 스키마 검증 선행
- 🔴 Phase 1은 READ-ONLY로 제한 (준비상태 업데이트는 Phase 2 확장)
- 🟡 `schedule.ts` 건드리지 않고 `maestro.ts` 독립 모듈로 생성 (기존 Jarvis/Dashboard 안전)
- 🟡 Sidebar도 함께 업데이트 필요 (AgentGrid만이 아님)
- 🟡 D-day 엣지 케이스: null 날짜, 과거 발표, 다일 컨퍼런스, 만료된 초록 마감일

---

## Work Objectives

### Core Objective
Notion Schedule DB에서 발표 예정/준비완료 학회를 필터링하여 D-day 카운트다운과 함께 보여주는 Maestro 에이전트 구현.

### Concrete Deliverables
- `/app/agents/maestro/page.tsx` — 에이전트 메인 페이지
- `/components/maestro/PresentationList.tsx` — 발표 목록 컴포넌트
- `/components/maestro/PresentationCard.tsx` — 개별 발표 카드 (D-day 포함)
- `/lib/notion/maestro.ts` — Notion 쿼리 함수
- `/lib/types/maestro.ts` — TypeScript 타입
- `/app/api/maestro/presentations/route.ts` — API 라우트
- `vitest.config.ts` + 기본 테스트 파일
- AgentGrid + Sidebar 활성화

### Definition of Done
- [ ] `npm run build` 성공
- [ ] `/agents/maestro` 페이지에서 발표 예정 학회 목록 표시
- [ ] D-day 카운트다운이 정확하게 동작
- [ ] "참석만"/"불참" 항목이 필터링되어 보이지 않음
- [ ] `npx vitest run` 테스트 패스
- [ ] Sidebar + AgentGrid에서 Maestro 활성화

### Must Have
- 발표 예정/준비완료 학회만 필터링
- D-day 카운트다운 (날짜 없으면 "날짜 미정" 표시)
- 학회명, 발표 주제, 준비 상태 표시
- 초록 제출 기한 표시 (있는 경우)
- 반응형 UI (모바일/데스크톱)
- 기존 다크 테마 준수

### Must NOT Have (Guardrails)
- ❌ Notion DB 쓰기/업데이트 (Phase 1은 READ-ONLY)
- ❌ `lib/notion/schedule.ts` 수정 (기존 Jarvis/Dashboard 영향 방지)
- ❌ 오케스트레이터/AI 비서 기능
- ❌ OrchestratorChat.tsx 수정
- ❌ 과도한 추상화 (에이전트 팩토리 패턴 등)
- ❌ 불필요한 JSDoc/주석 남발

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO → vitest 셋업 포함
- **Automated tests**: YES (기본 테스트)
- **Framework**: vitest
- **Scope**: Notion 필터 로직 + API 라우트 + D-day 계산 유틸

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Playwright — Navigate, interact, assert DOM, screenshot
- **API/Backend**: Bash (curl) — Send requests, assert status + response fields
- **Library/Module**: Bash (vitest) — Import, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: DB 스키마 검증 + 참석 필드 확인 [quick]
├── Task 2: vitest 인프라 셋업 [quick]
├── Task 3: TypeScript 타입 정의 [quick]
└── Task 4: D-day 유틸리티 함수 [quick]

Wave 2 (After Wave 1 — core modules):
├── Task 5: Notion 쿼리 모듈 (lib/notion/maestro.ts) [unspecified-high]
├── Task 6: API 라우트 [quick]
├── Task 7: 기본 테스트 작성 [quick]
└── Task 8: UI 컴포넌트 (PresentationCard + PresentationList) [visual-engineering]

Wave 3 (After Wave 2 — integration):
├── Task 9: 에이전트 페이지 조립 [visual-engineering]
├── Task 10: AgentGrid + Sidebar 활성화 [quick]
└── Task 11: 빌드 검증 + 최종 QA [unspecified-high]

Wave FINAL (After ALL tasks — independent review):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review [unspecified-high]
├── Task F3: Real manual QA [unspecified-high]
└── Task F4: Scope fidelity check [deep]

Critical Path: Task 1 → Task 5 → Task 6 → Task 8 → Task 9 → Task 11 → F1-F4
Max Concurrent: 4 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 (DB 검증) | — | 5, 6, 7 |
| 2 (vitest) | — | 7 |
| 3 (타입) | — | 5, 6, 7, 8 |
| 4 (D-day 유틸) | — | 7, 8 |
| 5 (Notion 쿼리) | 1, 3 | 6, 7 |
| 6 (API 라우트) | 3, 5 | 8, 9 |
| 7 (테스트) | 2, 3, 4, 5 | 11 |
| 8 (UI 컴포넌트) | 3, 4, 6 | 9 |
| 9 (페이지) | 6, 8 | 10, 11 |
| 10 (네비게이션) | 9 | 11 |
| 11 (최종 QA) | 7, 9, 10 | F1-F4 |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 `quick`, T2 `quick`, T3 `quick`, T4 `quick`
- **Wave 2**: 4 tasks — T5 `unspecified-high`, T6 `quick`, T7 `quick`, T8 `visual-engineering`
- **Wave 3**: 3 tasks — T9 `visual-engineering`, T10 `quick`, T11 `unspecified-high`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [ ] 1. DB 스키마 검증 — `참석` 필드 확인

  **What to do**:
  - Notion API로 Schedule DB의 스키마를 조회하여 `참석` 속성이 실제로 존재하는지 확인
  - `참석` select의 옵션 값 목록을 가져와서 `발표예정`, `준비완료`, `참석만`, `불참` 값이 실제로 있는지 검증
  - 또한 `준비 상태` select의 옵션 값도 함께 조회 (UI 표시에 필요)
  - 검증 결과를 `.sisyphus/evidence/task-1-db-schema.json`에 저장
  - 만약 `참석` 속성이 없거나 값이 다르면, 실제 속성명과 값을 기록하고 후속 태스크에서 사용할 수 있도록 문서화

  **Must NOT do**:
  - Notion DB에 데이터를 쓰거나 수정하지 않음
  - 스키마를 변경하지 않음

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Notion API 한 번 호출로 끝나는 단순 검증 태스크
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: DB 검증에 브라우저 불필요

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 5, 6, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `lib/notion/sensei.ts` — `fetchBjjSchema()` 함수가 DB 스키마를 동적으로 조회하는 패턴. 이 패턴을 참고해서 Schedule DB 스키마 조회
  - `lib/notion/client.ts` — `notionRequest()` 함수 사용법. Authorization 헤더 및 Notion-Version 헤더 포함

  **API/Type References**:
  - Notion API: `GET /databases/{database_id}` — DB 스키마 반환 (properties 객체에 각 속성의 type과 options 포함)

  **External References**:
  - Notion API docs: https://developers.notion.com/reference/retrieve-a-database

  **WHY Each Reference Matters**:
  - `sensei.ts:fetchBjjSchema()`: 이 프로젝트에서 이미 검증된 DB 스키마 조회 패턴. `response.properties`에서 select 옵션을 추출하는 방법이 구현되어 있음
  - `client.ts`: 모든 Notion API 호출의 기본 패턴. 직접 fetch 대신 이 래퍼를 사용해야 함

  **Acceptance Criteria**:
  - [ ] `.sisyphus/evidence/task-1-db-schema.json` 파일 생성됨
  - [ ] 파일에 `참석` 속성의 실제 이름과 select 옵션 목록 포함
  - [ ] 파일에 `준비 상태` 속성의 실제 이름과 select 옵션 목록 포함

  **QA Scenarios:**

  ```
  Scenario: DB 스키마에서 참석 필드 확인
    Tool: Bash (node/bun script)
    Preconditions: NOTION_TOKEN, NOTION_SCHEDULE_DB_ID 환경변수 설정됨
    Steps:
      1. Notion API GET /databases/{NOTION_SCHEDULE_DB_ID} 호출
      2. response.properties에서 '참석' 키 존재 여부 확인
      3. properties.참석.select.options 배열에서 name 값 추출
      4. '발표예정', '준비완료', '참석만', '불참' 중 몇 개가 매칭되는지 확인
    Expected Result: 참석 속성 존재, select 옵션에 발표예정/준비완료/참석만/불참 포함
    Failure Indicators: 404 응답, properties에 '참석' 키 없음, 옵션 이름 불일치
    Evidence: .sisyphus/evidence/task-1-db-schema.json
  ```

  **Evidence to Capture:**
  - [ ] task-1-db-schema.json: 전체 DB 속성 목록 + 참석/준비상태 select 옵션

  **Commit**: YES (groups with Wave 1)
  - Message: `chore(maestro): add vitest config, types, and D-day utility`
  - Files: `.sisyphus/evidence/task-1-db-schema.json`

- [ ] 2. vitest 인프라 셋업

  **What to do**:
  - `vitest` 및 `@vitejs/plugin-react` 설치 (`bun add -D vitest @vitejs/plugin-react`)
  - `vitest.config.ts` 생성 — Next.js 프로젝트와 호환되도록 path alias (`@/` → `./`) 설정
  - `package.json`에 `"test": "vitest run"`, `"test:watch": "vitest"` 스크립트 추가
  - `__tests__/setup.ts` 또는 `vitest.setup.ts` 파일 생성 (필요시 환경변수 모킹)
  - smoke test: `__tests__/smoke.test.ts` — `expect(1+1).toBe(2)` 수준의 확인 테스트로 vitest가 정상 작동하는지 검증
  - `npx vitest run` 실행하여 smoke test 통과 확인

  **Must NOT do**:
  - jest 설치 (vitest 사용)
  - 기존 소스 코드 수정
  - tsconfig.json 변경 (vitest.config.ts에서 별도 설정)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 패키지 설치 + 설정 파일 1-2개 생성하는 단순 작업
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tsconfig.json` — 현재 path alias 설정 확인. vitest.config.ts의 resolve.alias가 이와 일치해야 함
  - `package.json` — 현재 scripts 섹션 확인. test 스크립트 추가 위치

  **External References**:
  - vitest docs: https://vitest.dev/guide/ — 설치 및 설정
  - vitest + Next.js: https://vitest.dev/guide/common-errors.html — Next.js 환경 주의사항

  **WHY Each Reference Matters**:
  - `tsconfig.json`: `@/` alias가 vitest에서도 동작하려면 `resolve.alias` 매핑 필요
  - `package.json`: 기존 스크립트와 충돌 없이 test 명령 추가

  **Acceptance Criteria**:
  - [ ] `vitest.config.ts` 생성됨
  - [ ] `package.json`에 test 스크립트 추가됨
  - [ ] `npx vitest run` 실행 시 smoke test 통과 (1 test passed)

  **QA Scenarios:**

  ```
  Scenario: vitest 정상 동작 확인
    Tool: Bash
    Preconditions: vitest 패키지 설치 완료
    Steps:
      1. npx vitest run 실행
      2. 출력에서 'Tests  1 passed' 또는 'Tests passed' 확인
      3. exit code 0 확인
    Expected Result: 1 test passed, exit code 0
    Failure Indicators: 'Cannot find module', 'Configuration error', exit code 1
    Evidence: .sisyphus/evidence/task-2-vitest-setup.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `chore(maestro): add vitest config, types, and D-day utility`
  - Files: `vitest.config.ts`, `package.json`, `__tests__/smoke.test.ts`

- [ ] 3. TypeScript 타입 정의

  **What to do**:
  - `lib/types/maestro.ts` 생성
  - `Presentation` 인터페이스 정의: page_id, url, name, date_start, date_end, place, category, society(string[]), topic, preparation_status, attendance_type, link, abstract_deadline
  - `PresentationFilter` 인터페이스: attendance_type, society, preparation_status, date_from, date_after
  - D-day 유틸리티의 반환 타입: `DdayInfo` — { days: number | null, label: string, isPast: boolean }
  - 모든 필드는 optional (널 가능성 반영) — date_start, topic, preparation_status 등은 `string | null`

  **Must NOT do**:
  - 기존 `lib/types/schedule.ts` 수정 금지
  - 불필요한 제네릭 타입 만들지 않음

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 타입 정의 파일 1개 생성
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 5, 6, 7, 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `lib/types/journal.ts` — JournalArticle 인터페이스와 JournalFilter 패턴. optional 필드, 널 허용 패턴 참고
  - `lib/types/schedule.ts` — ScheduleCreateInput 타입. society: string[], category enum 값들 확인
  - `lib/types/vault.ts` — AssetPrice 인터페이스. 단순한 데이터 타입 정의 패턴

  **WHY Each Reference Matters**:
  - `journal.ts`: 필터 타입 패턴이 가장 유사함. `JournalFilter`처럼 `PresentationFilter`를 정의
  - `schedule.ts`: `society: string[]` 타입과 `category` enum 값이 이미 정의됨. 동일한 값을 Maestro에서도 사용

  **Acceptance Criteria**:
  - [ ] `lib/types/maestro.ts` 파일 생성됨
  - [ ] `Presentation` 인터페이스에 모든 필요한 필드 포함
  - [ ] `PresentationFilter` 인터페이스 정의됨
  - [ ] `tsc --noEmit` 성공

  **QA Scenarios:**

  ```
  Scenario: 타입 정의 컴파일 성공
    Tool: Bash
    Preconditions: 파일 생성 완료
    Steps:
      1. npx tsc --noEmit 실행
      2. lib/types/maestro.ts 관련 에러 없음 확인
    Expected Result: 컴파일 성공, 에러 없음
    Failure Indicators: 'TS2307: Cannot find module', 'TS2304: Cannot find name'
    Evidence: .sisyphus/evidence/task-3-types-compile.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `chore(maestro): add vitest config, types, and D-day utility`
  - Files: `lib/types/maestro.ts`

- [ ] 4. D-day 유틸리티 함수

  **What to do**:
  - `lib/utils/dday.ts` 생성
  - `calculateDday(targetDate: string | null): DdayInfo` 함수 구현:
    - 날짜가 null이면 `{ days: null, label: '날짜 미정', isPast: false }` 반환
    - 미래 날짜: `{ days: 30, label: 'D-30', isPast: false }` (양수)
    - 오늘: `{ days: 0, label: 'D-DAY', isPast: false }`
    - 과거 날짜: `{ days: -5, label: 'D+5', isPast: true }` (음수)
  - 타임존 무관하게 UTC 날짜 기준으로 계산 (YYYY-MM-DD 문자열 비교)
  - 순수 함수로 구현 (import 없음, 사이드 이펙트 없음)

  **Must NOT do**:
  - date-fns, dayjs 등 외부 라이브러리 설치 금지 (네이티브 Date API 사용)
  - 타임존 변환 로직 포함 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 순수 함수 1개 구현
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `components/dashboard/MorningBriefing.tsx` — `getGreeting()` 함수에서 시간 기반 로직 참고. 단순한 유틸리티 함수 패턴

  **WHY Each Reference Matters**:
  - `MorningBriefing.tsx`: 날짜/시간 기반 로직의 프로젝트 내 관례 확인

  **Acceptance Criteria**:
  - [ ] `lib/utils/dday.ts` 생성됨
  - [ ] null 입력 시 '날짜 미정' 반환
  - [ ] 미래 날짜에 대해 양수 days + 'D-N' label
  - [ ] 오늘 날짜에 대해 days=0 + 'D-DAY' label
  - [ ] 과거 날짜에 대해 음수 days + 'D+N' label + isPast=true

  **QA Scenarios:**

  ```
  Scenario: D-day 계산 정확성 검증
    Tool: Bash (node/bun)
    Preconditions: lib/utils/dday.ts 생성 완료
    Steps:
      1. bun eval 또는 node -e로 calculateDday 함수 import
      2. calculateDday(null) 호출 → { days: null, label: '날짜 미정', isPast: false } 확인
      3. calculateDday('오늘날짜') 호출 → { days: 0, label: 'D-DAY', isPast: false } 확인
      4. calculateDday('내일날짜') 호출 → { days: 1, label: 'D-1', isPast: false } 확인
      5. calculateDday('어제날짜') 호출 → { days: -1, label: 'D+1', isPast: true } 확인
    Expected Result: 모든 케이스에서 예상 결과 일치
    Failure Indicators: 음수/양수 반전, null 처리 실패, label 형식 오류
    Evidence: .sisyphus/evidence/task-4-dday-calc.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `chore(maestro): add vitest config, types, and D-day utility`
  - Files: `lib/utils/dday.ts`

---


- [ ] 5. Notion 쿼리 모듈 (lib/notion/maestro.ts)

  **What to do**:
  - `lib/notion/maestro.ts` 생성
  - `toPresentation(page): Presentation` 매퍼: Notion 페이지에서 모든 필드 추출. 학회명 multi_select → string[]. null/빈값 안전 처리.
  - `getPresentations(filter?): Promise<Presentation[]>`: 기본 필터 `참석` = 발표예정 OR 준비완료. Date ascending 정렬. page_size 50.
  - Task 1 DB 검증 결과 참고하여 실제 속성명 사용
  - **Must NOT do**: schedule.ts import/수정, DB 쓰기, 과도한 추상화
  - **Agent**: `unspecified-high` | **Skills**: [] | **Wave**: 2 | **Blocks**: 6, 7 | **Blocked By**: 1, 3
  - **Refs**: `lib/notion/journal.ts` (or 필터), `lib/notion/sensei.ts` (toTrainingEntry 매퍼), `lib/notion/client.ts` (notionRequest)
  - **Acceptance**: getPresentations() 호출 시 발표예정/준비완료만 반환, 날짜순 정렬, Presentation 타입 일치

  **QA Scenarios:**
  ```
  Scenario: 발표 목록 조회 — curl localhost:3000/api/maestro/presentations → presentations 배열의 모든 attendance_type이 발표예정 or 준비완료
  Scenario: null date 처리 — date_start: null 항목도 에러 없이 반환
  Evidence: .sisyphus/evidence/task-5-notion-query.json
  ```
  **Commit**: Wave 2 — `feat(maestro): add Notion query, API route, and UI components`

- [ ] 6. API 라우트 (app/api/maestro/presentations/route.ts)

  **What to do**:
  - GET 핸들러: query params (society, status, upcoming_only) → getPresentations(filter) → NextResponse.json({ presentations })
  - 에러 처리: try/catch, 500 + error message
  - POST/PATCH/DELETE → 405 Method Not Allowed 반환 (READ-ONLY)
  - **Must NOT do**: 쓰기 엔드포인트 구현, 인증 로직 추가
  - **Agent**: `quick` | **Skills**: [] | **Wave**: 2 (after T5) | **Blocks**: 8, 9 | **Blocked By**: 3, 5
  - **Refs**: `app/api/notion/journal/route.ts` (GET+filter 패턴), `app/api/vault/prices/route.ts` (기본 GET)
  - **Acceptance**: GET → 200 + presentations array, POST → 405, 에러 시 500 + message

  **QA Scenarios:**
  ```
  Scenario: curl -s localhost:3000/api/maestro/presentations | jq '.presentations | length' → 0 이상
  Scenario: curl -X POST localhost:3000/api/maestro/presentations → 405
  Evidence: .sisyphus/evidence/task-6-api-response.json
  ```
  **Commit**: Wave 2 — `feat(maestro): add Notion query, API route, and UI components`

- [ ] 7. 기본 테스트 작성

  **What to do**:
  - `__tests__/maestro/dday.test.ts`: calculateDday null/미래/오늘/과거 4개 케이스
  - `__tests__/maestro/filter.test.ts`: 필터 객체 구조 검증 + toPresentation 매퍼 테스트
  - **Must NOT do**: Notion API 실제 호출 (모든 외부 호출 모킹)
  - **Agent**: `quick` | **Skills**: [] | **Wave**: 2 | **Blocks**: 11 | **Blocked By**: 2, 3, 4, 5
  - **Refs**: `__tests__/smoke.test.ts` (vitest 패턴), `lib/utils/dday.ts`, `lib/notion/maestro.ts`
  - **Acceptance**: `npx vitest run` → 모든 테스트 통과 (6+ tests, 0 failed)

  **QA Scenarios:**
  ```
  Scenario: npx vitest run → 'Tests  N passed' (N >= 6), exit code 0
  Evidence: .sisyphus/evidence/task-7-test-results.txt
  ```
  **Commit**: Wave 2 — `feat(maestro): add Notion query, API route, and UI components`

- [ ] 8. UI 컴포넌트 (PresentationCard + PresentationList)

  **What to do**:
  - `components/maestro/PresentationCard.tsx`:
    - D-day 배지 색상: D-DAY(red) / D-1~7(amber) / D-8~30(cyan) / D-31+(zinc) / 과거(zinc-700+얰한) / 미정(zinc-700)
    - 카드: 학회명(배지), 발표주제(메인), 날짜, 장소, 준비상태, 초록마감일, Link
  - `components/maestro/PresentationList.tsx`:
    - React Query로 /api/maestro/presentations 페치
    - 로딩: Skeleton 3개 | 빈 상태: '예정된 발표가 없습니다' | 에러: 메시지+재시도
  - **Must NOT do**: 필터/검색 UI, 페이지네이션, 카드 클릭 상세 모달
  - **Agent**: `visual-engineering` | **Skills**: [`playwright`] | **Wave**: 2 | **Blocks**: 9 | **Blocked By**: 3, 4, 6
  - **Refs**: `components/vault/VaultDashboard.tsx` (카드 리스트 + 로딩/에러), `components/clinicus/PromDisplay.tsx` (다크 카드 스타일), `components/scholar/ArticleList.tsx` (React Query 데이터 페칭)
  - **Acceptance**: D-day 배지 색상 변경, 로딩/에러/빈 상태 표시, 다크 테마 zinc palette

  **QA Scenarios:**
  ```
  Scenario: Playwright로 /agents/maestro → .presentation-card 1개+, D-day 배지 텍스트, 학회명/발표주제 존재 확인
  Scenario: 빈 상태 → '예정된 발표가 없습니다' 텍스트 확인
  Evidence: .sisyphus/evidence/task-8-presentation-card.png, task-8-empty-state.png
  ```
  **Commit**: Wave 2 — `feat(maestro): add Notion query, API route, and UI components`

- [ ] 9. 에이전트 페이지 조립 (app/agents/maestro/page.tsx)

  **What to do**:
  - 기존 에이전트 패턴 따름: `"use client"` + TopBar + intro card + PresentationList
  - TopBar title: `"🎓 Maestro"`
  - Intro card: '학회 발표 일정과 준비 상태를 한 눈에 확인하세요.' (border-zinc-700, bg-zinc-900)
  - max-w-4xl w-full, p-3 md:p-6
  - **Must NOT do**: OrchestratorChat.tsx 수정, 추가 탭/섹션
  - **Agent**: `visual-engineering` | **Skills**: [`playwright`] | **Wave**: 3 | **Blocks**: 10, 11 | **Blocked By**: 6, 8
  - **Refs**: `app/agents/scholar/page.tsx` (가장 유사한 페이지 구조), `app/agents/vault/page.tsx` (단순 레이아웃)

  **QA Scenarios:**
  ```
  Scenario: Playwright로 /agents/maestro → TopBar '🎓 Maestro' 확인, intro card 텍스트 확인, PresentationList 렌더링 확인
  Evidence: .sisyphus/evidence/task-9-maestro-page.png
  ```
  **Commit**: Wave 3 — `feat(maestro): complete agent page with navigation activation`

- [ ] 10. AgentGrid + Sidebar 활성화

  **What to do**:
  - `components/dashboard/AgentGrid.tsx`: Maestro 항목의 `active: true`, `href: "/agents/maestro"`로 변경
  - `components/layout/Sidebar.tsx`: Maestro 항목의 `active: true`, `href: "/agents/maestro"`로 변경
  - **Must NOT do**: desc 변경 ("교육 · 강의 관리" 유지), 아이콘 변경 (🎓 유지)
  - **Agent**: `quick` | **Skills**: [] | **Wave**: 3 | **Blocks**: 11 | **Blocked By**: 9
  - **Refs**: `components/dashboard/AgentGrid.tsx:9` (Maestro 항목), `components/layout/Sidebar.tsx:11` (Maestro 항목)

  **QA Scenarios:**
  ```
  Scenario: Playwright로 / → AgentGrid에서 Maestro 카드 클릭 → /agents/maestro 이동 확인
  Scenario: Sidebar에서 Maestro 클릭 → /agents/maestro 이동 확인
  Evidence: .sisyphus/evidence/task-10-navigation.png
  ```
  **Commit**: Wave 3 — `feat(maestro): complete agent page with navigation activation`

- [ ] 11. 빌드 검증 + 최종 QA

  **What to do**:
  - `npm run build` 성공 확인
  - `npx vitest run` 모든 테스트 통과 확인
  - `tsc --noEmit` 타입 에러 없음 확인
  - Playwright로 전체 플로우 검증:
    - / (home) → AgentGrid Maestro 클릭 → /agents/maestro 페이지 로드
    - Sidebar Maestro 클릭 → 동일 페이지
    - 발표 카드 D-day 표시, 학회명, 주제 확인
    - '참석만'/'불참' 항목 부재 확인
  - `lib/notion/schedule.ts`가 변경되지 않았는지 git diff로 확인
  - **Agent**: `unspecified-high` | **Skills**: [`playwright`] | **Wave**: 3 | **Blocks**: F1-F4 | **Blocked By**: 7, 9, 10

  **QA Scenarios:**
  ```
  Scenario: npm run build → '✓ Compiled successfully'
  Scenario: npx vitest run → 모든 테스트 passed
  Scenario: git diff lib/notion/schedule.ts → no changes
  Scenario: Playwright 전체 플로우 (/ → AgentGrid → /agents/maestro → 카드 확인)
  Evidence: .sisyphus/evidence/task-11-build.txt, task-11-full-flow.png
  ```
  **Commit**: Wave 3 — `feat(maestro): complete agent page with navigation activation`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + `npx vitest run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify dark theme consistency (zinc color palette).
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` + `playwright` skill
  Start from clean state. Navigate to `/agents/maestro`. Verify: presentation list loads, D-day displays correctly, "참석만" entries are NOT shown, mobile responsive layout works. Navigate from Sidebar and AgentGrid to verify links. Take screenshots.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check `lib/notion/schedule.ts` was NOT modified. Check no Notion write operations exist. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Commit 1** (after Wave 1): `chore(maestro): add vitest config, types, and D-day utility`
- **Commit 2** (after Wave 2): `feat(maestro): add Notion query, API route, and UI components`
- **Commit 3** (after Wave 3): `feat(maestro): complete agent page with navigation activation`

---

## Success Criteria

### Verification Commands
```bash
npm run build                    # Expected: ✓ Compiled successfully
npx vitest run                   # Expected: Tests passed
curl localhost:3000/agents/maestro  # Expected: 200 OK with presentation list
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `npm run build` passes
- [ ] `npx vitest run` passes
- [ ] Maestro active in sidebar and agent grid
- [ ] `lib/notion/schedule.ts` untouched
- [ ] No Notion write operations in maestro code
