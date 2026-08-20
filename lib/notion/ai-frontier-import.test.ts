import { describe, expect, it, vi } from "vitest"

import type { AiFrontierConcept } from "@/lib/types/ai-frontier"
import type {
  AiFrontierEpisodeAnalysis,
  AiFrontierOfficialEpisode,
} from "@/lib/types/ai-frontier-import"

import { NotionRequestError } from "./client"
import { AiFrontierSourceConflictError } from "./ai-frontier-identity"
import {
  persistAiFrontierImport,
  setAiFrontierImportStatus,
} from "./ai-frontier-import"

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

function repeated(value: string, length: number): string {
  return value.repeat(Math.ceil(length / value.length)).slice(0, length)
}

function worstCaseAnalysis(): AiFrontierEpisodeAnalysis {
  return {
    summary: repeated("요", 700),
    topics: ["AI, robotics", ...Array.from({ length: 9 }, (_, index) => `topic-${index}`)],
    models: Array.from({ length: 10 }, (_, index) => `model-${index}`),
    people: Array.from({ length: 12 }, (_, index) => `person-${index}`),
    concepts: Array.from({ length: 12 }, (_, index) => ({
      term: index === 11 ? "Embodied AI, world models" : `Concept ${index}`,
      korean: repeated("개", 100),
      category: repeated("분", 60),
      oneLine: repeated("설", 500),
      intuition: repeated("직", 700),
      whyItMatters: repeated("중", 700),
    })),
    keyPoints: Array.from({ length: 12 }, (_, index) => ({
      heading: repeated(`핵심${index}`, 160),
      bullets: Array.from({ length: 6 }, () => repeated("불", 700)),
    })),
    insights: Array.from({ length: 10 }, () => repeated("통", 700)),
    mentalModels: Array.from({ length: 8 }, () => repeated("모", 700)),
    factInterpretation: Array.from({ length: 8 }, () => repeated("사", 700)),
    questions: Array.from({ length: 8 }, () => repeated("질", 500)),
  }
}

