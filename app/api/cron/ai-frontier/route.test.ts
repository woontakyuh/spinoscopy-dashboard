import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createAiFrontierCronHandler } from "./route"

const originalCronSecret = process.env.CRON_SECRET

afterEach(() => {
  if (originalCronSecret === undefined) {
    delete process.env.CRON_SECRET
  } else {
    process.env.CRON_SECRET = originalCronSecret
  }
})

describe("AI Frontier cron", () => {
  it("CRON_SECRET 인증이 없으면 동기화를 실행하지 않는다", async () => {
    process.env.CRON_SECRET = "cron-secret"
    const runSync = vi.fn(async () => ({
      catalog: 109,
      created: 1,
      updated: 0,
      unchanged: 108,
    }))
    const handler = createAiFrontierCronHandler(runSync)

    const response = await handler(new NextRequest(
      "http://localhost/api/cron/ai-frontier"
    ))

    expect(response.status).toBe(401)
    expect(runSync).not.toHaveBeenCalled()
  })

  it("Vercel cron 인증으로 카탈로그를 Notion에 동기화한다", async () => {
    process.env.CRON_SECRET = "cron-secret"
    const runSync = vi.fn(async () => ({
      catalog: 109,
      created: 1,
      updated: 0,
      unchanged: 108,
    }))
    const handler = createAiFrontierCronHandler(runSync)

    const response = await handler(new NextRequest(
      "http://localhost/api/cron/ai-frontier",
      { headers: { Authorization: "Bearer cron-secret" } }
    ))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      catalog: 109,
      created: 1,
      updated: 0,
      unchanged: 108,
    })
    expect(runSync).toHaveBeenCalledOnce()
  })
})
