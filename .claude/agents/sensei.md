# Sensei 개발 컨텍스트

## 역할
브라질리안 주짓수(BJJ) 훈련 세션 기록. 자연어 입력 → Claude가 자동 태그 추출 → Notion DB 저장.

## 파일 맵

### 페이지
- `app/agents/sensei/page.tsx` — 메인 페이지 ("use client")

### 컴포넌트
- `components/sensei/SenseiCalendar.tsx` — 캘린더 뷰

### API
- `app/api/notion/sensei/route.ts` — 세션 목록(GET) + 생성(POST)
- `app/api/notion/sensei/migrate-tags/route.ts` — 태그 마이그레이션 유틸

### Lib
- `lib/notion/sensei.ts` — Notion Sensei DB 쿼리 (createSenseiEntry, listSenseiEntries, fetchTagOptions)
- `lib/ai/formatBjjNote.ts` — Claude 기반 BJJ 노트 구조화
- `lib/ai/bjjTags.ts` — BJJ 태그 사전 (94+ 약어)
- `lib/types/sensei.ts` — 타입 정의

## 타입 요약
```typescript
type SenseiSessionType = "class" | "openmat"
interface SenseiEntry { id, title, sessionType, date, instructor, gym, classTags[], sparringTags[], note, url }
interface StructuredBjjNote { title, sessionType, date, instructor, gym, classTags[], sparringTags[], note }
```

## BJJ 태그 카테고리
- **Guard**: HG, DLR, RDLR, XG, BG, CG 등
- **Submissions**: RNC, ANC, D'Arc, Guill, IHH 등
- **Top Positions**: Mount, S-Mount, Side, Back
- **Takedowns**: TD, SL, DL, BL
- **Sweeps**: BS, TP, SP
- **Leg Locks**: HL, KL, AL, CL
- **Format**: Gi, NoGi

## 외부 연동
- **Notion DB**: `NOTION_SENSEI_DB_ID` — 훈련 기록
- **Claude**: Sonnet 4.5 — 자연어 → 구조화 태깅

## 수정 가능 범위
- `app/agents/sensei/`
- `components/sensei/`
- `app/api/notion/sensei/`
- `lib/notion/sensei.ts`
- `lib/ai/formatBjjNote.ts`
- `lib/ai/bjjTags.ts`
- `lib/types/sensei.ts`

## 읽기 전용
- `lib/notion/client.ts`, `lib/utils.ts`
- `components/ui/`, `components/layout/`

## 독립성
다른 에이전트와 공유 자원 없음. 완전히 독립적으로 개발 가능.

## API 패턴 참조
`app/api/notion/sensei/route.ts`는 이 프로젝트의 **표준 API route 패턴**:
- GET: `listSenseiEntries()` → JSON
- POST: body 파싱 → `buildRawInput()` → `formatBjjNote()` (AI) → `createSenseiEntry()` (Notion)

## 주의사항
- 입력 형식: `[수업] ...` 또는 `[스파링] ...` 또는 자유 입력
- Claude가 태그 추출 시 `bjjTags.ts` 사전 참조
- 날짜 포맷: YYYY-MM-DD
