import { describe, expect, it, vi } from "vitest"

import { createNonceReplayGuard, signLoGatewayRequest } from "./contract"
import { handleLoGatewayRequest } from "./server"

const secret = "test-gateway-secret"
const now = new Date("2026-08-04T12:00:00.000Z")

function signedRequest(body: string, nonce = "gateway-server-nonce-001"): {
  headers: Record<string, string>
  body: string
} {
  const timestamp = "1785844800"
  return {
    body,
    headers: {
      "x-lo-timestamp": timestamp,
      "x-lo-nonce": nonce,
      "x-lo-signature": signLoGatewayRequest({ secret, body, timestamp, nonce }),
    },
  }
}

describe("Lo localhost gateway request handler", () => {
  it("authenticates a bounded tool call before dispatching it", async () => {
    const body = JSON.stringify({ name: "lo.profile.get", input: {} })
    const executeTool = vi.fn().mockResolvedValue({
      tool: "lo.profile.get",
      data: { pageId: "profile-1" },
      citations: [{ id: "notion:profile:profile-1" }],
    })

    const response = await handleLoGatewayRequest({
      method: "POST",
      path: "/v1/tools",
      ...signedRequest(body),
    }, {
      secret,
      now: () => now,
      replayGuard: createNonceReplayGuard({ now: () => now }),
      service: { executeTool },
    })

    expect(response).toEqual({
      status: 200,
      body: {
        tool: "lo.profile.get",
        data: { pageId: "profile-1" },
        citations: [{ id: "notion:profile:profile-1" }],
      },
    })
    expect(executeTool).toHaveBeenCalledWith({ name: "lo.profile.get", input: {} })
  })

  it("runs a signed Hermes conversation through the supplied adapter", async () => {
    const input = {
      message: "하프가드 우선순위 알려줘",
      surface: "hermes",
      contextKey: "telegram:chat-1",
      externalTurnId: "telegram:update-1",
    } as const
    const body = JSON.stringify(input)
    const respond = vi.fn().mockResolvedValue("언더훅부터 잡아.")

    const response = await handleLoGatewayRequest({
      method: "POST",
      path: "/v1/conversation",
      ...signedRequest(body, "gateway-conversation-nonce-01"),
    }, {
      secret,
      now: () => now,
      replayGuard: createNonceReplayGuard({ now: () => now }),
      service: { executeTool: vi.fn() },
      conversation: { respond },
    })

    expect(response).toEqual({ status: 200, body: { answer: "언더훅부터 잡아." } })
    expect(respond).toHaveBeenCalledWith(input)
  })

  it("requires scoped turn metadata and rejects a client-supplied transcript", async () => {
    const body = JSON.stringify({ messages: [{ role: "user", content: "하프가드" }] })
    const respond = vi.fn()

    const response = await handleLoGatewayRequest({
      method: "POST",
      path: "/v1/conversation",
      ...signedRequest(body, "gateway-no-transcript-nonce-01"),
    }, {
      secret,
      now: () => now,
      replayGuard: createNonceReplayGuard({ now: () => now }),
      service: { executeTool: vi.fn() },
      conversation: { respond },
    })

    expect(response).toEqual({ status: 400, body: { error: "Invalid conversation input" } })
    expect(respond).not.toHaveBeenCalled()
  })

  it("lists and approves memory candidates only through signed requests", async () => {
    const candidate = {
      candidateId: "candidate-1",
      status: "pending",
      content: "언더훅을 먼저 잡는다",
    }
    const list = vi.fn().mockReturnValue([candidate])
    const approve = vi.fn().mockResolvedValue({ ...candidate, status: "approved" })
    const candidates = { list, approve, reject: vi.fn() }

    const listed = await handleLoGatewayRequest({
      method: "POST",
      path: "/v1/memory-candidates",
      ...signedRequest(JSON.stringify({ action: "list" }), "candidate-list-nonce"),
    }, {
      secret,
      now: () => now,
      replayGuard: createNonceReplayGuard({ now: () => now }),
      service: { executeTool: vi.fn() },
      candidates,
    })
    const approved = await handleLoGatewayRequest({
      method: "POST",
      path: "/v1/memory-candidates",
      ...signedRequest(
        JSON.stringify({ action: "approve", candidateId: "candidate-1" }),
        "candidate-approve-nonce",
      ),
    }, {
      secret,
      now: () => now,
      replayGuard: createNonceReplayGuard({ now: () => now }),
      service: { executeTool: vi.fn() },
      candidates,
    })

    expect(listed).toEqual({ status: 200, body: { candidates: [candidate] } })
    expect(approved).toEqual({
      status: 200,
      body: { candidate: { ...candidate, status: "approved" } },
    })
    expect(approve).toHaveBeenCalledWith("candidate-1")
  })

  it("rejects unsigned and replayed calls without dispatching a tool", async () => {
    const body = JSON.stringify({ name: "lo.profile.get", input: {} })
    const executeTool = vi.fn()
    const options = {
      secret,
      now: () => now,
      replayGuard: createNonceReplayGuard({ now: () => now }),
      service: { executeTool },
    }

    const unsigned = await handleLoGatewayRequest({ method: "POST", path: "/v1/tools", headers: {}, body }, options)
    expect(unsigned).toEqual({ status: 401, body: { error: "Unauthorized" } })

    const request = { method: "POST" as const, path: "/v1/tools", ...signedRequest(body, "gateway-server-nonce-002") }
    executeTool.mockResolvedValue({ tool: "lo.profile.get", data: {}, citations: [] })
    expect((await handleLoGatewayRequest(request, options)).status).toBe(200)
    expect(await handleLoGatewayRequest(request, options)).toEqual({ status: 401, body: { error: "Unauthorized" } })
    expect(executeTool).toHaveBeenCalledTimes(1)
  })

  it("exposes only a local health endpoint and rejects unrecognized routes", async () => {
    const response = await handleLoGatewayRequest({ method: "GET", path: "/health", headers: {}, body: "" }, {
      secret,
      now: () => now,
      replayGuard: createNonceReplayGuard({ now: () => now }),
      service: { executeTool: vi.fn() },
    })
    expect(response).toMatchObject({ status: 200, body: { status: "ok" } })

    const unknown = await handleLoGatewayRequest({ method: "GET", path: "/anything", headers: {}, body: "" }, {
      secret,
      now: () => now,
      replayGuard: createNonceReplayGuard({ now: () => now }),
      service: { executeTool: vi.fn() },
    })
    expect(unknown).toEqual({ status: 404, body: { error: "Not found" } })
  })
})
