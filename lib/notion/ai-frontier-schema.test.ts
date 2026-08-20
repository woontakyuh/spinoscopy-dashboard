import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AI_FRONTIER_EPISODES_DB_ID,
  getAiFrontierIndex,
  type AiFrontierNotionRequest,
} from "./ai-frontier"
import {
  AiFrontierSchemaError,
  migrateAiFrontierEpisodesSchema,
} from "./ai-frontier-schema"

const EMPTY_QUERY = { results: [], has_more: false, next_cursor: null }

function queryRequest(): AiFrontierNotionRequest {
  return vi.fn(async (_path: string, _options?: RequestInit) => EMPTY_QUERY)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

// 기준선(characterization): 스키마 마이그레이터가 반드시 따라야 하는 현행 규약을 고정한다.
describe("기준선: Frontier Episodes 데이터베이스 식별/요청 규약", () => {
  it("Episodes DB id 상수와 쿼리 경로·메서드를 유지한다", async () => {
    vi.stubEnv("NOTION_AI_FRONTIER_EPISODES_DB_ID", "")
    const request = queryRequest()

    await getAiFrontierIndex(request)

    expect(AI_FRONTIER_EPISODES_DB_ID).toBe("3b2908af-25b9-81fb-88e7-c85a93ac62f4")
    expect(request).toHaveBeenCalledWith(
      `/databases/${AI_FRONTIER_EPISODES_DB_ID}/query`,
      { method: "POST", body: JSON.stringify({ page_size: 100 }) }
    )
  })

  it("NOTION_AI_FRONTIER_EPISODES_DB_ID 환경변수를 상수보다 우선한다", async () => {
    vi.stubEnv("NOTION_AI_FRONTIER_EPISODES_DB_ID", "  11112222-3333-4444-5555-666677778888  ")
    const request = queryRequest()

    await getAiFrontierIndex(request)

    const paths = (request as ReturnType<typeof vi.fn>).mock.calls.map(
      (call: unknown[]) => call[0]
    )
    expect(paths).toContain("/databases/11112222-3333-4444-5555-666677778888/query")
  })
})

type SchemaProperties = Record<string, { type: string }>

interface MockNotion {
  request: AiFrontierNotionRequest
  patches: Array<{ path: string; body: Record<string, unknown> }>
  properties(): SchemaProperties
}

/** 현행 Episodes 스키마(Source/Source Key 없음)를 축약 재현한다. */
function baseProperties(): SchemaProperties {
  return {
    Name: { type: "title" },
    Episode: { type: "number" },
    Status: { type: "select" },
    Reviewed: { type: "checkbox" },
    Published: { type: "date" },
    "Transcript Source": { type: "url" },
    한줄요약: { type: "rich_text" },
  }
}

function propertyType(definition: unknown): string {
  if (typeof definition !== "object" || definition === null) {
    throw new Error("mock: 속성 정의가 객체가 아니다")
  }
  const keys = Object.keys(definition as Record<string, unknown>)
  if (keys.length !== 1) throw new Error(`mock: 속성 정의 키가 1개가 아니다(${keys.join(",")})`)
  return keys[0]
}

/** Notion을 흉내내는 인메모리 스키마. PATCH는 상태에 반영되고 개별 기록된다. */
function mockNotion(initial: SchemaProperties, responseOverride?: unknown): MockNotion {
  const state: SchemaProperties = { ...initial }
  const patches: Array<{ path: string; body: Record<string, unknown> }> = []
  const request: AiFrontierNotionRequest = async (path, options) => {
    const method = options?.method ?? "GET"
    if (method === "GET") {
      if (responseOverride !== undefined) return responseOverride
      return { id: AI_FRONTIER_EPISODES_DB_ID, properties: { ...state } }
    }
    if (method === "PATCH") {
      const body = JSON.parse(String(options?.body ?? "null")) as Record<string, unknown>
      patches.push({ path, body })
      const properties = body.properties as Record<string, unknown> | undefined
      for (const [name, definition] of Object.entries(properties ?? {})) {
        state[name] = { type: propertyType(definition) }
      }
      return { id: AI_FRONTIER_EPISODES_DB_ID, properties: { ...state } }
    }
    throw new Error(`mock: 허용되지 않은 메서드 ${method}`)
  }
  return { request, patches, properties: () => ({ ...state }) }
}

describe("Frontier Episodes 스키마 마이그레이터", () => {
  beforeEach(() => {
    // 셸에 실제 DB id가 있어도 테스트가 흔들리지 않도록 고정한다.
    vi.stubEnv("NOTION_AI_FRONTIER_EPISODES_DB_ID", "")
  })

  it("기본 모드는 dry-run이며 추가 2건을 계획하고 쓰기를 하지 않는다", async () => {
    const notion = mockNotion(baseProperties())

    const result = await migrateAiFrontierEpisodesSchema({ request: notion.request })

    expect(result.mode).toBe("dryRun")
    expect(result.databaseId).toBe(AI_FRONTIER_EPISODES_DB_ID)
    expect(result.planned).toEqual([
      { property: "Source", expectedType: "select" },
      { property: "Source Key", expectedType: "rich_text" },
    ])
    expect(result.applied).toEqual([])
    expect(result.unchanged).toEqual([])
    expect(result.conflicts).toEqual([])
    expect(result.writes).toBe(0)
    // 보고값과 별개로 실제 변이 횟수를 증명한다.
    expect(notion.patches).toHaveLength(0)
    expect(notion.properties()).toEqual(baseProperties())
  })

  it("apply 모드는 누락된 두 속성만 담은 PATCH 1건을 보낸다", async () => {
    const notion = mockNotion(baseProperties())

    const result = await migrateAiFrontierEpisodesSchema({
      mode: "apply",
      request: notion.request,
    })

    expect(result.mode).toBe("apply")
    expect(result.applied).toEqual([
      { property: "Source", expectedType: "select" },
      { property: "Source Key", expectedType: "rich_text" },
    ])
    expect(result.conflicts).toEqual([])
    expect(result.writes).toBe(1)
    expect(notion.patches).toHaveLength(1)
    expect(notion.patches[0].path).toBe(`/databases/${AI_FRONTIER_EPISODES_DB_ID}`)
    expect(Object.keys(notion.patches[0].body)).toEqual(["properties"])
    const patched = notion.patches[0].body.properties as Record<string, unknown>
    expect(Object.keys(patched)).toEqual(["Source", "Source Key"])
    expect(patched["Source Key"]).toEqual({ rich_text: {} })
    expect(patched.Source).toEqual({
      select: {
        options: [
          { name: "ai-frontier", color: "blue" },
          { name: "dwarkesh", color: "purple" },
        ],
      },
    })
  })

  it("이미 마이그레이션된 스키마에 apply를 반복해도 쓰기가 0이다", async () => {
    const notion = mockNotion(baseProperties())

    const first = await migrateAiFrontierEpisodesSchema({
      mode: "apply",
      request: notion.request,
    })
    const second = await migrateAiFrontierEpisodesSchema({
      mode: "apply",
      request: notion.request,
    })

    expect(first.writes).toBe(1)
    expect(second.planned).toEqual([])
    expect(second.applied).toEqual([])
    expect(second.unchanged).toEqual([
      { property: "Source", expectedType: "select" },
      { property: "Source Key", expectedType: "rich_text" },
    ])
    expect(second.writes).toBe(0)
    expect(notion.patches).toHaveLength(1)
  })

  it("기존 select 옵션이 달라도 타입이 맞으면 덮어쓰지 않는다", async () => {
    const notion = mockNotion({
      ...baseProperties(),
      Source: { type: "select" },
      "Source Key": { type: "rich_text" },
    })

    const result = await migrateAiFrontierEpisodesSchema({
      mode: "apply",
      request: notion.request,
    })

    expect(result.unchanged).toHaveLength(2)
    expect(result.writes).toBe(0)
    expect(notion.patches).toHaveLength(0)
  })

  it("Source가 rich_text면 타입 충돌을 보고하고 apply에서도 쓰기를 하지 않는다", async () => {
    const notion = mockNotion({ ...baseProperties(), Source: { type: "rich_text" } })

    const result = await migrateAiFrontierEpisodesSchema({
      mode: "apply",
      request: notion.request,
    })

    expect(result.conflicts).toEqual([
      { property: "Source", expectedType: "select", actualType: "rich_text" },
    ])
    expect(result.applied).toEqual([])
    expect(result.planned).toEqual([{ property: "Source Key", expectedType: "rich_text" }])
    expect(result.writes).toBe(0)
    expect(notion.patches).toHaveLength(0)
    expect(notion.properties().Source).toEqual({ type: "rich_text" })
  })

  it("Source Key가 multi_select면 타입 충돌로 막는다", async () => {
    const notion = mockNotion({
      ...baseProperties(),
      Source: { type: "select" },
      "Source Key": { type: "multi_select" },
    })

    const result = await migrateAiFrontierEpisodesSchema({
      mode: "apply",
      request: notion.request,
    })

    expect(result.conflicts).toEqual([
      { property: "Source Key", expectedType: "rich_text", actualType: "multi_select" },
    ])
    expect(result.writes).toBe(0)
    expect(notion.patches).toHaveLength(0)
  })

  it.each([
    ["null 응답", null],
    ["properties 누락", { id: AI_FRONTIER_EPISODES_DB_ID }],
    ["properties가 배열", { id: AI_FRONTIER_EPISODES_DB_ID, properties: [] }],
    ["type 누락", { id: AI_FRONTIER_EPISODES_DB_ID, properties: { Source: {} } }],
  ])("망가진 스키마 응답(%s)은 타입 오류로 실패하고 쓰기를 하지 않는다", async (_label, payload) => {
    const notion = mockNotion(baseProperties(), payload)

    await expect(
      migrateAiFrontierEpisodesSchema({ mode: "apply", request: notion.request })
    ).rejects.toBeInstanceOf(AiFrontierSchemaError)
    expect(notion.patches).toHaveLength(0)
  })

  it("databaseId 옵션을 주면 해당 데이터베이스만 읽고 쓴다", async () => {
    const notion = mockNotion(baseProperties())
    const databaseId = "99998888-7777-6666-5555-444433332222"

    const result = await migrateAiFrontierEpisodesSchema({
      mode: "apply",
      databaseId,
      request: notion.request,
    })

    expect(result.databaseId).toBe(databaseId)
    expect(notion.patches[0].path).toBe(`/databases/${databaseId}`)
  })
})
