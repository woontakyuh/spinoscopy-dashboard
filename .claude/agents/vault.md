# Vault 개발 컨텍스트

## 역할
암호화폐, 미국 주식, 한국 주식의 실시간 가격 추적 및 관련 뉴스 집계.

## 파일 맵

### 페이지
- `app/agents/vault/page.tsx` — 메인 페이지 ("use client")

### 컴포넌트
- `components/vault/VaultDashboard.tsx` — 대시보드 레이아웃
- `components/vault/AssetCard.tsx` — 개별 자산 카드
- `components/vault/CandlestickSparkline.tsx` — 캔들스틱 차트 (lightweight-charts)

### API
- `app/api/vault/prices/route.ts` — 자산 가격 조회 (GET)
- `app/api/vault/news/route.ts` — 자산별 뉴스 (GET)

### Lib
- `lib/vault/assets.ts` — 추적 자산 목록 설정
- `lib/types/vault.ts` — 타입 정의

## 타입 요약
```typescript
type AssetCategory = "crypto" | "stock-us" | "stock-kr"
interface TrackedAsset { symbol, label, category, geckoId?, yahooTicker?, newsQuery }
interface AssetPrice { symbol, label, category, price, change24h, currency, sparkline: OHLCBar[] }
interface OHLCBar { time, open, high, low, close }
interface VaultNewsItem { id, title, url, source, date, asset }
```

## 추적 자산
- **Crypto**: BTC (비트코인), ETH (이더리움) — CoinGecko API
- **US Stocks**: TSLA, GOOGL, AAPL — Yahoo Finance API
- **KR Stocks**: 206650 (유바이오로직스) — Yahoo Finance KQ

## 외부 연동
- **CoinGecko API**: 암호화폐 가격/스파크라인 (API 키 불필요)
- **Yahoo Finance**: 주식 가격/OHLC (비공식 API)
- **Google News RSS**: 자산별 뉴스 수집

## 수정 가능 범위
- `app/agents/vault/`
- `components/vault/`
- `app/api/vault/`
- `lib/vault/assets.ts`
- `lib/types/vault.ts`

## 읽기 전용
- `lib/notion/client.ts`, `lib/utils.ts`
- `components/ui/`, `components/layout/`

## 독립성
다른 에이전트와 공유 자원 없음. 완전히 독립적으로 개발 가능.

## 주의사항
- CoinGecko 무료 API rate limit 주의
- Yahoo Finance 비공식 API — 구조 변경 가능성
- `lightweight-charts` v5 사용 (TradingView 기반 캔들스틱)
- 새 자산 추가: `lib/vault/assets.ts`의 배열에 추가하면 자동 반영
