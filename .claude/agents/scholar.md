# Scholar 개발 컨텍스트

## 역할
척추 관련 저널 논문 검색, 관리, 알림 시스템.
6개 저널(Spine Journal, Spine, J Neurosurg Spine, Neurospine, European Spine J, Global Spine J) 추적.

## 파일 맵

### 페이지
- `app/agents/scholar/page.tsx` — 메인 페이지 ("use client")

### 컴포넌트
- `components/scholar/ArticleList.tsx` — 논문 목록 (무한 스크롤)
- `components/scholar/ArticleDetail.tsx` — 논문 상세
- `components/scholar/ArticleFilter.tsx` — 필터 (관심도, 저널, 카테고리, 읽음, 검색)
- `components/scholar/ArticleSummaryBar.tsx` — 요약 바
- `components/scholar/StatsOverview.tsx` — 통계 대시보드
- `components/scholar/JournalTrend.tsx` — 저널 트렌드

### API
- `app/api/notion/journal/route.ts` — 논문 목록/검색 (GET), 태깅 (POST)
- `app/api/notion/journal/translate/route.ts` — 한글 번역
- `app/api/notion/journal/alert/run/route.ts` — 저널 알림 파이프라인 트리거
- `app/api/ai/chat/route.ts` — Claude 채팅 (agentId: "scholar")

### Lib
- `lib/notion/journal.ts` — Notion Journal DB 쿼리
- `lib/types/journal.ts` — 타입 정의
- `lib/journal-alert/pipeline.ts` — 알림 파이프라인 (PubMed fetch → dedup → Notion push)
- `lib/journal-alert/config.ts` — 알림 설정

## 타입 요약
```typescript
type InterestLevel = "🔴 필독" | "🟡 관심" | "⚪ 참고"
interface JournalArticle { page_id, url, title, authors, journal_name, pub_date, doi_url, abstract, summary, interest, read, keywords[], categories[], pub_type, volume, issue, affiliations }
interface JournalFilter { interest?, journal?, category?, read?, search?, sort?, cursor? }
interface JournalQueryResult { articles[], has_more, next_cursor, total_count? }
interface JournalStats { total, unread, by_interest, by_journal, by_category, recent_week }
```

## 외부 연동
- **Notion DB**: `NOTION_JOURNAL_DB_ID` — 논문 데이터
- **PubMed API**: E-utilities 기반 논문 수집
- **Groq**: Llama 3.3-70b — 한글 요약/번역 (`GROQ_API_KEY`)
- **SMTP**: Gmail — 이메일 알림 (journal-alert)
- **Claude**: 연구 인사이트

## 수정 가능 범위
- `app/agents/scholar/`
- `components/scholar/`
- `app/api/notion/journal/` (하위 전체)
- `lib/notion/journal.ts`
- `lib/types/journal.ts`
- `lib/journal-alert/`

## 읽기 전용
- `lib/notion/client.ts`, `lib/utils.ts`
- `components/ui/`, `components/layout/`

## 주의사항
- journal-alert 파이프라인의 캐시/중복 제거 로직이 복잡 — 신중히 수정
- 커서 기반 페이지네이션 (Notion API 제한)
- 관심도 자동 분류: 🔴(endoscopy, UBE, AI) / 🟡(MIS, stenosis) / ⚪(기타)
