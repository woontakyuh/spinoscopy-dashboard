import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { getArticleMock, saveJournalAiTextMock } = vi.hoisted(() => ({
  getArticleMock: vi.fn(),
  saveJournalAiTextMock: vi.fn(),
}))

vi.mock("@/lib/notion/journal", () => ({
  getArticle: getArticleMock,
  saveJournalAiText: saveJournalAiTextMock,
}))

import { POST } from "./route"

const pageId = "page-1"

function request(mode: "translate" | "summarize"): NextRequest {
  return new NextRequest("http://localhost/api/notion/journal/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pageId,
      abstract: "Minimally invasive surgery improved pain without major complications.",
      mode,
    }),
  })
}

function groqResponse(content: string): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content } }],
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

beforeEach(() => {
  getArticleMock.mockReset()
  saveJournalAiTextMock.mockReset()
  getArticleMock.mockResolvedValue({ translation: "", summary: "" })
  saveJournalAiTextMock.mockResolvedValue(undefined)
  vi.stubEnv("GROQ_API_KEY", "test-key")
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("POST /api/notion/journal/translate", () => {
  it("returns a cached Notion translation without calling Groq", async () => {
    getArticleMock.mockResolvedValue({ translation: "노션에 저장된 번역", summary: "" })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(request("translate"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      translation: "노션에 저장된 번역",
      cached: true,
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(saveJournalAiTextMock).not.toHaveBeenCalled()
  })

  it("returns a cached Notion summary without calling Groq", async () => {
    getArticleMock.mockResolvedValue({ translation: "", summary: "노션에 저장된 요약" })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(request("summarize"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      summary: "노션에 저장된 요약",
      cached: true,
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(saveJournalAiTextMock).not.toHaveBeenCalled()
  })

  it("uses the active Groq model and saves a new translation to Notion", async () => {
    const fetchMock = vi.fn().mockResolvedValue(groqResponse("최소 침습 수술은 통증을 개선했다."))
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(request("translate"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      translation: "최소 침습 수술은 통증을 개선했다.",
      cached: false,
    })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    const payload = JSON.parse(String(init?.body)) as { model?: string }
    expect(payload.model).toBe("openai/gpt-oss-20b")
    expect(saveJournalAiTextMock).toHaveBeenCalledWith(
      pageId,
      "translate",
      "최소 침습 수술은 통증을 개선했다."
    )
  })

  it("reserves enough tokens and saves a new summary to Notion", async () => {
    const fetchMock = vi.fn().mockResolvedValue(groqResponse("최소 침습 수술은 큰 합병증 없이 통증을 개선했다."))
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(request("summarize"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      summary: "최소 침습 수술은 큰 합병증 없이 통증을 개선했다.",
      cached: false,
    })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    const payload = JSON.parse(String(init?.body)) as { model?: string; max_tokens?: number }
    expect(payload.model).toBe("openai/gpt-oss-20b")
    expect(payload.max_tokens).toBe(500)
    expect(saveJournalAiTextMock).toHaveBeenCalledWith(
      pageId,
      "summarize",
      "최소 침습 수술은 큰 합병증 없이 통증을 개선했다."
    )
  })
})
