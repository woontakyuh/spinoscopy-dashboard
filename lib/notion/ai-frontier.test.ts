import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  getAiFrontierEpisodeDetail,
  getAiFrontierIndex,
  toAiFrontierConcept,
  toAiFrontierEpisode,
  type AiFrontierNotionRequest,
  type NotionAiFrontierPage,
} from "./ai-frontier"

function page(
  id: string,
  properties: NotionAiFrontierPage["properties"]
): NotionAiFrontierPage {
  return { id, properties }
}

const fullEpisode = page("ep-1", {
  Name: { type: "title", title: [{ plain_text: "EP12 " }, { plain_text: "스케일링" }] },
  Episode: { type: "number", number: 12 },
  Status: { type: "select", select: { name: "정리 완료" } },
  Published: { type: "date", date: { start: "2026-07-01" } },
  Recorded: { type: "date", date: { start: "2026-06-28" } },
  Reviewed: { type: "checkbox", checkbox: true },
  Topics: {
    type: "multi_select",
    multi_select: [{ name: "scaling" }, { name: "RL" }],
  },
  Models: { type: "multi_select", multi_select: [{ name: "GPT-5" }] },
  People: { type: "multi_select", multi_select: [{ name: "Andrej Karpathy" }] },
  YouTube: { type: "url", url: "https://youtu.be/abc" },
  "Transcript Source": {
    type: "url",
    url: "https://aifrontier.kr/ko/episodes/ep12",
  },
  Duration: { type: "rich_text", rich_text: [{ plain_text: "2h 14m" }] },
  한줄요약: {
    type: "rich_text",
    rich_text: [{ plain_text: "스케일링 법칙과 RL의 연결을 한눈에 정리한다." }],
  },
  "Key Terms": {
    type: "multi_select",
    multi_select: [{ name: "pretraining" }, { name: "RLHF" }],
  },
})

const fullConcept = page("cp-1", {
  Term: { type: "title", title: [{ plain_text: "RLHF" }] },
  Korean: { type: "rich_text", rich_text: [{ plain_text: "인간 피드백 강화학습" }] },
  Category: { type: "select", select: { name: "학습 기법" } },
  Verified: { type: "select", select: { name: "전사 기반" } },
  "One-line Explanation": {
    type: "rich_text",
    rich_text: [{ plain_text: "사람 선호로 모델을 정렬한다." }],
  },
  Intuition: { type: "rich_text", rich_text: [{ plain_text: "취향 코칭에 가깝다." }] },
  "Why It Matters": {
    type: "rich_text",
    rich_text: [{ plain_text: "실사용 품질을 좌우한다." }],
  },
  Source: { type: "url", url: "https://example.com/rlhf" },
  Episodes: {
    type: "multi_select",
    multi_select: [{ name: "EP12" }, { name: " ep45 " }],
  },
})

