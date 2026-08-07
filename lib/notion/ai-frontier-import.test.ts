import { describe, expect, it, vi } from "vitest"

import type { AiFrontierConcept } from "@/lib/types/ai-frontier"
import type {
  AiFrontierEpisodeAnalysis,
  AiFrontierOfficialEpisode,
} from "@/lib/types/ai-frontier-import"

import {
  persistAiFrontierImport,
  setAiFrontierImportStatus,
} from "./ai-frontier-import"

const episode: AiFrontierOfficialEpisode = {
  episodeNumber: 87,
  name: "EP87. 딸깍의 시대",
  officialUrl: "https://aifrontier.kr/ko/episodes/ep87",
  published: "2026-02-24",
  duration: "PT1H",
  youtube: "https://www.youtube.com/watch?v=abc",
  summary: "공식 설명",
  transcript: "노정석: Agent Harness를 설명합니다.",
}

const analysis: AiFrontierEpisodeAnalysis = {
  summary: "한 줄 요약",
  topics: ["Agent"],
  models: [],
  people: ["노정석"],
  concepts: [
    {
      term: "Agent Harness",
      korean: "에이전트 하네스",
      category: "Agent",
      oneLine: "도구 계층이다.",
      intuition: "작업대와 같다.",
      whyItMatters: "신뢰성을 높인다.",
    },
    {
      term: "AI Agent",
      korean: "AI 에이전트",
      category: "Agent",
      oneLine: "목표를 수행한다.",
      intuition: "작업자와 같다.",
      whyItMatters: "자동화한다.",
    },
    {
      term: "Tool Use",
      korean: "도구 사용",
      category: "Agent",
      oneLine: "기능을 호출한다.",
      intuition: "손과 같다.",
      whyItMatters: "행동으로 연결한다.",
    },
  ],
  keyPoints: [{ heading: "구성", bullets: ["모델과 Harness를 나눈다."] }],
  insights: ["Harness가 차이를 만든다."],
  mentalModels: ["작업 환경이다."],
  factInterpretation: ["전사 기반 사실이다."],
  questions: ["평가는 어떻게 할까?"],
}

const existingConcept: AiFrontierConcept = {
  id: "concept-agent-harness",
  term: "Agent Harness",
  korean: "에이전트 하네스",
  category: "Agent",
  verified: "전사 기반",
  oneLine: "기존 설명",
  intuition: "기존 직관",
  whyItMatters: "기존 중요성",
  source: null,
  episodes: [{ ref: "EP12", available: true, pageId: "page-12" }],
}

describe("AI Frontier Notion import 저장", () => {
  it("기존 개념은 관계만 합치고 새 개념과 Episode 본문을 저장한다", async () => {
    const request = vi.fn(async (path: string, options?: RequestInit) => {
      if (path === "/blocks/page-87/children" && !options?.method) {
        return {
          results: [{ id: "old-block", type: "paragraph" }],
          has_more: false,
          next_cursor: null,
        }
      }
      return path === "/pages" ? { id: "new-concept" } : {}
    })

    const result = await persistAiFrontierImport({
      pageId: "page-87",
      episode,
      analysis,
      existingConcepts: [existingConcept],
    }, {
      request,
      pause: async () => undefined,
    })

    expect(result).toEqual({
      pageId: "page-87",
      episodeNumber: 87,
      status: "완료",
      conceptsCreated: 2,
      conceptsUpdated: 1,
    })
    const calls = request.mock.calls.map(([path, options]) => ({
      path,
      method: options?.method,
      body: String(options?.body ?? ""),
    }))
    expect(calls).toContainEqual(expect.objectContaining({
      path: "/pages/concept-agent-harness",
      method: "PATCH",
      body: expect.stringContaining('"EP87"'),
    }))
    const existingUpdate = calls.find((call) => call.path === "/pages/concept-agent-harness")
    expect(existingUpdate?.body).toContain('"EP12"')
    expect(existingUpdate?.body).not.toContain("기존 설명")
    expect(calls.filter((call) => call.path === "/pages")).toHaveLength(2)
    expect(calls).toContainEqual(expect.objectContaining({
      path: "/blocks/old-block",
      method: "DELETE",
    }))
    expect(calls).toContainEqual(expect.objectContaining({
      path: "/blocks/page-87/children",
      method: "PATCH",
      body: expect.stringContaining('"원본 전사"'),
    }))
    expect(calls).toContainEqual(expect.objectContaining({
      path: "/pages/page-87",
      method: "PATCH",
      body: expect.stringContaining('"Status":{"select":{"name":"완료"}}'),
    }))
  })

  it("수집 상태만 안전하게 갱신한다", async () => {
    const request = vi.fn(async () => ({}))

    await setAiFrontierImportStatus("page-87", "수집 실패", request)

    expect(request).toHaveBeenCalledWith("/pages/page-87", {
      method: "PATCH",
      body: JSON.stringify({
        properties: { Status: { select: { name: "수집 실패" } } },
      }),
    })
  })
})
