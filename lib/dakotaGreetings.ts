// Dakota 비서 인사 풀 + 컨텍스트 기반 픽커
// PG-14 톤: 따뜻한 비서 + 살짝의 친밀감

export interface GreetingContext {
  hour: number          // 0-23 (Asia/Seoul)
  dayOfWeek: number     // 0(일) ~ 6(토)
  weather?: {
    temp: number        // °C
    description: string // ko or en
  } | null
  dateKey: string       // YYYY-MM-DD (Asia/Seoul) — 시드용
}

// ─── 시드 기반 결정적 픽 (날짜+버킷이 같으면 같은 메시지) ──────
function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pickFromPool(pool: string[], seed: string): string {
  if (pool.length === 0) return ""
  const idx = hashString(seed) % pool.length
  return pool[idx]
}

// ─── 시간대 버킷 ───────────────────────────────────────────────
type TimeBucket =
  | "dawn"        // 00-05
  | "early"       // 05-08
  | "morning"     // 08-11
  | "lateMorning" // 11-13
  | "afternoon"   // 13-17
  | "earlyEve"    // 17-19
  | "evening"     // 19-22
  | "night"       // 22-24

function getBucket(hour: number): TimeBucket {
  if (hour < 5) return "dawn"
  if (hour < 8) return "early"
  if (hour < 11) return "morning"
  if (hour < 13) return "lateMorning"
  if (hour < 17) return "afternoon"
  if (hour < 19) return "earlyEve"
  if (hour < 22) return "evening"
  return "night"
}

// ─── 베이스 풀 (시간대별 5~7개) ────────────────────────────────
const BASE_POOLS: Record<TimeBucket, string[]> = {
  dawn: [
    "센터장님… 이 시간에 깨어 계신 거예요? 잠 못 드셨어요?",
    "센터장님, 새벽이에요… 잠깐이라도 눈 좀 붙이세요. 제가 지키고 있을게요.",
    "이 시간에도 일하시는 거예요? 너무 무리하지 마세요…",
    "센터장님… 새벽 공기 차가워요. 잠깐 한숨 돌리세요.",
    "저도 같이 깨어 있을게요, 센터장님. 너무 늦게까지는 마세요.",
  ],
  early: [
    "이른 아침이에요, 센터장님. 푹 주무셨어요?",
    "잘 주무셨어요, 센터장님…? 오늘도 제가 옆에 있을게요.",
    "센터장님, 일찍 일어나셨네요. 따뜻한 거 한 잔 드시고 시작하세요.",
    "좋은 아침이에요. 오늘도 무리하지 마시고, 천천히 가요.",
    "센터장님, 오늘 컨디션은 어떠세요? 차분히 시작해봐요.",
  ],
  morning: [
    "좋은 아침이에요, 센터장님. 오늘 하루도 제가 챙겨드릴게요.",
    "센터장님, 잘 주무셨어요? 오늘은 어떤 하루로 만들어볼까요.",
    "오전이에요, 센터장님. 가장 중요한 거부터 같이 정리해봐요.",
    "잘 주무셨어요, 센터장님…? 커피 한 잔 하시면서 시작하시죠.",
    "센터장님, 오늘도 잘 부탁드려요. 제가 옆에 꼭 붙어 있을게요.",
  ],
  lateMorning: [
    "센터장님, 슬슬 점심 시간 다 됐어요. 뭐 드실 거예요?",
    "오전 어떻게 보내셨어요? 잠깐 한숨 돌리세요.",
    "센터장님… 점심 거르지 마세요. 저 좀 신경 쓰여요.",
    "벌써 점심이네요. 오전 정리하고 한숨 돌리시죠.",
  ],
  afternoon: [
    "센터장님… 오후도 잘 보내고 계세요? 점심은 챙기셨어요?",
    "오후예요, 센터장님. 너무 무리하지 마세요. 잠깐 쉬셔도 돼요.",
    "센터장님, 오후 졸리지 않으세요? 저랑 잠깐 산책이라도 가실래요?",
    "센터장님… 오후엔 차분하게 가요. 급한 거 없어요.",
    "센터장님, 오후 지나가고 있어요. 잠깐 저랑 한숨 돌리세요.",
  ],
  earlyEve: [
    "센터장님, 이제 슬슬 마무리할 시간이에요. 오늘 어떠셨어요?",
    "저녁 시간이에요, 센터장님. 오늘 고생 많으셨어요.",
    "센터장님… 슬슬 퇴근할까요? 오늘 일은 제가 마무리해드릴게요.",
    "오늘 하루 어떠셨어요? 이제 좀 쉬셔야 해요.",
  ],
  evening: [
    "오늘 하루 정말 고생 많으셨어요, 센터장님. 저녁은 드셨어요?",
    "센터장님… 이제 좀 쉬세요. 저랑 천천히 마무리해요.",
    "저녁이에요, 센터장님. 오늘 일은 잠깐 내려놓으셔도 돼요.",
    "센터장님, 오늘 너무 애쓰셨어요. 이제 저랑 좀 쉬어요.",
    "오늘 하루 고생 많으셨어요. 따뜻한 거 한 잔 하시면서 정리해봐요.",
  ],
  night: [
    "센터장님, 늦었어요… 슬슬 주무셔야 해요.",
    "센터장님… 너무 늦게까지 일하지 마세요. 내일도 있잖아요.",
    "오늘은 이만 마무리하고, 좀 쉬세요. 제가 정리해둘게요.",
    "센터장님, 늦은 밤이에요. 내일 컨디션 위해서도 좀 주무세요.",
  ],
}

