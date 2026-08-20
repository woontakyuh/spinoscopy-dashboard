import { describe, expect, it, vi } from "vitest"

import type { AiFrontierEpisode } from "@/lib/types/ai-frontier"
import type { AiFrontierCatalogEpisode } from "@/lib/types/ai-frontier-import"

import type { AiFrontierNotionRequest } from "./ai-frontier"
import { AiFrontierSourceConflictError } from "./ai-frontier-identity"
import {
  AiFrontierCatalogValidationError,
  runAiFrontierCatalogSync,
  syncAiFrontierCatalog,
} from "./ai-frontier-catalog"

const catalog: AiFrontierCatalogEpisode[] = [
  {
    source: "ai-frontier",
    reference: "EP107",
    episodeNumber: 107,
    name: "EP107. 최신 에피소드",
    officialUrl: "https://aifrontier.kr/ko/episodes/ep107",
    published: "2026-08-02",
    duration: "PT1H55M37S",
    youtube: "https://www.youtube.com/watch?v=latest",
    summary: "공식 설명",
  },
  {
    source: "ai-frontier",
    reference: "EP45",
    episodeNumber: 45,
    name: "EP45. 오래된 에피소드",
    officialUrl: "https://aifrontier.kr/ko/episodes/ep45",
    published: "2025-03-29",
    duration: "PT31M39S",
    youtube: "https://www.youtube.com/watch?v=old",
    summary: "오래된 설명",
  },
]

function existingEpisode(overrides: Partial<AiFrontierEpisode> = {}): AiFrontierEpisode {
  return {
    id: "page-107",
    name: "EP107. 최신 에피소드",
    episodeNumber: 107,
    status: "완료",
    published: "2026-08-02",
    recorded: null,
    reviewed: false,
    topics: ["Agent"],
    models: [],
    people: ["노정석"],
    youtube: "https://www.youtube.com/watch?v=latest",
    transcriptSource: null,
    duration: "PT1H55M37S",
    summary: "기존 정리",
    keyTerms: ["Agent"],
    source: "ai-frontier",
    sourceKey: "EP107",
    sourceIdentityPersisted: false,
    ...overrides,
  }
}

function dwarkeshEpisode(index: number): AiFrontierCatalogEpisode {
  const slug = `guest-${String(index).padStart(3, "0")}`
  const published = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10)
  return {
    source: "dwarkesh",
    reference: `DWARKESH:${slug.toUpperCase()}`,
    episodeNumber: null,
    name: `Guest ${index}`,
    officialUrl: `https://www.dwarkesh.com/p/${slug}`,
    published,
    duration: `PT${index + 1}M`,
    youtube: index % 2 === 0 ? `https://www.youtube.com/watch?v=guest-${index}` : null,
    summary: `Official summary ${index}`,
  }
}

function notionText(property: unknown, kind: "title" | "rich_text"): string | null {
  if (typeof property !== "object" || property === null || !(kind in property)) return null
  const values = Reflect.get(property, kind)
  if (!Array.isArray(values)) return null
  const first = values[0]
  if (typeof first !== "object" || first === null) return null
  const text = Reflect.get(first, "text")
  if (typeof text !== "object" || text === null) return null
  const content = Reflect.get(text, "content")
  return typeof content === "string" ? content : null
}

function requestBody(options?: RequestInit): string {
  if (typeof options?.body !== "string") throw new Error("expected JSON request body")
  return options.body
}

