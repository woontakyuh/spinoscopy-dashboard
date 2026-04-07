# AI Radar 개발 컨텍스트

## 역할
22개 AI/의료 뉴스 소스에서 피드를 수집하여 중요도 점수 + 카테고리 분류 + 한글 요약 제공.

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
- `lib/radar/sources.ts` — 소스 설정 (22개 소스, tier, cadence, endpoint)
- `lib/radar/classify.ts` — 중요도 점수 + 카테고리 분류 로직
- `lib/radar/obsidian.ts` — Obsidian YAML frontmatter 내보내기
- `lib/types/radar.ts` — 타입 정의

## 타입 요약
```typescript
type FeedTier = "ai-company" | "thought-leader" | "newsletter"
type FeedCategory = "model-release" | "tool" | "research" | "policy" | "medical-ai" | "opinion"
type FeedSource = "tldr-ai" | "the-rundown-ai" | "the-batch" | "import-ai" | "latent-space" | "raschka" | "arxiv" | "hf-daily-papers" | "nature-digital-medicine" | "radiology-ai" | "msr-health" | "x-akhaliq" | "moduletter" | "openai-blog" | "deepmind-blog" | "google-ai-blog" | "karpathy-blog" | "dwarkesh-podcast" | "anthropic-engineering" | "anthropic-research" | "karpathy-youtube" | "lex-fridman-ai"
interface FeedItem { id, title, url, source, sourceLabel, tier, cadence, author, date, points, commentUrl, summary, categories[], importanceScore(1-5), notes }
interface RadarSourceConfig { id, label, tier, cadence, intervalHours, mode("rss"|"api"|"html"|"manual"|"youtube"|"rss+filter"|"atom"), endpoint, active }
```

## 소스 구성 (22개, 3개 티어)

### AI Company (주요 트래킹) — AI 기업 공식 채널
- OpenAI Blog (RSS)
- Anthropic Engineering / Research (HTML scrape)
- Google DeepMind (RSS)
- Google AI Blog (RSS)
- The Batch / Andrew Ng (HTML scrape)
- 모두레터 (HTML scrape)

### Thought Leader (주요 트래킹) — 오피니언 리더 / 팟캐스트
- Andrej Karpathy Blog (Atom RSS)
- Karpathy YouTube (현재 비활성)
- Dwarkesh Podcast (RSS)
- Lex Fridman AI (RSS + AI 키워드 필터)
- Latent Space (RSS)
- Sebastian Raschka (RSS)
- Import AI (RSS)

### Newsletter (지엽적 트래킹) — 뉴스레터 / 학술 / 의료
- TLDR AI (RSS)
- The Rundown AI (RSS)
- arXiv CS.AI+CS.LG (RSS)
- Hugging Face Daily Papers (API)
- Nature Digital Medicine (RSS)
- Radiology AI (RSS)
- Microsoft Research Health (RSS, filtered)

## 외부 연동
- **RSS/HTML**: 각 소스의 엔드포인트 (공개 URL)
- **Atom RSS**: Karpathy Blog (bearblog), YouTube channel feeds
- **YouTube Atom**: `youtube.com/feeds/videos.xml?channel_id=...` — Atom 형식 (`<entry>`)
- **RSS+filter**: Lex Fridman — 전체 에피소드에서 AI 관련만 필터
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
