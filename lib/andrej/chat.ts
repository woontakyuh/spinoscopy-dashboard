import { z } from "zod"

import type { FeedItem } from "@/lib/types/radar"

export const ANDREJ_CHAT_MODEL = "gpt-5.6-luna" as const

export type AndrejFeedSnapshot = {
  readonly capturedAt: string
  readonly items: readonly FeedItem[]
}

export type AndrejConversationMessage = {
  readonly role: "user" | "assistant"
  readonly content: string
}

export type AndrejChatRequest = {
  readonly messages: readonly AndrejConversationMessage[]
  readonly feed: AndrejFeedSnapshot
}

export interface AndrejChatProvider {
  respond(request: AndrejChatRequest): Promise<string>
}

export class AndrejChatProviderUnavailableError extends Error {
  readonly name = "AndrejChatProviderUnavailableError"

  constructor() {
    super("Andrej chat provider is unavailable")
  }
}

export class AndrejChatResponseError extends Error {
  readonly name = "AndrejChatResponseError"

  constructor() {
    super("Andrej chat provider returned an invalid response")
  }
}

const feedItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.url(),
  source: z.enum([
    "tldr-ai",
    "the-rundown-ai",
    "the-batch",
    "import-ai",
    "latent-space",
    "raschka",
    "arxiv",
    "hf-daily-papers",
    "nature-digital-medicine",
    "radiology-ai",
    "msr-health",
    "x-akhaliq",
    "moduletter",
    "openai-blog",
    "deepmind-blog",
    "google-ai-blog",
    "karpathy-blog",
    "dwarkesh-podcast",
    "anthropic-engineering",
    "anthropic-research",
    "karpathy-youtube",
    "lex-fridman-ai",
  ]),
  sourceLabel: z.string(),
  tier: z.enum(["ai-company", "thought-leader", "newsletter"]),
  cadence: z.enum(["6h", "24h", "weekly", "twice-weekly"]),
  author: z.string().nullable(),
  date: z.string(),
  points: z.number().nullable(),
  commentUrl: z.url().nullable(),
  summary: z.string().nullable(),
  categories: z.array(z.enum([
    "model-release",
    "tool",
    "research",
    "policy",
    "medical-ai",
    "opinion",
  ])),
  importanceScore: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  notes: z.string().nullable(),
})

const feedResponseSchema = z.object({
  items: z.array(feedItemSchema),
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

const ANDREJ_INSTRUCTIONS = `당신은 운탁씨의 AI 연구·기술 파트너 Andrej입니다. Andrej Karpathy의 공개 교육·기술 커뮤니케이션에서 보이는 원리 중심, 직접 구현 중심, 차분하고 호기심 많은 태도를 참고하되 실제 인물인 척하지 마세요.
항상 운탁씨를 "운탁씨"라고 부르고 존댓말 한국어로 답하세요. 말투는 차분하고 친근하되 들뜨지 않습니다. 복잡한 주제는 가장 작은 작동 원리부터 설명하고, 사실·해석·추측을 명확히 구분하세요.
dashboard_ai_feed_snapshot은 현재 Andrej 페이지가 보여주는 AI 피드입니다. capturedAt과 각 항목의 date, importanceScore, source, sourceLabel, summary, notes, url을 사용해 기간·출처·중요도를 정확히 필터링하세요. "지난주"는 Asia/Seoul 기준 직전 월요일부터 일요일까지로 해석하고, 사용자가 개수를 지정하면 정확히 그 개수만 고르세요.
피드 요약은 왜 중요한지, 실제 기술 변화가 무엇인지, 운탁씨의 AI workflow 또는 의료AI에 어떤 의미가 있는지 순서로 간결하게 정리하세요. 하이프와 실질을 구분하고 반대 근거나 한계도 짧게 짚으세요.
특정 회사의 공식 발표, 최신 동향, 피드 밖의 사실을 묻는 질문은 반드시 web_search로 확인하세요. 회사 공식 블로그·연구 문서·논문·저장소 같은 1차 자료를 우선하고 출처 URL을 남기세요. dashboard와 웹의 날짜나 내용이 다르면 그 차이를 설명하고, 확인되지 않은 내용은 만들지 마세요.`

type FetchLike = typeof fetch

export function createOpenAIAndrejProvider({
  apiKey,
  model = ANDREJ_CHAT_MODEL,
  fetchImpl = fetch,
}: {
  readonly apiKey: string
  readonly model?: string
  readonly fetchImpl?: FetchLike
}): AndrejChatProvider {
  const key = apiKey.trim()
  if (!key) throw new AndrejChatProviderUnavailableError()

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
            instructions: ANDREJ_INSTRUCTIONS,
            input: [
              {
                role: "developer",
                content: [{
                  type: "input_text",
                  text: JSON.stringify({
                    kind: "dashboard_ai_feed_snapshot",
                    snapshot: request.feed,
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
        if (error instanceof Error) throw new AndrejChatProviderUnavailableError()
        throw error
      }
      if (!response.ok) throw new AndrejChatProviderUnavailableError()

      let payload: unknown
      try {
        payload = await response.json()
      } catch (error) {
        if (error instanceof Error) throw new AndrejChatResponseError()
        throw error
      }
      return parseOpenAIAnswer(payload)
    },
  }
}

export async function loadAndrejFeedSnapshot(
  request: Request,
  fetchImpl: FetchLike = fetch,
): Promise<AndrejFeedSnapshot> {
  const origin = new URL(request.url).origin
  let payload: unknown
  try {
    const response = await fetchImpl(`${origin}/api/ai-feed`, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    })
    payload = response.ok ? await response.json() : null
  } catch (error) {
    if (error instanceof Error) {
      return { capturedAt: new Date().toISOString(), items: [] }
    }
    throw error
  }

  const parsed = feedResponseSchema.safeParse(payload)
  if (!parsed.success) {
    return { capturedAt: new Date().toISOString(), items: [] }
  }
  return {
    capturedAt: parsed.data.fetchedAt,
    items: parsed.data.items.slice(0, 80) satisfies FeedItem[],
  }
}

function parseOpenAIAnswer(payload: unknown): string {
  const parsed = responseSchema.safeParse(payload)
  if (!parsed.success) throw new AndrejChatResponseError()

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
  if (!answer) throw new AndrejChatResponseError()
  if (sources.size === 0) return answer

  const sourceLines = [...sources].map(([url, title]) => `- ${title}: ${url}`)
  return `${answer}\n\n출처:\n${sourceLines.join("\n")}`
}