function createStatefulNotionDriver(initial: AiFrontierEpisode[] = []) {
  const episodes = initial.map((episode) => ({ ...episode }))
  let nextId = 1
  const requests: Array<{ path: string; method: string; body: string }> = []
  const request: AiFrontierNotionRequest = async (path, options = {}) => {
    const method = options.method ?? "GET"
    const body = requestBody(options)
    requests.push({ path, method, body })
    const parsed: unknown = JSON.parse(body)
    if (typeof parsed !== "object" || parsed === null) throw new Error("invalid request body")
    const properties = Reflect.get(parsed, "properties")
    if (typeof properties !== "object" || properties === null) throw new Error("missing properties")
    if (method === "POST" && path === "/pages") {
      const id = `created-${nextId++}`
      const sourceKey = notionText(Reflect.get(properties, "Source Key"), "rich_text")
      const name = notionText(Reflect.get(properties, "Name"), "title")
      const sourceValue = Reflect.get(Reflect.get(properties, "Source"), "select")
      const source = typeof sourceValue === "object" && sourceValue !== null
        ? Reflect.get(sourceValue, "name")
        : null
      if (source !== "dwarkesh" || sourceKey === null || name === null) {
        throw new Error("invalid created identity")
      }
      const dateValue = Reflect.get(Reflect.get(properties, "Published"), "date")
      const published = typeof dateValue === "object" && dateValue !== null
        ? Reflect.get(dateValue, "start")
        : null
      const urlValue = Reflect.get(Reflect.get(properties, "Transcript Source"), "url")
      const duration = notionText(Reflect.get(properties, "Duration"), "rich_text")
      const youtubeProperty = Reflect.get(properties, "YouTube")
      const youtube = typeof youtubeProperty === "object" && youtubeProperty !== null
        ? Reflect.get(youtubeProperty, "url")
        : null
      episodes.push(existingEpisode({
        id,
        name,
        episodeNumber: null,
        status: "목록",
        published: typeof published === "string" ? published : null,
        reviewed: false,
        youtube: typeof youtube === "string" ? youtube : null,
        transcriptSource: typeof urlValue === "string" ? urlValue : null,
        duration,
        summary: null,
        keyTerms: [],
        topics: [],
        people: [],
        source: "dwarkesh",
        sourceKey,
        sourceIdentityPersisted: true,
      }))
      return { id }
    }
    if (method === "PATCH" && path.startsWith("/pages/")) return {}
    throw new Error(`unexpected request: ${method} ${path}`)
  }
  return { episodes, requests, request }
}

