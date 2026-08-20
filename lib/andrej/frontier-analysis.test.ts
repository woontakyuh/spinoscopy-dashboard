import { describe, expect, it, vi } from "vitest"

import type { AiFrontierOfficialEpisode } from "@/lib/types/ai-frontier-import"

import {
  AiFrontierAnalysisError,
  analyzeAiFrontierEpisode,
} from "./frontier-analysis"

const episode: AiFrontierOfficialEpisode = {
  source: "ai-frontier",
  reference: "EP87",
  episodeNumber: 87,
  name: "EP87. 딸깍의 시대",
  officialUrl: "https://aifrontier.kr/ko/episodes/ep87",
  published: "2026-02-24",
  duration: "PT1H",
  youtube: "https://www.youtube.com/watch?v=abc",
  summary: "공식 설명",
  transcript: "노정석: AI Agent를 이야기합니다.\n최승준: Harness가 중요합니다.",
}

const analysis = {
  summary: "AI Agent와 Harness의 관계를 설명한다.",
  topics: ["Agent", "Architecture"],
  models: [],
  people: ["노정석", "최승준"],
  concepts: [
    {
      term: "Agent Harness",
      korean: "에이전트 하네스",
      category: "Agent",
      oneLine: "에이전트 실행을 둘러싼 도구 계층이다.",
      intuition: "모델을 실제 업무에 연결하는 작업대다.",
      whyItMatters: "신뢰성과 반복 가능성을 높인다.",
    },
    {
      term: "AI Agent",
      korean: "AI 에이전트",
      category: "Agent",
      oneLine: "목표를 따라 도구를 쓰는 AI 시스템이다.",
      intuition: "스스로 다음 행동을 정하는 작업자다.",
      whyItMatters: "복합 작업 자동화의 기본 단위다.",
    },
    {
      term: "Tool Use",
      korean: "도구 사용",
      category: "Agent",
      oneLine: "모델이 외부 기능을 호출하는 방식이다.",
      intuition: "생각을 실제 행동으로 바꾸는 손이다.",
      whyItMatters: "모델 능력을 현실 시스템으로 확장한다.",
    },
  ],
  keyPoints: [
    { heading: "Agent의 구성", bullets: ["모델과 Harness를 분리해서 본다."] },
    { heading: "실행 계층", bullets: ["도구와 상태 관리가 중요하다."] },
    { heading: "평가", bullets: ["반복 가능한 검증이 필요하다."] },
  ],
  insights: ["모델 성능만으로 Agent 품질이 결정되지 않는다.", "Harness가 제품 차이를 만든다."],
  mentalModels: ["모델은 두뇌, Harness는 작업 환경이다."],
  factInterpretation: ["사실: 두 화자가 Harness를 언급했다."],
  questions: ["어떤 Harness가 가장 단순한가?", "평가를 어떻게 자동화할까?"],
}

function response(output: unknown, status = 200) {
  return new Response(
    JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }],
    }),
    { status, headers: { "Content-Type": "application/json" } }
  )
}

async function capturedError(promise: Promise<unknown>): Promise<AiFrontierAnalysisError> {
  try {
    await promise
    throw new Error("expected analysis failure")
  } catch (error) {
    expect(error).toBeInstanceOf(AiFrontierAnalysisError)
    return error as AiFrontierAnalysisError
  }
}

