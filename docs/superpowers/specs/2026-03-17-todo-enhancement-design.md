# Todo Enhancement Design Spec

## 개요
Jarvis 할일 시스템에 3가지 기능을 추가한다: 우선순위 조정 UI, 카테고리 UI, 할일 트래킹 페이지.

---

## 사전 준비

### shadcn 컴포넌트 설치
```bash
npx shadcn@latest add dropdown-menu
```
- `Table` — 이미 설치됨 (`components/ui/table.tsx`)
- `Tabs` — 이미 설치됨
- `Badge` — 이미 설치됨

---

## 1) 우선순위 조정 기능

### TodayTodo 위젯 수정 (`components/dashboard/TodayTodo.tsx`)
- 기존 우선순위 뱃지를 **클릭 가능**하게 변경
- 클릭 시 DropdownMenu로 High/Medium/Low 선택
- 선택 시 PATCH `/api/jarvis/todo` 호출 → `{ page_id, priority: "High" }`
- 낙관적 업데이트 (React Query `onMutate`)
- 빠른 추가 폼에 우선순위 선택 버튼 그룹 추가 (기본 Medium)

### TodayTodo 코드 수정 사항
- `TodoItem` 인터페이스에 `category: string` 필드 추가 (현재 누락)
- `patchTodo()` 함수 시그니처 확장: `{ page_id: string; status?: string; priority?: string; category?: string }` (현재 status만 타입 지정)

### API 변경
- 없음 (기존 PATCH API가 priority 필드 지원)

---

## 2) 카테고리 기능

### 카테고리 목록
하드코딩: `["일상업무", "가족", "학회", "연구", "임상", "AI"]`

### TodayTodo 위젯 수정
- 할일 항목에 카테고리 뱃지 표시 (이름 아래 또는 우선순위 뱃지 옆)
- 카테고리별 색상:
  - 일상업무 → zinc (기본)
  - 가족 → green
  - 학회 → purple
  - 연구 → blue
  - 임상 → orange
  - AI → cyan
- 빠른 추가 폼에 카테고리 선택 드롭다운 (기본 "일상업무")

### API 변경
- 없음 (기존 POST/PATCH API가 category 필드 지원)

---

## 3) 할일 트래킹 페이지

### Notion DB 변경
- `Completed At` (Date) 속성을 NOTION_TODO_DB_ID 데이터베이스에 추가
- 날짜만 기록 (`YYYY-MM-DD`, datetime 아님) — 소요 기간 계산에 충분
- API에서 할일을 Done 처리할 때 `Completed At`에 현재 날짜 자동 기록

### lib/notion/todo.ts 수정
- `NotionPage` 인터페이스에 `created_time: string` 추가 (Notion 페이지 레벨 속성)
- `TodoItem` 인터페이스에 `completed_at: string | null`, `created_at: string` 추가
- `toTodoItem()` — `page.created_time`에서 `created_at` 읽기, `Completed At` 속성에서 `completed_at` 읽기
- `updateTodo()` — status가 "Done"으로 변경될 때 `Completed At` 속성에 서울 시간 기준 오늘 날짜 세팅
- `getAllTodos()` — `page_size: 100` 제한 유지 (히스토리 "전체"도 최근 100개로 제한, 페이지네이션은 스코프 외)

### API 수정 (`app/api/jarvis/todo/route.ts`)
- GET: `?status=Done` 요청 시 `completed_at`, `created_at` 포함하여 반환
- PATCH: status를 "Done"으로 변경 시 `Completed At` 자동 세팅

### Jarvis 페이지 수정 (`app/agents/jarvis/page.tsx`)
- 기존 페이지에 **Tabs** 추가: "발표 관리" (기존) | "할일 히스토리" (신규)
- 할일 히스토리 탭 내용:

#### 요약 통계 카드 (상단)
- 완료 수 (선택 기간)
- 평균 처리 시간 (일 단위)
- 카테고리별 완료 수 (가장 많은 카테고리 표시)

#### 완료된 할일 테이블
| 할일 | 카테고리 | 우선순위 | 입력일 | 완료일 | 소요 기간 |
|------|---------|---------|--------|--------|----------|
| ... | 뱃지 | 뱃지 | YYYY-MM-DD | YYYY-MM-DD | N일 |

#### 기간 필터
- 이번 주 / 이번 달 / 전체 (토글 버튼)
- "전체"는 최근 100개로 제한

#### 상태 처리
- 로딩: Skeleton 로더 (기존 패턴 따름)
- 에러: "히스토리를 불러오지 못했습니다." 텍스트
- 빈 상태: "완료된 할일이 없습니다."

### 신규 컴포넌트
```
components/jarvis/TodoHistory.tsx     — 트래킹 탭 전체 (통계 + 테이블)
components/jarvis/TodoStatsCards.tsx   — 요약 통계 카드 3개
```

---

## 다크 테마
기존 zinc 팔레트 유지 (`bg-zinc-900`, `border-zinc-700`, `text-zinc-100`)

## 스코프 외
- 카테고리 동적 관리 (추가/삭제/편집)
- 차트/그래프 (중간 레벨이므로 텍스트 통계만)
- 할일 검색 기능
- 페이지네이션 (100개 제한으로 충분)