function assertDocumentedNotionLimits(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertDocumentedNotionLimits(item)
    return
  }
  if (typeof value !== "object" || value === null) return
  const object = value as Record<string, unknown>
  if (Array.isArray(object.children) && object.children.length > 100) {
    throw new Error("Notion API error 400 response body: secret children limit")
  }
  for (const property of ["rich_text", "title"] as const) {
    const parts = object[property]
    if (Array.isArray(parts)) {
      for (const part of parts) {
        const content = (part as { text?: { content?: unknown } }).text?.content
        if (typeof content === "string" && content.length > 2_000) {
          throw new Error("Notion API error 400 response body: secret text limit")
        }
      }
    }
  }
  for (const property of ["select", "multi_select"] as const) {
    const options = property === "select" ? [object[property]] : object[property]
    if (!Array.isArray(options)) continue
    for (const option of options) {
      const name = (option as { name?: unknown } | null)?.name
      if (typeof name === "string" && (name.length > 100 || name.includes(","))) {
        throw new Error("Notion API error 400 response body: secret option limit")
      }
    }
  }
  for (const child of Object.values(object)) assertDocumentedNotionLimits(child)
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
      reference: "EP87",
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
    const completed = calls.find(
      (call) => call.path === "/pages/page-87" && call.method === "PATCH"
    )
    expect(completed?.body).toContain('"Source":{"select":{"name":"ai-frontier"}}')
    expect(completed?.body).toContain('"Source Key":{"rich_text":[{"text":{"content":"EP87"}}]}')
  })

  it("완료 저장은 Dwarkesh 원제와 정규 Source Key를 남기고 Episode를 비운다", async () => {
    const request = vi.fn(async (path: string, options?: RequestInit) => {
      if (path === "/blocks/page-dwarkesh/children" && !options?.method) {
        return { results: [], has_more: false, next_cursor: null }
      }
      return path === "/pages" ? { id: "new-concept" } : {}
    })

    const result = await persistAiFrontierImport({
      pageId: "page-dwarkesh",
      episode: {
        ...episode,
        source: "dwarkesh",
        reference: "DWARKESH:RYAN-GREENBLATT",
        episodeNumber: null,
        name: "Ryan Greenblatt – What happens once AI can automate AI research?",
        officialUrl: "https://www.dwarkesh.com/p/ryan-greenblatt",
      },
      analysis,
      existingConcepts: [],
    }, {
      request,
      pause: async () => undefined,
    })

    expect(result.reference).toBe("DWARKESH:RYAN-GREENBLATT")
    const completed = request.mock.calls.find(
      ([path, options]) => path === "/pages/page-dwarkesh" && options?.method === "PATCH"
    )
    const body = String(completed?.[1]?.body)
    expect(body).toContain(
      '"Name":{"title":[{"text":{"content":"Ryan Greenblatt – What happens once AI can automate AI research?"}}]}'
    )
    expect(body).toContain('"Source":{"select":{"name":"dwarkesh"}}')
    expect(body).toContain(
      '"Source Key":{"rich_text":[{"text":{"content":"DWARKESH:RYAN-GREENBLATT"}}]}'
    )
    const conceptCreates = request.mock.calls.filter(
      ([path, options]) => path === "/pages" && options?.method === "POST"
    )
    expect(conceptCreates.every(([, options]) =>
      String(options?.body).includes('"DWARKESH:RYAN-GREENBLATT"')
    )).toBe(true)
    expect(body).not.toContain('"Episode"')
  })

  it("schema-valid 최악 payload도 Notion option/block/text 제한 안에서 보존한다", async () => {
    const requests: Array<{ path: string; body: unknown }> = []
    const request = vi.fn(async (path: string, options?: RequestInit) => {
      if (path === "/blocks/page-worst/children" && !options?.method) {
        return { results: [], has_more: false, next_cursor: null }
      }
      const body = options?.body ? JSON.parse(String(options.body)) as unknown : null
      if (body !== null) {
        assertDocumentedNotionLimits(body)
        expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThanOrEqual(500_000)
      }
      requests.push({ path, body })
      return path === "/pages" ? { id: "local-concept" } : {}
    })

    await expect(persistAiFrontierImport({
      pageId: "page-worst",
      episode: {
        ...episode,
        source: "dwarkesh",
        reference: "DWARKESH:LOCAL-WORST",
        episodeNumber: null,
        name: "Local worst-case episode",
        officialUrl: "https://www.dwarkesh.com/p/local-worst",
        transcript: `${repeated("전사 ", 2_100)}\n${repeated("후속 ", 2_100)}`,
      },
      analysis: worstCaseAnalysis(),
      existingConcepts: [],
    }, { request, pause: async () => undefined })).resolves.toMatchObject({ status: "완료" })

    expect(requests.filter(({ path }) => path === "/pages")).toHaveLength(12)
    const completed = requests.find(({ path }) => path === "/pages/page-worst")
    const completedJson = JSON.stringify(completed?.body)
    expect(completedJson).not.toContain('AI, robotics')
    expect(completedJson).not.toContain('Embodied AI, world models')
    expect(JSON.stringify(requests.filter(({ path }) => path === "/pages")))
      .toContain('Embodied AI, world models')
  })

  it("검증된 기존 본문을 보존하는 retry는 block 삭제/추가 없이 속성만 완료한다", async () => {
    const request = vi.fn(async (path: string) =>
      path === "/pages" ? { id: "local-concept" } : {}
    )

    const result = await persistAiFrontierImport({
      pageId: "page-preserved",
      episode: {
        ...episode,
        source: "dwarkesh",
        reference: "DWARKESH:PRESERVED-BODY",
        episodeNumber: null,
        officialUrl: "https://www.dwarkesh.com/p/preserved-body",
      },
      analysis,
      existingConcepts: [],
      preserveExistingBlocks: true,
    }, { request, pause: async () => undefined })

    expect(result.status).toBe("완료")
    expect(request.mock.calls.some(([path]) => path.startsWith("/blocks/"))).toBe(false)
    expect(request).toHaveBeenCalledWith("/pages/page-preserved", expect.objectContaining({
      method: "PATCH",
      body: expect.stringContaining('"Status":{"select":{"name":"완료"}}'),
    }))
  })

  it("typed 400 persistence 오류는 safe stage/status만 남긴다", async () => {
    const request = vi.fn(async (path: string, options?: RequestInit) => {
      if (path === "/blocks/page-diagnostic/children" && !options?.method) {
        return { results: [], has_more: false, next_cursor: null }
      }
      if (path === "/pages/page-diagnostic") {
        throw new NotionRequestError(400)
      }
      return path === "/pages" ? { id: "local-concept" } : {}
    })

    let caught: unknown
    try {
      await persistAiFrontierImport({
        pageId: "page-diagnostic", episode, analysis, existingConcepts: [],
      }, { request, pause: async () => undefined })
    } catch (error) {
      caught = error
    }

    expect(caught).toMatchObject({
      name: "AiFrontierPersistenceError",
      stage: "episode-properties",
      status: 400,
    })
    expect(JSON.stringify(caught)).not.toContain("page-diagnostic")
  })

  it("공식 URL과 Source Key가 충돌하면 어떤 쓰기도 하지 않는다", async () => {
    const request = vi.fn(async () => ({}))

    await expect(
      persistAiFrontierImport({
        pageId: "page-conflict",
        episode: {
          ...episode,
          source: "dwarkesh",
          reference: "EP110",
          episodeNumber: null,
          officialUrl: "https://www.dwarkesh.com/p/ryan-greenblatt",
        },
        analysis,
        existingConcepts: [],
      }, {
        request,
        pause: async () => undefined,
      })
    ).rejects.toThrow(AiFrontierSourceConflictError)
    expect(request).not.toHaveBeenCalled()
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
