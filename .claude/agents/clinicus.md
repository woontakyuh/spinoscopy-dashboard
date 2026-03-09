# Clinicus 개발 컨텍스트

## 역할
환자 PROM(Patient-Reported Outcome Measures) 데이터 관리 및 임상 의사결정 지원.
VAS, ODI, JOA, NDI, EQ5D 점수를 시점별(pre, 1mo, 3mo, 6mo, 1y)로 추적.

## 파일 맵

### 페이지
- `app/agents/clinicus/page.tsx` — 메인 페이지 ("use client")

### 컴포넌트
- `components/clinicus/PatientSearch.tsx` — 환자 검색
- `components/clinicus/PatientDetail.tsx` — 환자 상세
- `components/clinicus/PromForm.tsx` — PROM 입력 폼
- `components/clinicus/PromDisplay.tsx` — PROM 점수 표시
- `components/clinicus/PromChart.tsx` — PROM 추이 그래프
- `components/clinicus/AnalyticsView.tsx` — 분석 대시보드
- `components/clinicus/NewCaseForm.tsx` — 새 환자 등록
- `components/clinicus/IdeaMemo.tsx` — Claude 아이디어 메모

### API
- `app/api/notion/patients/route.ts` — 환자 CRUD (GET 검색, POST 생성, PATCH PROM 업데이트)
- `app/api/notion/prom/route.ts` — PROM 데이터 전용
- `app/api/notion/analytics/route.ts` — 분석 데이터
- `app/api/ai/chat/route.ts` — Claude 채팅 (agentId: "clinicus")
- `app/api/ai/format-memo/route.ts` — 메모 포맷팅

### Lib
- `lib/notion/patients.ts` — Notion Patient DB 쿼리
- `lib/notion/analytics.ts` — 분석 쿼리
- `lib/types/patient.ts` — 타입 정의 (PatientSearchResult, PatientDetail, PromScores, NewCaseInput)
- `lib/prom/calculator.ts` — PROM 계산 로직
- `lib/ai/formatMemo.ts` — 메모 AI 포맷

## 타입 요약
```typescript
type Timepoint = "pre" | "1mo" | "3mo" | "6mo" | "1y"
interface PromScores { vas?, odi?, joa?, ndi?, eq5d? }
interface PatientSearchResult { page_id, url, name, pt_no, age, sex, op_date, op_name, hospital[] }
interface PatientDetail extends PatientSearchResult { prom, class_a[], class_b[], level, op_category[], landmark[], preop_dx, surgeon[] }
```

## 외부 연동
- **Notion DB**: `NOTION_PATIENT_DB_ID` — 환자 데이터
- **Claude**: Sonnet 4.5 via `@ai-sdk/anthropic` — 임상 인사이트, 아이디어 메모
- **System Prompt**: 척추 신경외과, UBE 전문 임상 어시스턴트 (한글 응답)

## 수정 가능 범위
- `app/agents/clinicus/`
- `components/clinicus/`
- `app/api/notion/patients/`
- `app/api/notion/prom/`
- `app/api/notion/analytics/`
- `lib/notion/patients.ts`
- `lib/notion/analytics.ts`
- `lib/types/patient.ts`
- `lib/prom/calculator.ts`
- `lib/ai/formatMemo.ts`

## 읽기 전용
- `lib/notion/client.ts`, `lib/utils.ts`
- `components/ui/`, `components/layout/`
- `app/api/ai/chat/route.ts` (공용 — Clinicus system prompt 수정 필요시 여기)

## 주의사항
- PROM 점수 범위 검증 필수 (VAS 0-10, ODI 0-100% 등)
- 의학용어는 영문 병기: "추간판 탈출증 (disc herniation)"
- 환자 데이터 다루므로 보안 주의
