import { beforeEach, describe, expect, it, vi } from "vitest"

const { notionRequestMock } = vi.hoisted(() => ({
  notionRequestMock: vi.fn(),
}))

vi.mock("./client", () => ({
  notionRequest: notionRequestMock,
}))

import { getMemoryProvenanceLabel, getSharedCoreMemoryDigest } from "./dakotaMemoryV2"

function page(category: string, name: string, content: string, importance = "4", source = "chat") {
  return {
    id: `${category}-${name}`,
    url: "https://notion.so/test",
    created_time: "2026-08-12T00:00:00.000Z",
    last_edited_time: "2026-08-12T00:00:00.000Z",
    properties: {
      Name: { type: "title", title: [{ plain_text: name }] },
      Category: { type: "select", select: { name: category } },
      Content: { type: "rich_text", rich_text: [{ plain_text: content }] },
      Importance: { type: "select", select: { name: importance } },
      Source: { type: "select", select: { name: source } },
      Status: { type: "select", select: { name: "active" } },
    },
  }
}

describe("getSharedCoreMemoryDigest", () => {
  beforeEach(() => {
    process.env.NOTION_DAKOTA_MEMORY_DB_ID = "test-memory-db"
    notionRequestMock.mockReset()
    notionRequestMock.mockImplementation(async (_path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      const filters = body.filter.and ?? [body.filter]
      const categoryFilter = filters.find((filter: { property?: string }) => filter.property === "Category")
      const category = categoryFilter?.select?.equals ?? "unknown"
      const rows = category === "rule"
        ? [page("rule", "멀티채널 동일 페르소나 규칙", "모든 표면에서 같은 Dakota가 공통기억을 사용한다.", "5")]
        : category === "project"
          ? [page("project", "KSOR flagship", "2026-27 메인 게임은 KSOR이다.", "5")]
          : []
      return { results: rows, has_more: false, next_cursor: null }
    })
  })

  it("최근 transcript/event row에 밀리지 않도록 shared category별 Notion query를 직접 수행한다", async () => {
    const digest = await getSharedCoreMemoryDigest()

    expect(digest).toContain("멀티채널 동일 페르소나 규칙")
    expect(digest).toContain("KSOR flagship")
    expect(notionRequestMock).toHaveBeenCalledTimes(5)

    const queriedCategories = notionRequestMock.mock.calls.map((call: unknown[]) => {
      const init = call[1] as RequestInit
      const body = JSON.parse(String(init.body))
      const filters = body.filter.and ?? [body.filter]
      const categoryFilter = filters.find((filter: { property?: string }) => filter.property === "Category")
      return categoryFilter?.select?.equals
    }).sort()
    expect(queriedCategories).toEqual(["person", "preference", "profile", "project", "rule"])
  })

  it("공통 digest에 source provenance를 포함한다", async () => {
    const digest = await getSharedCoreMemoryDigest()

    expect(digest).toContain("[provenance: legacy record · original platform unrecorded]")
  })
})

describe("getMemoryProvenanceLabel", () => {
  it("runtime/surface source를 사람이 읽을 수 있는 provenance로 바꾼다", () => {
    expect(getMemoryProvenanceLabel("orchestrator:event:dakota:telegram"))
      .toBe("telegram · dakota agent event")
    expect(getMemoryProvenanceLabel("shared-core:dakota"))
      .toBe("shared core · curated by dakota")
  })

  it("legacy memory의 원본 플랫폼을 추정하지 않는다", () => {
    expect(getMemoryProvenanceLabel("chat"))
      .toBe("legacy record · original platform unrecorded")
    expect(getMemoryProvenanceLabel("agent:lo:session"))
      .toBe("lo agent · legacy session (original platform unrecorded)")
  })
})
