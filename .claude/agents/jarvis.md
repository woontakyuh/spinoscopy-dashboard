# Jarvis 개발 컨텍스트

## 역할
자연어(NLP) 기반 일정 등록 + 할일 관리. 텍스트/이미지 입력 → 구조화 → Notion + Google Calendar 등록.
가장 큰 에이전트 페이지 (~900줄).

## 파일 맵

### 페이지
- `app/agents/jarvis/page.tsx` — 메인 페이지 ("use client", 탭 구조: 일정 등록 + Todo)

### API
- `app/api/jarvis/parse/route.ts` — NLP 파싱 (텍스트 + 이미지 → 구조화 JSON)
- `app/api/jarvis/schedule/route.ts` — 일정 생성 (Notion + Google Calendar)
- `app/api/jarvis/todo/route.ts` — Todo CRUD (GET/POST/PATCH/DELETE)
- `app/api/notion/schedule/route.ts` — 일정 목록 조회
- `app/api/google/calendar/route.ts` — Google Calendar 연동

### Lib
- `lib/notion/schedule.ts` — Notion Schedule DB 쿼리
- `lib/notion/todo.ts` — Notion Todo DB 쿼리
- `lib/types/schedule.ts` — 일정 타입 (ScheduleItem, ScheduleCreateInput, ScheduleCreateResult)
- `lib/google/calendar.ts` — Google Calendar API 래퍼

## 타입 요약
```typescript
interface ScheduleItem { page_id, url, name, date_start, date_end, place, category, status }
interface ScheduleCreateInput { name, date_start, date_end?, place?, category?, society?[], targets?: ("notion"|"gcal")[], status?, topic?, link?, abstract_deadline? }
interface ScheduleCreateResult { success, notion?, google_calendar?, error? }
```

## 외부 연동
- **Notion DB**: `NOTION_SCHEDULE_DB_ID` — ⚠️ Podium과 공유!
- **Notion DB**: `NOTION_TODO_DB_ID` — Todo 전용
- **Google Calendar**: OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- **Groq**: Llama 3.3-70b (텍스트 파싱), Llama 3.2-11b (이미지/비전 파싱) — `GROQ_API_KEY`

## 수정 가능 범위
- `app/agents/jarvis/`
- `app/api/jarvis/` (parse, schedule, todo)
- `app/api/notion/schedule/`
- `app/api/google/calendar/`
- `lib/notion/schedule.ts`
- `lib/notion/todo.ts`
- `lib/types/schedule.ts`
- `lib/google/calendar.ts`

## 읽기 전용
- `lib/notion/podium.ts` — Podium 전용, 절대 수정 금지
- `lib/notion/client.ts`, `lib/utils.ts`
- `components/ui/`, `components/layout/`

## 의존성 주의사항
- **Podium과 Schedule DB 공유**: 같은 `NOTION_SCHEDULE_DB_ID`
- Jarvis는 `lib/notion/schedule.ts`, Podium은 `lib/notion/podium.ts`
- DB 스키마 변경 시 양쪽 영향
- 일정 등록 2단계 워크플로우: 파싱(parse) → 확인 → 제출(schedule)
- Todo: 우선순위(High/Medium/Low), 카테고리(일상업무/가족/학회/연구/임상)
- **Dashboard 연동**: `components/dashboard/TodayTodo.tsx`, `TodaySurgery.tsx`가 Jarvis 데이터 사용

## 패턴 참조
- NLP 파싱 입력 예시: "3월 15-17일 AANS Annual Meeting, 시카고"
- Todo 입력 예시: "내일까지 OP note 정리 중요"