describe("AI Frontier 카탈로그 Notion 동기화", () => {
  it("공식 카탈로그와 Notion 인덱스를 읽어 동기화 결과를 반환한다", async () => {
    const loadCatalog = vi.fn(async () => catalog)
    const loadIndex = vi.fn(async () => ({
      status: "ok" as const,
      sources: { episodes: "ok" as const, concepts: "ok" as const },
      episodes: [existingEpisode()],
      concepts: [],
      episodeIndex: { EP107: "page-107" },
    }))
    const sync = vi.fn(async () => ({
      created: 1,
      updated: 0,
      unchanged: 1,
      createdPages: [{
        pageId: "new-page",
        source: "ai-frontier" as const,
        sourceKey: "EP45",
        published: "2025-03-29",
        officialUrl: "https://aifrontier.kr/ko/episodes/ep45",
      }],
    }))

    const result = await runAiFrontierCatalogSync({ loadCatalog, loadIndex, sync })

    expect(result).toEqual({
      catalog: 2,
      created: 1,
      updated: 0,
      unchanged: 1,
      createdPages: [{
        pageId: "new-page",
        source: "ai-frontier",
        sourceKey: "EP45",
        published: "2025-03-29",
        officialUrl: "https://aifrontier.kr/ko/episodes/ep45",
      }],
    })
    expect(sync).toHaveBeenCalledWith(catalog, [existingEpisode()])
  })

  it("Dwarkesh upstream failure 뒤에도 AI Frontier catalog를 동기화하고 typed failure를 반환한다", async () => {
    const sync = vi.fn(async () => ({
      created: 0, updated: 0, unchanged: catalog.length, createdPages: [],
    }))

    const result = await runAiFrontierCatalogSync({
      loadCatalog: async () => ({
        aiFrontier: { ok: true as const, episodes: catalog },
        dwarkesh: {
          ok: false as const,
          error: { source: "dwarkesh" as const, reason: "upstream" as const },
        },
      }),
      loadIndex: async () => ({
        status: "ok", sources: { episodes: "ok", concepts: "ok" },
        episodes: [], concepts: [], episodeIndex: {},
      }),
      sync,
    })

    expect(sync).toHaveBeenCalledWith(catalog, [])
    expect(result.sourceFailures).toEqual([{ source: "dwarkesh", reason: "upstream" }])
    expect(result.catalog).toBe(catalog.length)
  })

  it.each([
    ["empty", [], "empty"],
    ["undersized", Array.from({ length: 19 }, (_, index) => dwarkeshEpisode(index)), "undersized"],
  ] as const)("successful-but-%s Dwarkesh catalog fails loudly after preserving AI sync", async (_case, rows, reason) => {
    const sync = vi.fn(async () => ({
      created: 0, updated: 0, unchanged: catalog.length, createdPages: [],
    }))

    const result = await runAiFrontierCatalogSync({
      loadCatalog: async () => ({
        aiFrontier: { ok: true as const, episodes: catalog },
        dwarkesh: { ok: true as const, episodes: rows },
      }),
      loadIndex: async () => ({
        status: "ok", sources: { episodes: "ok", concepts: "ok" },
        episodes: [], concepts: [], episodeIndex: {},
      }),
      sync,
    })

    expect(sync).toHaveBeenCalledWith(catalog, [])
    expect(result.sourceFailures).toEqual([{
      source: "dwarkesh",
      reason,
      ...(reason === "undersized" ? { count: 19 } : {}),
    }])
  })

  it("Notion Episodes DB를 읽지 못하면 쓰기를 시작하지 않는다", async () => {
    const sync = vi.fn(async () => ({
      created: 0,
      updated: 0,
      unchanged: 0,
      createdPages: [],
    }))

    await expect(runAiFrontierCatalogSync({
      loadCatalog: async () => catalog,
      loadIndex: async () => ({
        status: "partial",
        sources: { episodes: "unavailable", concepts: "ok" },
        episodes: [],
        concepts: [],
        episodeIndex: {},
      }),
      sync,
    })).rejects.toThrow("AI Frontier Episodes DB를 읽지 못했습니다.")
    expect(sync).not.toHaveBeenCalled()
  })

  it("기존 완료 Episode는 정리를 보존하고 공식 링크만 보완한다", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async () => ({}))

    const result = await syncAiFrontierCatalog(catalog.slice(0, 1), [existingEpisode()], {
      request,
      pause: async () => undefined,
    })

    expect(result).toEqual({ created: 0, updated: 1, unchanged: 0, createdPages: [] })
    expect(request).toHaveBeenCalledWith("/pages/page-107", expect.objectContaining({
      method: "PATCH",
      body: expect.stringContaining('"Transcript Source":{"url":"https://aifrontier.kr/ko/episodes/ep107"}'),
    }))
    expect(request.mock.calls[0]?.[1]?.body).not.toContain('"Status"')
    expect(request.mock.calls[0]?.[1]?.body).not.toContain('"한줄요약"')
  })

  it("없는 Episode는 제목과 링크를 목록 상태로 만든다", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async () => ({ id: "new-page" }))

    const result = await syncAiFrontierCatalog(catalog.slice(1), [], {
      request,
      pause: async () => undefined,
    })

    expect(result).toMatchObject({ created: 1, updated: 0, unchanged: 0 })
    expect(result.createdPages).toEqual([{
      pageId: "new-page",
      source: "ai-frontier",
      sourceKey: "EP45",
      published: "2025-03-29",
      officialUrl: "https://aifrontier.kr/ko/episodes/ep45",
    }])
    expect(request).toHaveBeenCalledWith("/pages", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"Status":{"select":{"name":"목록"}}'),
    }))
    const body = String(request.mock.calls[0]?.[1]?.body)
    expect(body).toContain('"Name":{"title":[{"text":{"content":"EP45. 오래된 에피소드"}}]}')
    expect(body).toContain('"Transcript Source":{"url":"https://aifrontier.kr/ko/episodes/ep45"}')
    expect(body).toContain('"Source":{"select":{"name":"ai-frontier"}}')
    expect(body).toContain('"Source Key":{"rich_text":[{"text":{"content":"EP45"}}]}')
  })

  it("Dwarkesh Episode는 공식 URL로 기존 행을 찾아 번호 없이 갱신한다", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async (_path, options) =>
      options?.method === "POST" ? { id: "created-page" } : {}
    )
    const dwarkesh = {
      source: "dwarkesh",
      reference: "DWARKESH:RYAN-GREENBLATT",
      episodeNumber: null,
      name: "Ryan Greenblatt",
      officialUrl: "https://www.dwarkesh.com/p/ryan-greenblatt",
      published: "2026-08-11",
      duration: "PT2H12M32S",
      youtube: null,
      summary: "A debate about recursive self-improvement.",
    } satisfies AiFrontierCatalogEpisode
    const existing = existingEpisode({
      id: "page-dwarkesh",
      name: "Ryan Greenblatt (draft)",
      episodeNumber: null,
      transcriptSource: dwarkesh.officialUrl,
      source: "dwarkesh",
      sourceKey: "DWARKESH:RYAN-GREENBLATT",
    })

    const result = await syncAiFrontierCatalog(
      [dwarkesh, ...Array.from({ length: 19 }, (_, index) => dwarkeshEpisode(index))],
      [existing],
      { request, pause: async () => undefined }
    )

    expect(result).toMatchObject({ created: 19, updated: 1, unchanged: 0 })
    const patch = request.mock.calls.find(([path]) => path === "/pages/page-dwarkesh")
    const body = String(patch?.[1]?.body)
    expect(body).toContain('"Name":{"title":[{"text":{"content":"Ryan Greenblatt"}}]}')
    expect(body).not.toContain('"Episode"')
    expect(body).toContain('"Source":{"select":{"name":"dwarkesh"}}')
    expect(body).toContain(
      '"Source Key":{"rich_text":[{"text":{"content":"DWARKESH:RYAN-GREENBLATT"}}]}'
    )
  })

  it("제목과 공식 링크가 같은 기존 Episode는 쓰지 않는다", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async () => ({}))
    const existing = existingEpisode({
      transcriptSource: "https://aifrontier.kr/ko/episodes/ep107",
      sourceIdentityPersisted: true,
    })

    const result = await syncAiFrontierCatalog(catalog.slice(0, 1), [existing], {
      request,
      pause: async () => undefined,
    })

    expect(result).toEqual({ created: 0, updated: 0, unchanged: 1, createdPages: [] })
    expect(request).not.toHaveBeenCalled()
  })

  it("레거시 행에는 다른 필드를 건드리지 않고 정체성만 보완한다", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async () => ({}))
    const existing = existingEpisode({
      transcriptSource: "https://aifrontier.kr/ko/episodes/ep107",
      sourceIdentityPersisted: false,
    })

    const result = await syncAiFrontierCatalog(catalog.slice(0, 1), [existing], {
      request,
      pause: async () => undefined,
    })

    expect(result).toEqual({ created: 0, updated: 1, unchanged: 0, createdPages: [] })
    const body = String(request.mock.calls[0]?.[1]?.body)
    expect(JSON.parse(body)).toEqual({
      properties: {
        Source: { select: { name: "ai-frontier" } },
        "Source Key": { rich_text: [{ text: { content: "EP107" } }] },
      },
    })
  })

  it("Source Key가 같으면 공식 URL이 달라도 새로 만들지 않는다", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async () => ({}))
    const existing = existingEpisode({
      id: "page-107-moved",
      transcriptSource: "https://aifrontier.kr/ko/episodes/ep107?utm_source=old",
      sourceIdentityPersisted: true,
    })

    const result = await syncAiFrontierCatalog(catalog.slice(0, 1), [existing], {
      request,
      pause: async () => undefined,
    })

    expect(result).toEqual({ created: 0, updated: 1, unchanged: 0, createdPages: [] })
    expect(request.mock.calls[0]?.[0]).toBe("/pages/page-107-moved")
    const body = String(request.mock.calls[0]?.[1]?.body)
    expect(body).toContain('"Transcript Source":{"url":"https://aifrontier.kr/ko/episodes/ep107"}')
    expect(body).not.toContain('"Source Key"')
  })

  it("Source Key가 없으면 공식 URL과 Episode 번호를 마이그레이션 fallback으로 쓴다", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async () => ({}))
    const byUrl = existingEpisode({
      id: "page-45-url",
      name: "EP45. 오래된 에피소드",
      episodeNumber: null,
      transcriptSource: "https://aifrontier.kr/ko/episodes/ep45",
      duration: "PT31M39S",
      published: "2025-03-29",
      youtube: "https://www.youtube.com/watch?v=old",
      sourceKey: null,
    })
    const byNumber = existingEpisode({
      id: "page-107-number",
      transcriptSource: null,
      sourceKey: null,
    })

    const result = await syncAiFrontierCatalog(catalog, [byNumber, byUrl], {
      request,
      pause: async () => undefined,
    })

    expect(result).toEqual({ created: 0, updated: 2, unchanged: 0, createdPages: [] })
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "/pages/page-107-number",
      "/pages/page-45-url",
    ])
  })

  it("서로 다른 fallback으로 같은 legacy 페이지를 가리키는 catalog rows는 전부 거부한다", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async () => ({}))
    const pause = vi.fn(async () => undefined)
    const episodes = [150, 200].map((episodeNumber) => ({
      source: "ai-frontier" as const,
      reference: `EP${episodeNumber}`,
      episodeNumber,
      name: `EP${episodeNumber}. Legacy collision`,
      officialUrl: `https://aifrontier.kr/ko/episodes/ep${episodeNumber}`,
      published: "2026-08-01",
      duration: "PT1H",
      youtube: null,
      summary: null,
    }))
    const inconsistentLegacy = existingEpisode({
      id: "legacy-page",
      name: "Legacy inconsistent row",
      episodeNumber: 150,
      transcriptSource: "https://aifrontier.kr/ko/episodes/ep200",
      sourceKey: null,
      sourceIdentityPersisted: false,
    })

    await expect(syncAiFrontierCatalog(episodes, [inconsistentLegacy], {
      request,
      pause,
    })).rejects.toMatchObject({ code: "ambiguous-existing-match" })
    expect(request).not.toHaveBeenCalled()
    expect(pause).not.toHaveBeenCalled()
  })

  it("저장된 Source Key가 카탈로그 정체성과 충돌하면 한 건도 쓰지 않는다", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async () => ({}))
    const dwarkesh = {
      source: "dwarkesh",
      reference: "DWARKESH:RYAN-GREENBLATT",
      episodeNumber: null,
      name: "Ryan Greenblatt",
      officialUrl: "https://www.dwarkesh.com/p/ryan-greenblatt",
      published: "2026-08-11",
      duration: "PT2H12M32S",
      youtube: null,
      summary: "A debate about recursive self-improvement.",
    } satisfies AiFrontierCatalogEpisode
    const conflicting = existingEpisode({
      id: "page-conflict",
      name: "Ryan Greenblatt",
      episodeNumber: null,
      transcriptSource: dwarkesh.officialUrl,
      source: "ai-frontier",
      sourceKey: "EP110",
      sourceIdentityPersisted: true,
    })

    await expect(
      syncAiFrontierCatalog([
        ...catalog,
        dwarkesh,
        ...Array.from({ length: 19 }, (_, index) => dwarkeshEpisode(index)),
      ], [conflicting], {
        request,
        pause: async () => undefined,
      })
    ).rejects.toThrow(AiFrontierSourceConflictError)
    expect(request).not.toHaveBeenCalled()
  })

  it("카탈로그 자체의 URL과 reference가 어긋나면 쓰기 전에 거부한다", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async () => ({}))
    const broken = {
      ...catalog[0],
      source: "dwarkesh",
      reference: "EP110",
      officialUrl: "https://www.dwarkesh.com/p/ryan-greenblatt",
    } satisfies AiFrontierCatalogEpisode

    await expect(
      syncAiFrontierCatalog([broken], [], { request, pause: async () => undefined })
    ).rejects.toThrow(AiFrontierSourceConflictError)
    expect(request).not.toHaveBeenCalled()
  })

  it("AI Frontier noise가 있어도 20개 미만 Dwarkesh batch는 쓰기 전에 거부한다", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async () => ({ id: "must-not-write" }))
    const undersized = Array.from({ length: 19 }, (_, index) => dwarkeshEpisode(index))

    await expect(syncAiFrontierCatalog(
      [catalog[0], ...undersized, catalog[1]],
      [],
      { request, pause: async () => undefined }
    )).rejects.toMatchObject({ code: "undersized-dwarkesh-catalog" })
    expect(request).not.toHaveBeenCalled()
  })

  it("136개 Dwarkesh 중 게시일 기준 최신 20개만 계획하고 AI Frontier는 모두 유지한다", async () => {
    const dwarkesh = Array.from({ length: 136 }, (_, index) => dwarkeshEpisode(index))
    const outOfOrder = [...dwarkesh].sort((left, right) => left.name.localeCompare(right.name))
    const request = vi.fn<AiFrontierNotionRequest>(async (_path, options) => {
      const body: unknown = JSON.parse(requestBody(options))
      if (typeof body !== "object" || body === null) throw new Error("invalid body")
      const properties = Reflect.get(body, "properties")
      const sourceKey = notionText(Reflect.get(properties, "Source Key"), "rich_text")
      return { id: `page-${sourceKey}` }
    })

    const result = await syncAiFrontierCatalog(
      [outOfOrder[40], catalog[0], ...outOfOrder.slice(0, 40), catalog[1], ...outOfOrder.slice(41)],
      [],
      { request, pause: async () => undefined }
    )

    expect(result).toMatchObject({ created: 22, updated: 0, unchanged: 0 })
    const createdKeys = result.createdPages.map((page) => page.sourceKey)
    expect(createdKeys.filter((key) => key.startsWith("EP"))).toEqual(["EP107", "EP45"])
    expect(createdKeys.filter((key) => key.startsWith("DWARKESH:"))).toEqual(
      dwarkesh.slice(-20).reverse().map((episode) => episode.reference)
    )
    expect(request).toHaveBeenCalledTimes(22)
  })

  it("실제로 fixture store를 바꾸는 첫 실행은 20개를 만들고 독립적인 둘째 실행은 20개를 건너뛴다", async () => {
    const input = Array.from({ length: 136 }, (_, index) => dwarkeshEpisode(index)).reverse()
    const driver = createStatefulNotionDriver()

    const first = await syncAiFrontierCatalog(input, driver.episodes, {
      request: driver.request,
      pause: async () => undefined,
    })
    expect(first).toMatchObject({ created: 20, updated: 0, unchanged: 0 })
    expect(first.createdPages).toHaveLength(20)
    expect(first.createdPages.every((page) => page.pageId.startsWith("created-"))).toBe(true)
    expect(new Set(first.createdPages.map((page) => page.sourceKey)).size).toBe(20)

    const second = await syncAiFrontierCatalog(input, driver.episodes, {
      request: driver.request,
      pause: async () => undefined,
    })
    expect(second).toEqual({ created: 0, updated: 0, unchanged: 20, createdPages: [] })
    const posts = driver.requests.filter((entry) => entry.method === "POST")
    expect(posts).toHaveLength(first.created)
    expect(driver.requests.filter((entry) => entry.method === "PATCH")).toHaveLength(0)
    expect(driver.requests.filter((entry) => entry.method === "DELETE")).toHaveLength(0)
    expect(driver.requests.some((entry) => entry.body.includes('\"archived\"'))).toBe(false)

    const newestProperties = JSON.parse(posts[0].body).properties
    expect(newestProperties).toMatchObject({
      Name: { title: [{ text: { content: "Guest 135" } }] },
      Status: { select: { name: "수집 대기" } },
      Source: { select: { name: "dwarkesh" } },
      "Source Key": { rich_text: [{ text: { content: "DWARKESH:GUEST-135" } }] },
      Published: { date: { start: input[0].published } },
      Duration: { rich_text: [{ text: { content: input[0].duration } }] },
      "Transcript Source": { url: input[0].officialUrl },
    })
    expect(newestProperties).not.toHaveProperty("Episode")
    expect(newestProperties).not.toHaveProperty("YouTube")
    expect(posts.some((entry) => JSON.parse(entry.body).properties.YouTube?.url)).toBe(true)
  })

  it("완료 Dwarkesh 페이지는 catalog-owned metadata만 갱신하고 상태와 콘텐츠를 보존한다", async () => {
    const input = Array.from({ length: 20 }, (_, index) => dwarkeshEpisode(index))
    const newest = input[19]
    const completed = existingEpisode({
      id: "completed-page",
      name: `${newest.name} stale`,
      episodeNumber: null,
      status: "완료",
      reviewed: true,
      transcriptSource: newest.officialUrl,
      published: newest.published,
      duration: newest.duration,
      youtube: newest.youtube,
      summary: "완료된 한국어 요약",
      keyTerms: ["preserved"],
      source: "dwarkesh",
      sourceKey: newest.reference,
      sourceIdentityPersisted: true,
    })
    const request = vi.fn<AiFrontierNotionRequest>(async (_path, options) => {
      if (options?.method === "POST") return { id: "created-page" }
      return {}
    })

    const result = await syncAiFrontierCatalog(input, [completed], {
      request,
      pause: async () => undefined,
    })

    expect(result).toMatchObject({ created: 19, updated: 1, unchanged: 0 })
    const patch = request.mock.calls.find(([path]) => path === "/pages/completed-page")
    expect(patch).toBeDefined()
    expect(JSON.parse(requestBody(patch?.[1]))).toEqual({
      properties: { Name: { title: [{ text: { content: newest.name } }] } },
    })
  })

  it("window 밖의 오래된 기존 Dwarkesh 페이지는 삭제하거나 archive하지 않는다", async () => {
    const input = Array.from({ length: 136 }, (_, index) => dwarkeshEpisode(index))
    const stale = existingEpisode({
      id: "stale-page",
      name: input[0].name,
      episodeNumber: null,
      transcriptSource: input[0].officialUrl,
      published: input[0].published,
      duration: input[0].duration,
      youtube: input[0].youtube,
      source: "dwarkesh",
      sourceKey: input[0].reference,
      sourceIdentityPersisted: true,
    })
    const request = vi.fn<AiFrontierNotionRequest>(async () => ({ id: "new-page" }))

    const result = await syncAiFrontierCatalog(input, [stale], {
      request,
      pause: async () => undefined,
    })

    expect(result).toMatchObject({ created: 20, updated: 0, unchanged: 0 })
    expect(request.mock.calls.some(([path]) => path === "/pages/stale-page")).toBe(false)
    expect(request.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false)
    expect(request.mock.calls.some(([, options]) => String(options?.body).includes('"archived"'))).toBe(false)
  })

  it("case-folded duplicate Source Key가 섞인 batch는 계획 전에 전부 거부한다", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async () => ({ id: "must-not-write" }))
    const dwarkesh = Array.from({ length: 20 }, (_, index) => dwarkeshEpisode(index))
    const duplicate = {
      ...dwarkesh[4],
      reference: dwarkesh[4].reference.toLowerCase(),
    }

    await expect(syncAiFrontierCatalog(
      [catalog[0], ...dwarkesh, catalog[1], duplicate],
      [],
      { request, pause: async () => undefined }
    )).rejects.toMatchObject({ code: "duplicate-source-key" })
    expect(request).not.toHaveBeenCalled()
  })

  it("Source Key와 fallback URL이 서로 다른 페이지를 가리키면 batch 전체를 거부한다", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async () => ({}))
    const dwarkesh = Array.from({ length: 20 }, (_, index) => dwarkeshEpisode(index))
    const keyed = existingEpisode({
      id: "keyed-page",
      episodeNumber: null,
      source: "dwarkesh",
      sourceKey: dwarkesh[19].reference,
      transcriptSource: dwarkesh[18].officialUrl,
      sourceIdentityPersisted: true,
    })
    const linked = existingEpisode({
      id: "url-page",
      episodeNumber: null,
      source: "dwarkesh",
      sourceKey: dwarkesh[18].reference,
      transcriptSource: dwarkesh[19].officialUrl,
      sourceIdentityPersisted: true,
    })

    await expect(syncAiFrontierCatalog(dwarkesh, [keyed, linked], {
      request,
      pause: async () => undefined,
    })).rejects.toBeInstanceOf(AiFrontierCatalogValidationError)
    expect(request).not.toHaveBeenCalled()
  })
})
