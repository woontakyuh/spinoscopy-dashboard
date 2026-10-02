import { readFile, writeFile } from "node:fs/promises"

import { describe, expect, it, vi } from "vitest"

import type { AiFrontierOfficialEpisode } from "@/lib/types/ai-frontier-import"

import {
  ANALYSIS_JSON_SCHEMA,
  ANALYSIS_MODEL,
  AiFrontierAnalysisError,
  analyzeAiFrontierEpisode,
  codexChildEnv,
  type CodexRunner,
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

function codexWriting(output: unknown) {
  return vi.fn<CodexRunner>(async ({ outputPath }) => {
    await writeFile(outputPath, typeof output === "string" ? output : JSON.stringify(output))
  })
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

describe("AI Frontier Episode 분석 (Codex CLI · 구독 OAuth)", () => {
  it("전사를 Codex CLI로 구조화된 요약과 개념으로 분석한다", async () => {
    let schema: unknown
    const runCodex = vi.fn<CodexRunner>(async ({ schemaPath, outputPath }) => {
      schema = JSON.parse(await readFile(schemaPath, "utf8"))
      await writeFile(outputPath, JSON.stringify(analysis))
    })

    const result = await analyzeAiFrontierEpisode(episode, { runCodex })

    expect(result).toEqual(analysis)
    const call = runCodex.mock.calls[0]![0]
    expect(call.model).toBe(ANALYSIS_MODEL)
    expect(call.prompt).toContain(JSON.stringify(episode.transcript))
    expect(schema).toEqual(JSON.parse(JSON.stringify(ANALYSIS_JSON_SCHEMA)))
  })

  it("Codex 실행 실패는 retryable transport 진단이다", async () => {
    const runCodex = vi.fn<CodexRunner>(async () => {
      throw new Error("not logged in")
    })
    const error = await capturedError(analyzeAiFrontierEpisode(episode, { runCodex }))
    expect(error.phase).toBe("transport")
    expect(error.retryable).toBe(true)
  })

  it("JSON이 아닌 출력은 output-json으로 분류한다", async () => {
    const error = await capturedError(
      analyzeAiFrontierEpisode(episode, { runCodex: codexWriting("not json") })
    )
    expect(error.phase).toBe("output-json")
  })

  it("모델이 계약과 다른 JSON을 반환하면 schema 진단으로 저장하지 않는다", async () => {
    const error = await capturedError(
      analyzeAiFrontierEpisode(episode, { runCodex: codexWriting({ summary: "불완전" }) })
    )
    expect(error.phase).toBe("analysis-schema")
  })

  it("배열 개수 상한을 넘기면 앞에서부터 잘라 저장 가능하게 만든다", async () => {
    const tooMany = { ...analysis, models: Array.from({ length: 14 }, (_, i) => `M${i}`) }
    const result = await analyzeAiFrontierEpisode(episode, { runCodex: codexWriting(tooMany) })
    expect(result.models).toHaveLength(10)
    expect(result.models[0]).toBe("M0")
  })

  it("자식 프로세스에서 API key 환경변수를 제거해 구독 OAuth만 쓰게 한다", () => {
    const env = codexChildEnv({ OPENAI_API_KEY: "x", CODEX_API_KEY: "y", HOME: "/h" } as unknown as NodeJS.ProcessEnv)
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.CODEX_API_KEY).toBeUndefined()
    expect(env.HOME).toBe("/h")
  })
})
