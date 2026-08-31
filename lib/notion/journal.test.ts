import { beforeEach, describe, expect, it, vi } from "vitest"

const { notionRequestMock } = vi.hoisted(() => ({
  notionRequestMock: vi.fn(),
}))

vi.mock("./client", () => ({
  notionEnv: vi.fn(() => "test-journal-db"),
  notionRequest: notionRequestMock,
}))

import { queryArticles, saveJournalAiText } from "./journal"

describe("queryArticles", () => {
  beforeEach(() => {
    notionRequestMock.mockReset()
  })

  it("Notion 날짜에 시간이 포함돼도 날짜 부분만 반환한다", async () => {
    // Given
    notionRequestMock.mockResolvedValue({
      results: [
        {
          id: "letter-1",
          url: "https://notion.so/letter-1",
          properties: {
            Title: {
              type: "title",
              title: [{ plain_text: "Letter to the Editor" }],
            },
            "Publication Date": {
              type: "date",
              date: {
                start: "2026-09-01T00:00:00.000+00:00",
                end: null,
              },
            },
          },
        },
      ],
      has_more: false,
      next_cursor: null,
    })

    // When
    const result = await queryArticles({ sort: "date_desc" })

    // Then
    expect(result.articles[0]?.pub_date).toBe("2026-09-01")
  })
})


describe("saveJournalAiText", () => {
  beforeEach(() => {
    notionRequestMock.mockReset()
    notionRequestMock.mockResolvedValue({})
  })

  it.each([
    ["translate", "한글 번역"],
    ["summarize", "Summary"],
  ] as const)("stores %s results in the %s rich-text property", async (mode, property) => {
    await saveJournalAiText("page-1", mode, "저장할 결과")

    expect(notionRequestMock).toHaveBeenCalledWith("/pages/page-1", {
      method: "PATCH",
      body: JSON.stringify({
        properties: {
          [property]: {
            rich_text: [{ type: "text", text: { content: "저장할 결과" } }],
          },
        },
      }),
    })
  })
})