describe("toAiFrontierEpisode", () => {
  it("완전한 Episode 페이지의 모든 필드를 매핑한다", () => {
    expect(toAiFrontierEpisode(fullEpisode)).toEqual({
      id: "ep-1",
      name: "EP12 스케일링",
      episodeNumber: 12,
      status: "정리 완료",
      published: "2026-07-01",
      recorded: "2026-06-28",
      lastEditedAt: null,
      reviewed: true,
      topics: ["scaling", "RL"],
      models: ["GPT-5"],
      people: ["Andrej Karpathy"],
      youtube: "https://youtu.be/abc",
      transcriptSource: "https://aifrontier.kr/ko/episodes/ep12",
      duration: "2h 14m",
      summary: "스케일링 법칙과 RL의 연결을 한눈에 정리한다.",
      keyTerms: ["pretraining", "RLHF"],
      source: "ai-frontier",
      sourceKey: "EP12",
      sourceIdentityPersisted: false,
    })
  })

  it("cron recovery를 위해 Notion last_edited_time을 보존한다", () => {
    expect(toAiFrontierEpisode({
      ...fullEpisode,
      last_edited_time: "2026-08-20T11:40:00.000Z",
    })?.lastEditedAt).toBe("2026-08-20T11:40:00.000Z")
  })

  it("Reviewed가 없으면 false로 둔다", () => {
    const p = page("ep-2", {
      Name: { type: "title", title: [{ plain_text: "EP13" }] },
    })
    expect(toAiFrontierEpisode(p)?.reviewed).toBe(false)
  })

  it("선택 속성이 없거나 타입이 어긋나면 null/[]로 떨어뜨린다", () => {
    const p = page("ep-3", {
      Name: { type: "title", title: [{ plain_text: "EP14" }] },
      Episode: { type: "rich_text", rich_text: [{ plain_text: "십사" }] },
      Models: { type: "select", select: { name: "잘못된 타입" } },
      Status: { type: "select", select: null },
      Published: { type: "date", date: null },
      YouTube: { type: "url", url: null },
      Duration: { type: "number", number: 134 },
    })
    const mapped = toAiFrontierEpisode(p)
    expect(mapped).not.toBeNull()
    expect(mapped?.episodeNumber).toBeNull()
    expect(mapped?.models).toEqual([])
    expect(mapped?.status).toBeNull()
    expect(mapped?.published).toBeNull()
    expect(mapped?.youtube).toBeNull()
    expect(mapped?.duration).toBeNull()
    expect(mapped?.summary).toBeNull()
    expect(mapped?.topics).toEqual([])
    expect(mapped?.keyTerms).toEqual([])
  })

  it("id 또는 Name이 없는 행만 건너뛴다", () => {
    expect(
      toAiFrontierEpisode(page("", { Name: { type: "title", title: [{ plain_text: "EP15" }] } }))
    ).toBeNull()
    expect(toAiFrontierEpisode(page("ep-4", {}))).toBeNull()
    expect(
      toAiFrontierEpisode(page("ep-5", { Name: { type: "title", title: [{ plain_text: "   " }] } }))
    ).toBeNull()
  })
})

describe("toAiFrontierEpisode 소스 정체성", () => {
  it("마이그레이션된 페이지는 저장된 Source/Source Key를 그대로 읽는다", () => {
    const mapped = toAiFrontierEpisode(page("ep-dwarkesh", {
      Name: { type: "title", title: [{ plain_text: "Ryan Greenblatt" }] },
      Source: { type: "select", select: { name: "dwarkesh" } },
      "Source Key": {
        type: "rich_text",
        rich_text: [{ plain_text: "DWARKESH:RYAN-GREENBLATT" }],
      },
      "Transcript Source": {
        type: "url",
        url: "https://www.dwarkesh.com/p/ryan-greenblatt",
      },
    }))

    expect(mapped?.source).toBe("dwarkesh")
    expect(mapped?.sourceKey).toBe("DWARKESH:RYAN-GREENBLATT")
    expect(mapped?.sourceIdentityPersisted).toBe(true)
    expect(mapped?.episodeNumber).toBeNull()
  })

  it("레거시 AI Frontier 행은 Episode 번호에서 EP 키를 유도한다", () => {
    const mapped = toAiFrontierEpisode(page("ep-110", {
      Name: { type: "title", title: [{ plain_text: "EP110. 레거시" }] },
      Episode: { type: "number", number: 110 },
    }))

    expect(mapped?.source).toBe("ai-frontier")
    expect(mapped?.sourceKey).toBe("EP110")
    expect(mapped?.sourceIdentityPersisted).toBe(false)
  })

  it("레거시 Dwarkesh 행은 공식 URL에서 정규 키를 유도한다", () => {
    const mapped = toAiFrontierEpisode(page("ep-dw-legacy", {
      Name: { type: "title", title: [{ plain_text: "Dwarkesh · Ryan Greenblatt" }] },
      "Transcript Source": {
        type: "url",
        url: "https://www.dwarkesh.com/p/ryan-greenblatt",
      },
    }))

    expect(mapped?.source).toBe("dwarkesh")
    expect(mapped?.sourceKey).toBe("DWARKESH:RYAN-GREENBLATT")
    expect(mapped?.sourceIdentityPersisted).toBe(false)
  })

  it("깨진 Source Key는 레거시 값으로 안전하게 되돌아간다", () => {
    const mapped = toAiFrontierEpisode(page("ep-broken", {
      Name: { type: "title", title: [{ plain_text: "EP110. 깨진 키" }] },
      Episode: { type: "number", number: 110 },
      Source: { type: "select", select: { name: "unknown-source" } },
      "Source Key": { type: "rich_text", rich_text: [{ plain_text: "???" }] },
    }))

    expect(mapped?.source).toBe("ai-frontier")
    expect(mapped?.sourceKey).toBe("EP110")
    expect(mapped?.sourceIdentityPersisted).toBe(false)
  })

  it("근거가 없으면 AI Frontier 기본값과 null 키로 둔다", () => {
    const mapped = toAiFrontierEpisode(page("ep-empty", {
      Name: { type: "title", title: [{ plain_text: "제목만 있는 행" }] },
    }))

    expect(mapped?.source).toBe("ai-frontier")
    expect(mapped?.sourceKey).toBeNull()
    expect(mapped?.sourceIdentityPersisted).toBe(false)
  })
})

