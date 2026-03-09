# AI Radar 개발 컨텍스트

## 역할
13개 AI/의료 뉴스 소스에서 피드를 수집하여 중요도 점수 + 카테고리 분류 + 한글 요약 제공.

## 파일 맵

### 페이지
- `app/agents/radar/page.tsx` — 메인 페이지 ("use client")

### 컴포넌트
- `components/radar/RadarFeed.tsx` — 피드 목록
- `components/radar/FeedCard.tsx` — 개별 피드 카드

### API
- `app/api/ai-feed/route.ts` — 멀티소스 피드 수집/집계 (GET)
- `app/api/ai-feed/summarize/route.ts` — Groq 한글 요약 + 분류 (POST)

### Lib
- `lib/radar/sources.ts` — 소스 설정 (13개 소스, tier, cadence, endpoint)
- `lib/radar/classify.ts` — 중요도 점수 + 카테고리 분류 로직
- `lib/radar/obsidian.ts` — Obsidian YAML frontmatter 내보내기
- `lib/types/radar.ts` — 타입 정의

## 타입 요약
```typescript
type FeedTier = "tier1-daily" | "tier2-weekly" | "tier3-research" | "medical-ai" | "social"
type FeedCategory = "model-release" | "tool" | "research" | "policy" | "medical-ai"
type FeedSource = "tldr-ai" | "the-rundown-ai" | "the-batch" | "import-ai" | "latent-space" | "raschka" | "arxiv" | "hf-daily-papers" | "nature-digital-medicine" | "radiology-ai" | "msr-health" | "x-akhaliq" | "moduletter"
interface FeedItem { id, title, url, source, sourceLabel, tier, cadence, author, date, points, commentUrl, summary, categories[], importanceScore(1-5), notes }
interface RadarSourceConfig { id, label, tier, cadence, intervalHours, mode("rss"|"api"|"html"|"manual"), endpoint, active }
```

## 소스 구성 (13개)

### Tier 1 — Daily (고빈도)
- TLDR AI (6h, RSS)
- The Rundown AI (24h, RSS)

### Tier 2 — Weekly (큐레이션)
- The Batch / Andrew Ng (168h, HTML scrape)
- Import AI (168h, RSS)
- Latent Space (168h, RSS)
- Sebastian Raschka (168h, RSS)
- 모두레터 (168h, HTML scrape)

### Tier 3 — Research (학술)
- arXiv CS.AI+CS.LG (24h, RSS)
- Hugging Face Daily Papers (6h, API)

### Medical AI
- Nature Digital Medicine (168h, RSS)
- Radiology AI (168h, RSS)
- Microsoft Research Health (168h, RSS, filtered)

## 외부 연동
- **RSS/HTML**: 각 소스의 엔드포인트 (공개 URL)
- **Hugging Face API**: Daily Papers
- **arXiv API**: RSS 피드
- **Groq**: Llama 3.3-70b — 한글 요약/분류 (`GROQ_API_KEY`)

## 수정 가능 범위
- `app/agents/radar/`
- `components/radar/`
- `app/api/ai-feed/`
- `lib/radar/`
- `lib/types/radar.ts`

## 읽기 전용
- `lib/notion/client.ts`, `lib/utils.ts`
- `components/ui/`, `components/layout/`

## 독립성
다른 에이전트와 공유 자원 없음. 완전히 독립적으로 개발 가능.

## 주의사항
- 소스 추가: `lib/radar/sources.ts` 배열에 `RadarSourceConfig` 추가
- 중요도 점수(1-5): 소스 tier 가중치 + 제목 키워드 분석 + 카테고리 관련성
- HTML scrape 모드: 사이트 구조 변경 시 파싱 로직 업데이트 필요
- CJK 문자, 베트남어 발음 기호 등 sanitization 적용
- Obsidian 내보내기: YAML frontmatter + 마크다운 포맷
