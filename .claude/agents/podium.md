# Podium 개발 컨텍스트

## 역할
학회/컨퍼런스 발표 일정 관리. D-day 카운트다운, 참석 상태, 준비 상태 추적.
(구 Maestro에서 Podium으로 리네이밍됨)

## 파일 맵

### 페이지
- `app/agents/podium/page.tsx` — 메인 페이지 ("use client")

### 컴포넌트
- `components/podium/PresentationList.tsx` — 발표 목록
- `components/podium/PresentationCard.tsx` — 발표 카드 (D-day 포함)

### API
- `app/api/podium/presentations/route.ts` — 발표 목록 조회 (GET)

### Lib
- `lib/notion/podium.ts` — Notion Schedule DB 쿼리 (발표 필터링)
- `lib/types/podium.ts` — 타입 정의
- `lib/utils/dday.ts` — D-day 계산 유틸리티

## 타입 요약
```typescript
type TimeFilter = "past" | "upcoming"
type AttendanceFilter = "all" | "참석" | "불참" | "발표" | "미정"
interface Presentation { page_id, url, name, date_start, date_end, place, category, society[], topic, preparation_status, attendance_type, link, abstract_deadline }
interface PresentationFilter { time?, attendance?, society? }
interface DdayInfo { days: number | null, label, isPast }
```

## 외부 연동
- **Notion DB**: `NOTION_SCHEDULE_DB_ID` — ⚠️ Jarvis와 공유!
  - Podium은 "참석" 필드로 발표 관련 항목만 필터
  - `lib/notion/podium.ts`의 `getScheduleDbId()` 사용

## 수정 가능 범위
- `app/agents/podium/`
- `components/podium/`
- `app/api/podium/`
- `lib/notion/podium.ts`
- `lib/types/podium.ts`
- `lib/utils/dday.ts`

## 읽기 전용
- `lib/notion/schedule.ts` — Jarvis 전용, 절대 수정 금지
- `lib/notion/client.ts`, `lib/utils.ts`
- `components/ui/`, `components/layout/`

## 의존성 주의사항
- **Jarvis와 Schedule DB 공유**: 같은 `NOTION_SCHEDULE_DB_ID` 사용
- Podium은 `lib/notion/podium.ts`로 독립 쿼리, Jarvis는 `lib/notion/schedule.ts` 사용
- DB 스키마(속성명) 변경 시 양쪽 모두 영향
- 참석 select 값: "발표예정", "준비 완료", "참석만", "불참"
- 분류 select: 30개 옵션 (학회, 세미나, 워크숍 등)
- 학회명 multi_select: 80+ 학회 (AANS, NASS, KSSS 등)