describe("toAiFrontierConcept", () => {
  it("완전한 Concept 페이지의 모든 필드를 매핑한다", () => {
    expect(toAiFrontierConcept(fullConcept)).toEqual({
      id: "cp-1",
      term: "RLHF",
      korean: "인간 피드백 강화학습",
      category: "학습 기법",
      verified: "전사 기반",
      oneLine: "사람 선호로 모델을 정렬한다.",
      intuition: "취향 코칭에 가깝다.",
      whyItMatters: "실사용 품질을 좌우한다.",
      source: "https://example.com/rlhf",
      episodes: [
        { ref: "EP12", available: false, pageId: null },
        { ref: "EP45", available: false, pageId: null },
      ],
    })
  })

  it("Verified 라벨을 boolean으로 바꾸지 않고 문자열 그대로 보존한다", () => {
    const p = page("cp-2", {
      Term: { type: "title", title: [{ plain_text: "Scaling Law" }] },
      Verified: { type: "select", select: { name: "전사 기반" } },
    })
    const mapped = toAiFrontierConcept(p)
    expect(mapped?.verified).toBe("전사 기반")
    expect(typeof mapped?.verified).toBe("string")
  })

  it("Verified가 없거나 타입이 어긋나면 null이다", () => {
    const p = page("cp-3", {
      Term: { type: "title", title: [{ plain_text: "MoE" }] },
      Verified: { type: "checkbox", checkbox: true },
    })
    expect(toAiFrontierConcept(p)?.verified).toBeNull()
  })

  it("Episodes는 multi_select에서 읽고 빈 값은 제거한다", () => {
    const p = page("cp-4", {
      Term: { type: "title", title: [{ plain_text: "Tokenizer" }] },
      Episodes: {
        type: "multi_select",
        multi_select: [{ name: "ep7" }, { name: "  " }, {}, { name: "EP7" }],
      },
    })
    expect(toAiFrontierConcept(p)?.episodes).toEqual([
      { ref: "EP7", available: false, pageId: null },
    ])
  })

  it("Episodes가 multi_select가 아니면 빈 배열이다", () => {
    const p = page("cp-5", {
      Term: { type: "title", title: [{ plain_text: "Attention" }] },
      Episodes: { type: "rich_text", rich_text: [{ plain_text: "EP1, EP2" }] },
    })
    expect(toAiFrontierConcept(p)?.episodes).toEqual([])
  })

  it("id 또는 Term이 없는 행만 건너뛴다", () => {
    expect(
      toAiFrontierConcept(page("", { Term: { type: "title", title: [{ plain_text: "X" }] } }))
    ).toBeNull()
    expect(toAiFrontierConcept(page("cp-6", {}))).toBeNull()
  })
})

