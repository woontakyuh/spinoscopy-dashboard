import { readFile } from "node:fs/promises"

import { describe, expect, it, vi } from "vitest"

import { callHermesLoGateway } from "./hermes-client"

const secret = "test-gateway-secret"
const timestamp = "1785844800"
const nonce = "hermes-client-nonce-0001"

describe("Hermes Lo loopback client", () => {
  it("makes one signed loopback conversation request, formats the answer, and never starts a Telegram poller", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        answer: "언더훅부터 잡아. [citation:notion:memory:memory-1]",
      }),
    })

    await expect(callHermesLoGateway("하프가드 우선순위 알려줘", {
      secret,
      now: () => new Date("2026-08-04T12:00:00.000Z"),
      nonce: () => nonce,
      fetchImpl,
    })).resolves.toBe("언더훅부터 잡아.")

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, request] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("http://127.0.0.1:4318/v1/conversation")
    expect(url).not.toContain("telegram")
    expect(request.method).toBe("POST")
    expect(request.body).toBe(JSON.stringify({
      message: "하프가드 우선순위 알려줘",
      surface: "hermes",
      contextKey: "hermes:default",
      externalTurnId: `hermes:${nonce}`,
    }))
    expect(request.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Lo-Timestamp": timestamp,
      "X-Lo-Nonce": nonce,
      "X-Lo-Signature": expect.stringMatching(/^sha256=[a-f0-9]{64}$/),
    })
  })

  it("contains no polling or child-process capability", async () => {
    const source = await readFile(new URL("./hermes-client.ts", import.meta.url), "utf8")

    expect(source).not.toContain("node:child_process")
    expect(source).not.toContain("getUpdates")
    expect(source).not.toContain("telegram.org")
  })

  it("rejects empty messages and never makes a network request", async () => {
    const fetchImpl = vi.fn()

    await expect(callHermesLoGateway("   ", { secret, fetchImpl }))
      .rejects.toThrow(/message/i)

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("sends signed conversation metadata through an HTTPS Access endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ answer: "프레임부터 세워." }),
    })

    await callHermesLoGateway("최근 대화를 이어서 코칭해줘", {
      secret,
      baseUrl: "https://lo-gateway.example.com",
      access: {
        clientId: "access-client-id",
        clientSecret: "access-client-secret",
      },
      turn: {
        surface: "dashboard",
        contextKey: "dashboard:conversation-1",
        externalTurnId: "turn-1",
      },
      now: () => new Date("2026-08-04T12:00:00.000Z"),
      nonce: () => nonce,
      fetchImpl,
    })

    const [url, request] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://lo-gateway.example.com/v1/conversation")
    expect(request.body).toBe(JSON.stringify({
      message: "최근 대화를 이어서 코칭해줘",
      surface: "dashboard",
      contextKey: "dashboard:conversation-1",
      externalTurnId: "turn-1",
    }))
    expect(request.headers).toMatchObject({
      "CF-Access-Client-Id": "access-client-id",
      "CF-Access-Client-Secret": "access-client-secret",
      "X-Lo-Signature": expect.stringMatching(/^sha256=[a-f0-9]{64}$/),
    })
  })

  it("rejects an insecure non-loopback gateway URL", async () => {
    await expect(callHermesLoGateway("질문", {
      secret,
      baseUrl: "http://lo-gateway.example.com",
    })).rejects.toThrow(/HTTPS/i)
  })
})
