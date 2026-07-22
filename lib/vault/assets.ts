import type { TrackedAsset } from "@/lib/types/vault"

export const TRACKED_ASSETS: TrackedAsset[] = [
  {
    symbol: "BTC",
    label: "비트코인",
    category: "crypto",
    geckoId: "bitcoin",
    newsQuery: "Bitcoin OR 비트코인",
  },
  {
    symbol: "ETH",
    label: "이더리움",
    category: "crypto",
    geckoId: "ethereum",
    newsQuery: "Ethereum OR 이더리움",
  },
  {
    symbol: "NASDAQ",
    label: "나스닥",
    category: "stock-us",
    yahooTicker: "^IXIC",
    newsQuery: "NASDAQ 나스닥 지수",
  },
  {
    symbol: "TSLA",
    label: "테슬라",
    category: "stock-us",
    yahooTicker: "TSLA",
    newsQuery: "Tesla TSLA OR 테슬라",
  },
  {
    symbol: "GOOGL",
    label: "구글",
    category: "stock-us",
    yahooTicker: "GOOGL",
    newsQuery: "Google Alphabet GOOGL",
  },
  {
    symbol: "AAPL",
    label: "애플",
    category: "stock-us",
    yahooTicker: "AAPL",
    newsQuery: "Apple AAPL OR 애플 주가",
  },
  {
    symbol: "KOSPI",
    label: "코스피",
    category: "stock-kr",
    yahooTicker: "^KS11",
    newsQuery: "KOSPI 코스피 지수",
  },
  {
    symbol: "005930",
    label: "삼성전자",
    category: "stock-kr",
    yahooTicker: "005930.KS",
    newsQuery: "삼성전자 005930 OR Samsung Electronics",
  },
  {
    symbol: "000660",
    label: "SK하이닉스",
    category: "stock-kr",
    yahooTicker: "000660.KS",
    newsQuery: "SK하이닉스 000660 OR SK hynix",
  },
  {
    symbol: "206650",
    label: "유바이오로직스",
    category: "stock-kr",
    yahooTicker: "206650.KQ",
    newsQuery: "유바이오로직스",
  },
]