const EPISODES_QUERY = "/databases/3b2908af-25b9-81fb-88e7-c85a93ac62f4/query"
const CONCEPTS_QUERY = "/databases/3b2908af-25b9-8140-b0e8-d5ab9ed07844/query"
const originalEpisodesDbId = process.env.NOTION_AI_FRONTIER_EPISODES_DB_ID
const originalConceptsDbId = process.env.NOTION_AI_FRONTIER_CONCEPTS_DB_ID

function episodePage(id: string, number: number, published: string): NotionAiFrontierPage {
  return page(id, {
    Name: { type: "title", title: [{ plain_text: `EP${number}` }] },
    Episode: { type: "number", number },
    Published: { type: "date", date: { start: published } },
  })
}

function conceptPage(id: string, refs: string[]): NotionAiFrontierPage {
  return page(id, {
    Term: { type: "title", title: [{ plain_text: id }] },
    Episodes: {
      type: "multi_select",
      multi_select: refs.map((name) => ({ name })),
    },
  })
}

function queryResponse(results: NotionAiFrontierPage[], nextCursor: string | null = null) {
  return { results, has_more: nextCursor !== null, next_cursor: nextCursor }
}

function paragraph(id: string, text: string) {
  return {
    id,
    type: "paragraph",
    paragraph: { rich_text: [{ plain_text: text }] },
  }
}

function blockResponse(results: object[], nextCursor: string | null = null) {
  return { results, has_more: nextCursor !== null, next_cursor: nextCursor }
}

function requestBody(options: RequestInit | undefined): Record<string, unknown> {
  const parsed: unknown = JSON.parse(String(options?.body))
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

beforeEach(() => {
  delete process.env.NOTION_AI_FRONTIER_EPISODES_DB_ID
  delete process.env.NOTION_AI_FRONTIER_CONCEPTS_DB_ID
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("unexpected default transport"))))
})

afterEach(() => {
  restoreEnv("NOTION_AI_FRONTIER_EPISODES_DB_ID", originalEpisodesDbId)
  restoreEnv("NOTION_AI_FRONTIER_CONCEPTS_DB_ID", originalConceptsDbId)
  vi.unstubAllGlobals()
})