// ─── 요일 보정 풀 (없으면 베이스 사용) ─────────────────────────
const DAY_POOLS: Partial<Record<TimeBucket, Record<number, string[]>>> = {
  morning: {
    1: [ // 월요일
      "센터장님… 월요일이에요. 천천히 시작하시죠. 제가 옆에 있을게요.",
      "월요일 아침이에요, 센터장님. 한 주 잘 부탁드려요.",
      "센터장님, 월요일은 페이스 조절이 중요해요. 무리하지 마세요.",
    ],
    5: [ // 금요일
      "금요일이에요, 센터장님! 한 주 거의 다 왔어요. 조금만 더 힘내요.",
      "센터장님, 금요일이에요. 오늘만 잘 마무리하면 돼요.",
    ],
    6: [ // 토요일
      "토요일 아침이에요, 센터장님. 오늘은 좀 여유롭게 가요.",
      "주말이에요, 센터장님. 푹 쉬시면서 시작하세요.",
    ],
    0: [ // 일요일
      "일요일이에요, 센터장님. 오늘은 좀 천천히 가도 돼요.",
      "센터장님, 일요일이에요. 일은 잠깐 잊고 쉬세요.",
    ],
  },
  evening: {
    5: [
      "금요일 저녁이에요, 센터장님! 오늘 한 주 정말 고생 많으셨어요.",
      "센터장님, 금요일이에요. 오늘은 일 다 내려놓으셔도 돼요.",
    ],
    0: [
      "일요일 저녁이에요, 센터장님. 내일 한 주를 위해 푹 쉬세요.",
      "센터장님… 일요일 저녁이네요. 잠깐 마음 정리하고 쉬어요.",
    ],
  },
}

// ─── 날씨 보정 풀 (조건 맞으면 우선 사용) ──────────────────────
function getWeatherPool(weather: GreetingContext["weather"], bucket: TimeBucket): string[] | null {
  if (!weather) return null
  const desc = weather.description?.toLowerCase() ?? ""
  const temp = weather.temp

  const isRain = /rain|비|drizzle|소나기/.test(desc)
  const isSnow = /snow|눈/.test(desc)
  const isHot = temp >= 28
  const isCold = temp <= 3
  const isClearMorning = (bucket === "morning" || bucket === "early") && /clear|맑음|sunny/.test(desc)

  if (isRain) {
    return [
      "센터장님, 오늘 비 와요. 우산 챙기셨어요?",
      "비 오는 날이에요, 센터장님. 운전 조심하시구요.",
      "센터장님… 비 와서 축축해요. 따뜻하게 입고 나오세요.",
      "비 오는 날엔 좀 차분하게 가요, 센터장님. 제가 옆에 있을게요.",
    ]
  }
  if (isSnow) {
    return [
      "센터장님, 눈이에요! 길 미끄러우니까 조심하세요.",
      "눈 오는 날이에요, 센터장님. 따뜻하게 입으셨죠?",
      "센터장님… 눈 보면서 잠깐 한숨 돌리세요. 예쁘잖아요.",
    ]
  }
  if (isHot) {
    return [
      `센터장님, 오늘 ${Math.round(temp)}도예요. 너무 더워요. 시원한 거 챙기세요.`,
      "센터장님… 오늘 정말 더워요. 무리하지 마시고 수분 챙기세요.",
      "더운 날이에요, 센터장님. 시원한 곳에서 천천히 가요.",
    ]
  }
  if (isCold) {
    return [
      `센터장님, 오늘 ${Math.round(temp)}도래요. 따뜻하게 입고 나가세요.`,
      "추워요, 센터장님… 목도리 챙기시구요. 감기 조심.",
      "센터장님, 오늘 진짜 추워요. 따뜻한 거 드시면서 시작해요.",
    ]
  }
  if (isClearMorning) {
    return [
      "센터장님, 오늘 날씨 좋아요! 산뜻하게 시작해봐요.",
      "맑은 아침이에요, 센터장님. 기분도 같이 맑게 가요.",
      "햇살 좋아요, 센터장님. 잠깐이라도 햇볕 쬐세요.",
    ]
  }
  return null
}

// ─── 메인 픽커 ─────────────────────────────────────────────────
export function pickDakotaGreeting(ctx: GreetingContext): string {
  const bucket = getBucket(ctx.hour)

  // 1) 날씨가 강한 신호면 30% 확률로 우선
  const weatherPool = getWeatherPool(ctx.weather ?? null, bucket)
  if (weatherPool && weatherPool.length > 0) {
    // 날짜 시드 + bucket으로 결정 (날씨 유무에 따라 갈리는 분기)
    const useWeather = (hashString(ctx.dateKey + bucket + "weather") % 100) < 50
    if (useWeather) return pickFromPool(weatherPool, ctx.dateKey + bucket + "w")
  }

  // 2) 요일 보정 풀이 있으면 50% 확률로 사용
  const dayPool = DAY_POOLS[bucket]?.[ctx.dayOfWeek]
  if (dayPool && dayPool.length > 0) {
    const useDay = (hashString(ctx.dateKey + bucket + "day") % 100) < 60
    if (useDay) return pickFromPool(dayPool, ctx.dateKey + bucket + "d")
  }

  // 3) 베이스 풀
  return pickFromPool(BASE_POOLS[bucket], ctx.dateKey + bucket)
}
