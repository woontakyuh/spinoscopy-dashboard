import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NotionRequestError, describeError, notionEnv, notionRequest, summarizeNotionError } from "./client"

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

  it("HTTP 실패는 응답 body를 버리고 안전한 status만 담은 typed error로 만든다", async () => {
    const payload = JSON.stringify({
      object: "error",
      api_key: "sk-client-secret",
      token: "token_client_secret",
      authorization: "Bearer quoted-client-secret",
      page_id: "private-page-id",
    })
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => payload,
    })

    const request = notionRequest("/pages/private-page-id", { method: "PATCH" })

    await expect(request).rejects.toEqual(new NotionRequestError(401))
    await expect(request).rejects.not.toThrow(/sk-client-secret|private-page-id|response body/i)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.notion.com/v1/pages/private-page-id",
      expect.objectContaining({ method: "PATCH", cache: "no-store" })
    )
  })

  // 개행이 섞인 토큰은 Authorization 헤더로 들어가는 순간 fetch가 던진다.
  it("토큰 끝의 개행을 제거해 헤더에 넣는다", async () => {
    process.env.NOTION_TOKEN = "ntn_secret\n"
    await notionRequest("/pages/abc")
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer ntn_secret")
  })
})

// 2026-10-11: 스키마 크기 초과로 4일간 쓰기가 전부 죽었는데 로그엔 "request failed" 뿐이었다.
describe("Notion 거절 사유", () => {
  const schemaFull = JSON.stringify({
    object: "error",
    status: 400,
    code: "validation_error",
    message: "Your database schema has exceeded the maximum size. The largest property is 'Keywords'.",
    request_id: "x",
  })

  it("code·message 만 뽑는다", () => {
    expect(summarizeNotionError(schemaFull)).toEqual({
      code: "validation_error",
      message: "Your database schema has exceeded the maximum size. The largest property is 'Keywords'.",
    })
  })

  it("message 속 토큰 모양 문자열은 가린다", () => {
    const body = JSON.stringify({ object: "error", code: "unauthorized", message: "bad token ntn_abcdef123456 here" })
    expect(summarizeNotionError(body).message).toBe("bad token [redacted] here")
  })

  it("Notion 에러 형식이 아니면 아무것도 안 뽑는다", () => {
    expect(summarizeNotionError("<html>gateway</html>")).toEqual({})
    expect(summarizeNotionError(JSON.stringify({ message: "x" }))).toEqual({})
  })

  it("describeError 는 상태·사유를 한 줄로 보여준다", () => {
    expect(describeError(new NotionRequestError(400, "validation_error", "schema too big"))).toBe(
      "Notion 요청 실패(400) — validation_error: schema too big"
    )
    expect(describeError(new NotionRequestError(502))).toBe("Notion 요청 실패(502)")
    expect(describeError(new Error("DOI 없음"))).toBe("DOI 없음")
  })

  it("notionRequest 가 사유를 에러에 싣는다(메시지 자체는 그대로)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => schemaFull }))
    const err = (await notionRequest("/pages").catch((e: unknown) => e)) as NotionRequestError
    vi.unstubAllGlobals()
    expect(err).toBeInstanceOf(NotionRequestError)
    expect(err.message).toBe("Notion API request failed.")
    expect(err.notionCode).toBe("validation_error")
    expect(err.notionMessage).toMatch(/exceeded the maximum size/)
  })
})