describe("getAiFrontierIndex", () => {
  it("uses the locked fallback IDs, follows both cursors, sorts stably, and never fetches bodies", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async (path, options) => {
      const cursor = requestBody(options).start_cursor
      if (path === EPISODES_QUERY && cursor === undefined) {
        return queryResponse([
          episodePage("ep-old", 10, "2026-01-01"),
          episodePage("ep-12", 12, "2026-03-01"),
        ], "episodes-page-2")
      }
      if (path === EPISODES_QUERY && cursor === "episodes-page-2") {
        return queryResponse([episodePage("ep-13", 13, "2026-03-01")])
      }
      if (path === CONCEPTS_QUERY && cursor === undefined) {
        return queryResponse([conceptPage("concept-a", ["EP12", "EP45"])], "concepts-page-2")
      }
      if (path === CONCEPTS_QUERY && cursor === "concepts-page-2") {
        return queryResponse([conceptPage("concept-b", ["EP13"])])
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    const index = await getAiFrontierIndex(request)

    expect(index.status).toBe("ok")
    expect(index.sources).toEqual({ episodes: "ok", concepts: "ok" })
    expect(index.episodes.map((episode) => episode.id)).toEqual(["ep-12", "ep-13", "ep-old"])
    expect(index.concepts.map((concept) => concept.id)).toEqual(["concept-a", "concept-b"])
    expect(request.mock.calls.map(([path]) => path)).not.toContainEqual(expect.stringContaining("/blocks/"))

    const episodeBodies = request.mock.calls
      .filter(([path]) => path === EPISODES_QUERY)
      .map(([, options]) => requestBody(options))
    const conceptBodies = request.mock.calls
      .filter(([path]) => path === CONCEPTS_QUERY)
      .map(([, options]) => requestBody(options))
    expect(episodeBodies).toEqual([
      { page_size: 100 },
      { page_size: 100, start_cursor: "episodes-page-2" },
    ])
    expect(conceptBodies).toEqual([
      { page_size: 100 },
      { page_size: 100, start_cursor: "concepts-page-2" },
    ])
  })

  it("returns Episodes with independent statuses when Concepts fails", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async (path) => {
      if (path === CONCEPTS_QUERY) throw new Error("Concepts unavailable")
      return queryResponse([episodePage("ep-12", 12, "2026-03-01")])
    })

    const index = await getAiFrontierIndex(request)

    expect(index.status).toBe("partial")
    expect(index.sources).toEqual({ episodes: "ok", concepts: "unavailable" })
    expect(index.episodes).toHaveLength(1)
    expect(index.concepts).toEqual([])
  })

  it("returns Concepts with independent statuses when Episodes fails", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async (path) => {
      if (path === EPISODES_QUERY) throw new Error("Episodes unavailable")
      return queryResponse([conceptPage("concept-a", ["EP45"])])
    })

    const index = await getAiFrontierIndex(request)

    expect(index.status).toBe("partial")
    expect(index.sources).toEqual({ episodes: "unavailable", concepts: "ok" })
    expect(index.episodes).toEqual([])
    expect(index.concepts[0].episodes).toEqual([
      { ref: "EP45", available: false, pageId: null },
    ])
  })

  it("returns unavailable rather than rejecting when both sources fail", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async () => {
      throw new Error("Notion unavailable")
    })

    await expect(getAiFrontierIndex(request)).resolves.toEqual({
      status: "unavailable",
      sources: { episodes: "unavailable", concepts: "unavailable" },
      episodes: [],
      concepts: [],
      episodeIndex: {},
    })
  })

  it("resolves a canonical Dwarkesh Source Key concept ref to its page", async () => {
    const dwarkesh = page("dw-ryan", {
      Name: { type: "title", title: [{ plain_text: "Ryan Greenblatt" }] },
      Source: { type: "select", select: { name: "dwarkesh" } },
      "Source Key": { type: "rich_text", rich_text: [{ plain_text: "DWARKESH:RYAN-GREENBLATT" }] },
      "Transcript Source": { type: "url", url: "https://www.dwarkesh.com/p/ryan-greenblatt" },
    })
    const request = vi.fn<AiFrontierNotionRequest>(async (path) =>
      path === EPISODES_QUERY
        ? queryResponse([dwarkesh])
        : queryResponse([conceptPage("alignment", ["DWARKESH:RYAN-GREENBLATT"])])
    )

    const index = await getAiFrontierIndex(request)

    expect(index.episodeIndex).toEqual({ "DWARKESH:RYAN-GREENBLATT": "dw-ryan" })
    expect(index.concepts[0].episodes).toEqual([
      { ref: "DWARKESH:RYAN-GREENBLATT", available: true, pageId: "dw-ryan" },
    ])
  })

  it("resolves matching refs and preserves orphan refs", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async (path) =>
      path === EPISODES_QUERY
        ? queryResponse([episodePage("ep-12", 12, "2026-03-01")])
        : queryResponse([conceptPage("concept-a", ["ep 12", "EP45"])])
    )

    const index = await getAiFrontierIndex(request)

    expect(index.episodeIndex).toEqual({ EP12: "ep-12" })
    expect(index.concepts[0].episodes).toEqual([
      { ref: "EP12", available: true, pageId: "ep-12" },
      { ref: "EP45", available: false, pageId: null },
    ])
  })
})

