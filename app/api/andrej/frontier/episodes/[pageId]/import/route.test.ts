import { describe, expect, it, vi } from "vitest"

import {
  AiFrontierImportConflictError,
  AiFrontierImportError,
  AiFrontierImportNotFoundError,
} from "@/lib/andrej/frontier-import"

import { createFrontierImportHandler } from "./route"

const pageId = "3b2908af-25b9-8103-9425-d71f0a74404e"
const context = (value: string) => ({ params: Promise.resolve({ pageId: value }) })

describe("POST /api/andrej/frontier/episodes/[pageId]/import", () => {
  it("Episode 자료 수집 결과를 반환한다", async () => {
    const run = vi.fn(async () => ({
      pageId,
      episodeNumber: 87,
      status: "완료" as const,
      conceptsCreated: 3,
      conceptsUpdated: 1,
    }))

    const response = await createFrontierImportHandler(run)(
      new Request("http://localhost/import", { method: "POST" }),
      context(pageId)
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      pageId,
      episodeNumber: 87,
      status: "완료",
      conceptsCreated: 3,
      conceptsUpdated: 1,
    })
    expect(run).toHaveBeenCalledWith(pageId)
  })

  it("잘못된 page id는 실행하지 않고 400을 반환한다", async () => {
    const run = vi.fn()
    const response = await createFrontierImportHandler(run)(
      new Request("http://localhost/import", { method: "POST" }),
      context("../bad")
    )

    expect(response.status).toBe(400)
    expect(run).not.toHaveBeenCalled()
  })

  it.each([
    [new AiFrontierImportNotFoundError(), 404],
    [new AiFrontierImportConflictError(), 409],
    [new AiFrontierImportError(), 502],
  ])("도메인 오류를 안전한 상태 코드로 변환한다", async (error, status) => {
    const run = vi.fn(async () => {
      throw error
    })
    const response = await createFrontierImportHandler(run)(
      new Request("http://localhost/import", { method: "POST" }),
      context(pageId)
    )

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: expect.any(String) })
  })
})
