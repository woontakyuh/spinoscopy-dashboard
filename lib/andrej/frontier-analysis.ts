import { z } from "zod"

import type {
  AiFrontierEpisodeAnalysis,
  AiFrontierOfficialEpisode,
} from "@/lib/types/ai-frontier-import"

const ANALYSIS_MODEL = "gpt-5.6-luna"

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

interface AnalysisDependencies {
  apiKey: string
  fetchImpl?: FetchLike
  model?: string
}

const conceptSchema = z.object({
  term: z.string().trim().min(1).max(100),
  korean: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(60),
  oneLine: z.string().trim().min(1).max(500),
  intuition: z.string().trim().min(1).max(700),
  whyItMatters: z.string().trim().min(1).max(700),
})

const analysisSchema = z.object({
  summary: z.string().trim().min(1).max(700),
  topics: z.array(z.string().trim().min(1).max(60)).min(1).max(10),
  models: z.array(z.string().trim().min(1).max(60)).max(10),
  people: z.array(z.string().trim().min(1).max(80)).max(12),
  concepts: z.array(conceptSchema).min(3).max(12),
  keyPoints: z.array(z.object({
    heading: z.string().trim().min(1).max(160),
    bullets: z.array(z.string().trim().min(1).max(700)).min(1).max(6),
  })).min(3).max(12),
  insights: z.array(z.string().trim().min(1).max(700)).min(2).max(10),
  mentalModels: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
  factInterpretation: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
  questions: z.array(z.string().trim().min(1).max(500)).min(2).max(8),
})

const textOutputSchema = z.object({
  output: z.array(z.looseObject({
    content: z.array(z.looseObject({
      type: z.string(),
      text: z.string().optional(),
    })).optional(),
  })),
})

const stringArray = { type: "array", items: { type: "string" } } as const
const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary", "topics", "models", "people", "concepts", "keyPoints",
    "insights", "mentalModels", "factInterpretation", "questions",
  ],
  properties: {
    summary: { type: "string" },
    topics: stringArray,
    models: stringArray,
    people: stringArray,
    concepts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["term", "korean", "category", "oneLine", "intuition", "whyItMatters"],
        properties: {
          term: { type: "string" },
          korean: { type: "string" },
          category: { type: "string" },
          oneLine: { type: "string" },
          intuition: { type: "string" },
          whyItMatters: { type: "string" },
        },
      },
    },
    keyPoints: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "bullets"],
        properties: {
          heading: { type: "string" },
          bullets: stringArray,
        },
      },
    },
    insights: stringArray,
    mentalModels: stringArray,
    factInterpretation: stringArray,
    questions: stringArray,
  },
} as const

const INSTRUCTIONS = `당신은 AI Frontier 팟캐스트의 한국어 리서치 에디터입니다.
반드시 제공된 공식 전사본만 근거로 분석하세요. 사실을 만들지 마세요.
출연진은 전사 화자 이름만 적고, 회사·모델명은 People에 넣지 마세요.
Topics와 Models는 짧은 태그로, Concepts는 재사용 가능한 영문 표제어로 작성하세요.
핵심 내용, 통찰, 직관, 사실과 해석의 경계를 서로 중복하지 않게 정리하세요.
모든 설명은 차분하고 구체적인 한국어로 작성하세요.`

export class AiFrontierAnalysisError extends Error {
  constructor() {
    super("AI Frontier Episode 분석에 실패했습니다.")
    this.name = "AiFrontierAnalysisError"
  }
}

function extractOutputText(payload: unknown): string {
  const parsed = textOutputSchema.safeParse(payload)
  if (!parsed.success) throw new AiFrontierAnalysisError()
  for (const output of parsed.data.output) {
    for (const content of output.content ?? []) {
      if (content.type === "output_text" && content.text?.trim()) return content.text
    }
  }
  throw new AiFrontierAnalysisError()
}

export async function analyzeAiFrontierEpisode(
  episode: AiFrontierOfficialEpisode,
  dependencies: AnalysisDependencies
): Promise<AiFrontierEpisodeAnalysis> {
  const apiKey = dependencies.apiKey.trim()
  if (!apiKey) throw new AiFrontierAnalysisError()
  const fetchImpl = dependencies.fetchImpl ?? fetch

  let response: Response
  try {
    response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: dependencies.model ?? ANALYSIS_MODEL,
        instructions: INSTRUCTIONS,
        input: [{
          role: "user",
          content: [{
            type: "input_text",
            text: JSON.stringify({
              episode: {
                episodeNumber: episode.episodeNumber,
                title: episode.name,
                officialUrl: episode.officialUrl,
                published: episode.published,
              },
              transcript: episode.transcript,
            }),
          }],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "ai_frontier_episode_analysis",
            strict: true,
            schema: ANALYSIS_JSON_SCHEMA,
          },
        },
        reasoning: { effort: "medium" },
        max_output_tokens: 12_000,
        store: false,
      }),
      signal: AbortSignal.timeout(180_000),
    })
  } catch {
    throw new AiFrontierAnalysisError()
  }
  if (!response.ok) throw new AiFrontierAnalysisError()

  try {
    const output = JSON.parse(extractOutputText(await response.json()))
    const parsed = analysisSchema.safeParse(output)
    if (!parsed.success) throw new AiFrontierAnalysisError()
    return parsed.data
  } catch (error) {
    if (error instanceof AiFrontierAnalysisError) throw error
    throw new AiFrontierAnalysisError()
  }
}