describe("getAiFrontierEpisodeDetail", () => {
  it("rejects an unknown page ID without calling the blocks endpoint", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async (path) => {
      if (path === EPISODES_QUERY) {
        return queryResponse([episodePage("ep-12", 12, "2026-03-01")])
      }
      if (path === CONCEPTS_QUERY) return queryResponse([])
      throw new Error(`Body fetch must not run: ${path}`)
    })

    await expect(getAiFrontierEpisodeDetail("missing-episode", request)).rejects.toThrow(
      "Episode not found in index: missing-episode"
    )
    expect(request.mock.calls.some(([path]) => path.startsWith("/blocks/"))).toBe(false)
  })

  it("paginates supported text blocks and reports an untruncated detail", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async (path) => {
      if (path === EPISODES_QUERY) {
        return queryResponse([episodePage("ep-12", 12, "2026-03-01")])
      }
      if (path === CONCEPTS_QUERY) return queryResponse([])
      const url = new URL(path, "https://notion.test")
      if (url.pathname === "/blocks/ep-12/children" && !url.searchParams.has("start_cursor")) {
        return blockResponse([
          paragraph("block-1", "첫 문단"),
          { id: "divider", type: "divider" },
        ], "blocks-page-2")
      }
      if (url.searchParams.get("start_cursor") === "blocks-page-2") {
        return blockResponse([{
          id: "block-2",
          type: "heading_2",
          heading_2: { rich_text: [{ plain_text: "둘째 제목" }] },
        }])
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    const detail = await getAiFrontierEpisodeDetail("ep-12", request)

    expect(detail.blocks).toEqual([
      { id: "block-1", type: "paragraph", text: "첫 문단" },
      { id: "block-2", type: "heading_2", text: "둘째 제목" },
    ])
    expect(detail.truncated).toBe(false)
    const blockPaths = request.mock.calls
      .map(([path]) => path)
      .filter((path) => path.startsWith("/blocks/"))
    expect(blockPaths).toEqual([
      "/blocks/ep-12/children?page_size=100",
      "/blocks/ep-12/children?page_size=100&start_cursor=blocks-page-2",
    ])
  })

  it("stops at 200 output blocks without requesting the remaining page", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async (path) => {
      if (path === EPISODES_QUERY) {
        return queryResponse([episodePage("ep-12", 12, "2026-03-01")])
      }
      if (path === CONCEPTS_QUERY) return queryResponse([])
      const cursor = new URL(path, "https://notion.test").searchParams.get("start_cursor")
      if (cursor === null) {
        return blockResponse(
          Array.from({ length: 100 }, (_, index) => paragraph(`block-${index}`, "x")),
          "blocks-page-2"
        )
      }
      if (cursor === "blocks-page-2") {
        return blockResponse(
          Array.from({ length: 100 }, (_, index) => paragraph(`block-${index + 100}`, "x")),
          "blocks-page-3"
        )
      }
      return blockResponse([paragraph("block-200", "must not be fetched")])
    })

    const detail = await getAiFrontierEpisodeDetail("ep-12", request)

    expect(detail.blocks).toHaveLength(200)
    expect(detail.truncated).toBe(true)
    expect(request.mock.calls.filter(([path]) => path.startsWith("/blocks/"))).toHaveLength(2)
  })

  it("slices the final block so output is exactly 12,000 characters", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async (path) => {
      if (path === EPISODES_QUERY) {
        return queryResponse([episodePage("ep-12", 12, "2026-03-01")])
      }
      if (path === CONCEPTS_QUERY) return queryResponse([])
      return blockResponse([
        paragraph("block-a", "a".repeat(11_990)),
        paragraph("block-b", "b".repeat(20)),
      ], "must-not-be-requested")
    })

    const detail = await getAiFrontierEpisodeDetail("ep-12", request)
    const characterCount = detail.blocks.reduce((total, block) => total + block.text.length, 0)

    expect(characterCount).toBe(12_000)
    expect(detail.blocks[1].text).toBe("b".repeat(10))
    expect(detail.truncated).toBe(true)
    expect(request.mock.calls.filter(([path]) => path.startsWith("/blocks/"))).toHaveLength(1)
  })
})
