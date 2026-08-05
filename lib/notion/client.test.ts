import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { notionEnv, notionRequest } from "./client"

const KEY = "NOTION_TEST_DB_ID"

describe("notionEnv", () => {
  afterEach(() => {
    delete process.env[KEY]
  })

  // 2026-08-05 실제 사고: Vercel 대시보드에 값을 붙여넣을 때 끝에 개행이 섞여
  // Notion이 database_id uuid 검증에서 400을 뱉었다. 같은 사고가 또 나도 안 죽게 한다.
  it("값 끝의 개행을 제거한다", () => {
    process.env[KEY] = "307908af-25b9-80fa-84b7-e7b662b3160a\n"
    expect(notionEnv(KEY)).toBe("307908af-25b9-80fa-84b7-e7b662b3160a")
  })

  it("앞뒤 공백·탭·CR 도 제거한다", () => {
    process.env[KEY] = " \t307908af\r\n "
    expect(notionEnv(KEY)).toBe("307908af")
  })

  it("미설정이면 빈 문자열을 준다", () => {
    expect(notionEnv(KEY)).toBe("")
  })
})

describe("notionRequest", () => {
  const fetchMock = vi.fn()
  let prevToken: string | undefined

  beforeEach(() => {
    prevToken = process.env.NOTION_TOKEN
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (prevToken === undefined) delete process.env.NOTION_TOKEN
    else process.env.NOTION_TOKEN = prevToken
  })

  // 개행이 섞인 토큰은 Authorization 헤더로 들어가는 순간 fetch가 던진다.
  it("토큰 끝의 개행을 제거해 헤더에 넣는다", async () => {
    process.env.NOTION_TOKEN = "ntn_secret\n"
    await notionRequest("/pages/abc")
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer ntn_secret")
  })
})
