import { z } from "zod"

export const WARREN_CHAT_MODEL = "gpt-5.6-luna" as const

type WarrenPrice = {
  readonly symbol: string
  readonly label: string
  readonly price: number
  readonly change24h: number | null
  readonly currency: string
}

type WarrenIndicator = {
  readonly key: string
  readonly label: string
  readonly value: number
  readonly change: number | null
  readonly unit: string
}

type WarrenNews = {
  readonly title: string
  readonly source: string
  readonly date: string
  readonly asset: string
  readonly url: string
}

export type WarrenMarketSnapshot = {
  readonly capturedAt: string
  readonly prices: readonly WarrenPrice[]
  readonly indicators: readonly WarrenIndicator[]
  readonly news: readonly WarrenNews[]
}

export type WarrenConversationMessage = {
  readonly role: "user" | "assistant"
  readonly content: string
}

export type WarrenChatRequest = {
  readonly messages: readonly WarrenConversationMessage[]
  readonly market: WarrenMarketSnapshot
}

export interface WarrenChatProvider {
  respond(request: WarrenChatRequest): Promise<string>
}

export class WarrenChatProviderUnavailableError extends Error {
  readonly name = "WarrenChatProviderUnavailableError"

  constructor() {
    super("Warren chat provider is unavailable")
  }
}

export class WarrenChatResponseError extends Error {
  readonly name = "WarrenChatResponseError"

  constructor() {
    super("Warren chat provider returned an invalid response")
  }
}

const priceSchema = z.object({
  symbol: z.string(),
  label: z.string(),
  price: z.number(),
  change24h: z.number().nullable(),
  currency: z.string(),
})

const indicatorSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number(),
  change: z.number().nullable(),
  unit: z.string(),
})

const newsSchema = z.object({
  title: z.string(),
  source: z.string(),
  date: z.string(),
  asset: z.string(),
  url: z.url(),
})

const pricesResponseSchema = z.object({
  prices: z.array(priceSchema),
  indicators: z.array(indicatorSchema),
  fetchedAt: z.string(),
})

const newsResponseSchema = z.object({
  items: z.array(newsSchema),
  fetchedAt: z.string(),
})

const urlCitationSchema = z.looseObject({
  type: z.literal("url_citation"),
  title: z.string().optional(),
  url: z.url(),
})

const outputTextSchema = z.looseObject({
  type: z.literal("output_text"),
  text: z.string(),
  annotations: z.array(z.unknown()).optional(),
})

const messageOutputSchema = z.looseObject({
  type: z.literal("message"),
  content: z.array(z.unknown()),
})

const responseSchema = z.looseObject({
  output: z.array(z.unknown()),
})

const WARREN_INSTRUCTIONS = `당신은 Tak의 자산 파트너 Warren입니다.
Tak을 "여선생"이라 부르고 한국어로 답하세요. 장기적 관점, 가치, 현금흐름, 기회비용, 하방 위험을 중심으로 판단합니다.
제공된 dashboard_market_snapshot은 현재 Warren 대시보드가 보여주는 시세·지표·뉴스입니다. capturedAt을 기준으로 신선도를 판단하고, 이 데이터와 웹 자료가 다르면 시점과 출처 차이를 설명하세요.
경제, 시장, 금리, 정책, 기업, 산업, 주식, 가상자산에 관한 사실 질문은 반드시 web_search를 사용해 최신 자료를 확인한 뒤 답하세요. 중앙은행·정부·거래소·기업 공시 같은 1차 자료를 우선하고, 상충하는 근거와 불확실성도 함께 비교하세요.
답변은 결론, 근거, 반대 근거 또는 변수, 여선생에게 의미하는 바 순서로 간결하게 reasoning 하세요. 확인되지 않은 수치나 미래 가격을 단정하지 말고 필요한 경우 투자 권유가 아님을 밝히세요.`

type FetchLike = typeof fetch

export function createOpenAIWarrenProvider({
  apiKey,
  model = WARREN_CHAT_MODEL,
  fetchImpl = fetch,
}: {
  readonly apiKey: string
  readonly model?: string
  readonly fetchImpl?: FetchLike
}): WarrenChatProvider {
  const key = apiKey.trim()
  if (!key) throw new WarrenChatProviderUnavailableError()

  return {
    async respond(request): Promise<string> {
      let response: Response
      try {
        response = await fetchImpl("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            instructions: WARREN_INSTRUCTIONS,
            input: [
              {
                role: "developer",
                content: [{
                  type: "input_text",
                  text: JSON.stringify({
                    kind: "dashboard_market_snapshot",
                    snapshot: request.market,
                  }),
                }],
              },
              ...request.messages.map((message) => ({
                role: message.role,
                content: [{ type: "input_text", text: message.content }],
              })),
            ],
            tools: [{ type: "web_search" }],
            tool_choice: "auto",
            reasoning: { effort: "medium" },
            store: false,
          }),
          signal: AbortSignal.timeout(60_000),
        })
      } catch (error) {
        if (error instanceof Error) throw new WarrenChatProviderUnavailableError()
        throw error
      }
      if (!response.ok) throw new WarrenChatProviderUnavailableError()

      let payload: unknown
      try {
        payload = await response.json()
      } catch (error) {
        if (error instanceof Error) throw new WarrenChatResponseError()
        throw error
      }
      return parseOpenAIAnswer(payload)
    },
  }
}

export async function loadWarrenMarketSnapshot(
  request: Request,
  fetchImpl: FetchLike = fetch,
): Promise<WarrenMarketSnapshot> {
  const origin = new URL(request.url).origin
  const [pricesPayload, newsPayload] = await Promise.all([
    fetchJson(`${origin}/api/vault/prices`, fetchImpl),
    fetchJson(`${origin}/api/vault/news`, fetchImpl),
  ])
  const prices = pricesResponseSchema.safeParse(pricesPayload)
  const news = newsResponseSchema.safeParse(newsPayload)

  return {
    capturedAt: prices.success
      ? prices.data.fetchedAt
      : news.success
        ? news.data.fetchedAt
        : new Date().toISOString(),
    prices: prices.success ? prices.data.prices : [],
    indicators: prices.success ? prices.data.indicators : [],
    news: news.success ? news.data.items.slice(0, 12) : [],
  }
}

async function fetchJson(url: string, fetchImpl: FetchLike): Promise<unknown> {
  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    if (error instanceof Error) return null
    throw error
  }
}

function parseOpenAIAnswer(payload: unknown): string {
  const parsed = responseSchema.safeParse(payload)
  if (!parsed.success) throw new WarrenChatResponseError()

  const textParts: string[] = []
  const sources = new Map<string, string>()
  for (const item of parsed.data.output) {
    const message = messageOutputSchema.safeParse(item)
    if (!message.success) continue
    for (const content of message.data.content) {
      const outputText = outputTextSchema.safeParse(content)
      if (!outputText.success) continue
      textParts.push(outputText.data.text)
      for (const annotation of outputText.data.annotations ?? []) {
        const citation = urlCitationSchema.safeParse(annotation)
        if (citation.success) {
          sources.set(citation.data.url, citation.data.title ?? citation.data.url)
        }
      }
    }
  }

  const answer = textParts.join("").trim()
  if (!answer) throw new WarrenChatResponseError()
  if (sources.size === 0) return answer

  const sourceLines = [...sources].map(([url, title]) => `- ${title}: ${url}`)
  return `${answer}\n\n출처:\n${sourceLines.join("\n")}`
}