describe("AI Frontier Episode 분석", () => {
  it("전사를 구조화된 요약과 개념으로 분석한다", async () => {
    const fetchImpl = vi.fn<
      (input: string | URL | Request, init?: RequestInit) => Promise<Response>
    >(async () => response(analysis))

    const result = await analyzeAiFrontierEpisode(episode, {
      apiKey: "test-key",
      fetchImpl,
    })

    expect(result).toEqual(analysis)
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))
    expect(body.model).toBe("gpt-5.6-luna")
    expect(body.text.format.type).toBe("json_schema")
    expect(body.text.format.strict).toBe(true)
    expect(body.text.format.schema.properties.summary).toMatchObject({ minLength: 1, maxLength: 700, pattern: "\\S" })
    expect(body.text.format.schema.properties.topics).toMatchObject({ minItems: 1, maxItems: 10 })
    expect(body.text.format.schema.properties.topics.items).toMatchObject({ minLength: 1, maxLength: 60, pattern: "\\S" })
    expect(body.text.format.schema.properties.concepts).toMatchObject({ minItems: 3, maxItems: 12 })
    expect(body.text.format.schema.properties.keyPoints).toMatchObject({ minItems: 3, maxItems: 12 })
    expect(body.text.format.schema.properties.keyPoints.items.properties.bullets).toMatchObject({ minItems: 1, maxItems: 6 })
    expect(body.text.format.schema.properties.insights).toMatchObject({ minItems: 2, maxItems: 10 })
    expect(body.text.format.schema.properties.questions).toMatchObject({ minItems: 2, maxItems: 8 })
    expect(JSON.parse(body.input[0].content[0].text).transcript).toBe(episode.transcript)
  })

  it("API key가 없으면 provider 오류로 중단한다", async () => {
    await expect(
      analyzeAiFrontierEpisode(episode, { apiKey: "  ", fetchImpl: vi.fn() })
    ).rejects.toBeInstanceOf(AiFrontierAnalysisError)
  })

  it("429 응답은 body를 보존하지 않는 retryable HTTP 진단이다", async () => {
    const secret = "provider-body-secret-sentinel"
    const error = await capturedError(analyzeAiFrontierEpisode(episode, {
      apiKey: "test-key",
      fetchImpl: async () => new Response(secret, { status: 429 }),
    }))

    expect(error).toMatchObject({ phase: "http", status: 429, retryable: true })
    expect(JSON.stringify(error)).not.toContain(secret)
  })

  it("400 응답은 재시도하지 않는 HTTP 진단이다", async () => {
    const error = await capturedError(analyzeAiFrontierEpisode(episode, {
      apiKey: "test-key",
      fetchImpl: async () => new Response("invalid request secret", { status: 400 }),
    }))

    expect(error).toMatchObject({ phase: "http", status: 400, retryable: false })
  })

  it("transport/timeout 실패를 status 없는 retryable 진단으로 분류한다", async () => {
    const error = await capturedError(analyzeAiFrontierEpisode(episode, {
      apiKey: "test-key",
      fetchImpl: async () => { throw new DOMException("timed out secret", "TimeoutError") },
    }))

    expect(error).toMatchObject({ phase: "transport", status: null, retryable: true })
  })

  it("malformed response envelope를 response-shape로 분류한다", async () => {
    const error = await capturedError(analyzeAiFrontierEpisode(episode, {
      apiKey: "test-key",
      fetchImpl: async () => new Response(JSON.stringify({ output: "wrong" }), { status: 200 }),
    }))

    expect(error).toMatchObject({ phase: "response-shape", status: 200, retryable: false })
  })

  it("output_text의 invalid JSON을 output-json으로 분류한다", async () => {
    const error = await capturedError(analyzeAiFrontierEpisode(episode, {
      apiKey: "test-key",
      fetchImpl: async () => new Response(JSON.stringify({
        output: [{ content: [{ type: "output_text", text: "{" }] }],
      }), { status: 200 }),
    }))

    expect(error).toMatchObject({ phase: "output-json", status: 200, retryable: false })
  })

  it("모델이 계약과 다른 JSON을 반환하면 schema 진단으로 저장하지 않는다", async () => {
    const fetchImpl = vi.fn<
      (input: string | URL | Request, init?: RequestInit) => Promise<Response>
    >(async () => response({ summary: "불완전" }))

    const error = await capturedError(
      analyzeAiFrontierEpisode(episode, { apiKey: "test-key", fetchImpl })
    )
    expect(error).toMatchObject({ phase: "analysis-schema", status: 200, retryable: false })
  })
})
